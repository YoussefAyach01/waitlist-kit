import type { DatabaseSync } from "node:sqlite";
import { UNKNOWN_IP, getList, join, normalizeEmail, statusByCode, type Waitlist } from "./waitlist";
import { hashIp } from "./session";
import type { RateLimiter } from "./ratelimit";

export interface Deps {
  db: DatabaseSync;
  limiters: { joinPerList: RateLimiter; joinPerIp: RateLimiter };
}

const MAX_BODY = 4_000;

function cors(
  list: Waitlist | null,
  origin: string | null,
  selfOrigin: string,
): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  // No cookies or credentials on these endpoints, so "*" is safe when the owner set no allowlist.
  if (!list || list.allowedOrigins.length === 0) h["Access-Control-Allow-Origin"] = "*";
  else if (origin && (list.allowedOrigins.includes(origin) || origin === selfOrigin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
  }
  return UNKNOWN_IP;
}

function originAllowed(list: Waitlist, origin: string | null, selfOrigin: string): boolean {
  if (list.allowedOrigins.length === 0) return true;
  return !!origin && (list.allowedOrigins.includes(origin) || origin === selfOrigin);
}

export function handleOptions(db: DatabaseSync, listId: string, req: Request): Response {
  const list = getList(db, listId);
  const self = new URL(req.url).origin;
  return new Response(null, { status: 204, headers: cors(list, req.headers.get("origin"), self) });
}

export async function handleJoin(req: Request, listId: string, deps: Deps): Promise<Response> {
  const { db, limiters } = deps;
  const list = getList(db, listId);
  const origin = req.headers.get("origin");
  const self = new URL(req.url).origin;
  const h = cors(list, origin, self);
  if (!list) return json({ ok: false, error: "Waitlist not found" }, 404, h);
  if (!originAllowed(list, origin, self))
    return json({ ok: false, error: "Origin not allowed" }, 403, h);

  const ip = clientIp(req);
  const ipHash = ip === UNKNOWN_IP ? UNKNOWN_IP : hashIp(ip);
  const a = limiters.joinPerIp.check(ipHash);
  const b = limiters.joinPerList.check(`${list.id}:${ipHash}`);
  if (!a.ok || !b.ok) {
    return json({ ok: false, error: "Too many attempts, try again in a minute" }, 429, {
      ...h,
      "Retry-After": String(Math.max(a.retryAfterSec, b.retryAfterSec)),
    });
  }

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "Send JSON" }, 415, h);
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: "Payload too large" }, 413, h);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Malformed JSON" }, 400, h);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ ok: false, error: "Body must be an object" }, 400, h);
  }
  const { email: rawEmail, ref, website } = body as Record<string, unknown>;

  // Honeypot: real users never fill "website"; bots get a plausible fake answer, nothing is stored.
  if (typeof website === "string" && website.trim() !== "") {
    return json({ ok: true, code: "zzzzzzzz", position: 1, referrals: 0, total: 1 }, 200, h);
  }
  const email = normalizeEmail(rawEmail);
  if (!email) return json({ ok: false, error: "Enter a valid e-mail address" }, 400, h);

  const standing = join(
    db,
    list.id,
    email,
    typeof ref === "string" ? ref.toLowerCase() : null,
    ipHash,
  );
  return json({ ok: true, ...standing }, standing.isNew ? 201 : 200, h);
}

export function handleStatus(req: Request, listId: string, deps: Deps): Response {
  const { db, limiters } = deps;
  const list = getList(db, listId);
  const origin = req.headers.get("origin");
  const self = new URL(req.url).origin;
  const h = cors(list, origin, self);
  if (!list) return json({ ok: false, error: "Waitlist not found" }, 404, h);
  if (!originAllowed(list, origin, self))
    return json({ ok: false, error: "Origin not allowed" }, 403, h);

  // Status is code-keyed and unguessable; it still gets a limit so codes can't be brute-forced.
  const rl = limiters.joinPerIp.check(`status:${hashIp(clientIp(req))}`);
  if (!rl.ok)
    return json({ ok: false, error: "Too many requests" }, 429, {
      ...h,
      "Retry-After": String(rl.retryAfterSec),
    });

  const code = new URL(req.url).searchParams.get("code") ?? "";
  const s = /^[a-z0-9]{6,16}$/.test(code) ? statusByCode(db, list.id, code) : null;
  if (!s) return json({ ok: false, error: "Unknown code" }, 404, h);
  return json({ ok: true, ...s }, 200, h);
}

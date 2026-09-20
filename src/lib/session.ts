import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "wl_session";
export const SESSION_TTL_SEC = 60 * 60 * 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (32+ chars) is required in production");
  }
  return "dev-only-secret-do-not-use-in-production-000";
}

const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSessionToken(nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SEC;
  return `${exp}.${mac(String(exp))}`;
}

export function verifySessionToken(token: string | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  const expected = Buffer.from(mac(exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(exp) > Math.floor(nowMs / 1000);
}

/** Constant-time password check (hash both sides so lengths match). */
export function passwordMatches(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Salted hash of an IP: lets us count/limit without storing raw addresses. */
export function hashIp(ip: string): string {
  return createHmac("sha256", secret()).update(ip).digest("hex").slice(0, 32);
}

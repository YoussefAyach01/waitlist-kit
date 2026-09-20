import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "@/lib/db";
import {
  createList,
  createListSchema,
  deleteEntry,
  join,
  listEntries,
  normalizeEmail,
  statusByCode,
  type Waitlist,
} from "@/lib/waitlist";
import { handleJoin, handleOptions, handleStatus, type Deps } from "@/lib/api";
import { RateLimiter } from "@/lib/ratelimit";

let db: DatabaseSync;
let list: Waitlist;

beforeEach(() => {
  db = openDb(":memory:");
  list = createList(db, createListSchema.parse({ name: "Launch" }));
});

describe("normalizeEmail", () => {
  it("lowercases and trims valid addresses", () => {
    expect(normalizeEmail("  Sara@Example.COM ")).toBe("sara@example.com");
  });
  it.each(["", "a", "a@b", "a b@c.co", "a@b.c", "<x>@y.co", "a@b.co,c@d.co", 42, null])(
    "rejects %j",
    (v) => {
      expect(normalizeEmail(v)).toBeNull();
    },
  );
  it("rejects over-long addresses", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@x.co`)).toBeNull();
  });
});

describe("join and ranking", () => {
  it("assigns positions in join order", () => {
    const a = join(db, list.id, "a@x.co", null, "ip1");
    const b = join(db, list.id, "b@x.co", null, "ip2");
    expect([a.position, b.position]).toEqual([1, 2]);
    expect(b.total).toBe(2);
    expect(a.isNew && b.isNew).toBe(true);
  });

  it("is idempotent per e-mail and returns the same code", () => {
    const a = join(db, list.id, "a@x.co", null, "ip1");
    const again = join(db, list.id, "a@x.co", null, "ip9");
    expect(again.isNew).toBe(false);
    expect(again.code).toBe(a.code);
    expect(again.total).toBe(1);
  });

  it("moves the referrer up when friends join through their code", () => {
    join(db, list.id, "first@x.co", null, "ip1");
    const second = join(db, list.id, "second@x.co", null, "ip2");
    expect(second.position).toBe(2);
    join(db, list.id, "friend@x.co", second.code, "ip3");
    expect(statusByCode(db, list.id, second.code)).toMatchObject({ position: 1, referrals: 1 });
    expect(join(db, list.id, "first@x.co", null, "ip1").position).toBe(2);
  });

  it("does not credit a referral from the same IP, or from an unknown/foreign code", () => {
    const a = join(db, list.id, "a@x.co", null, "ipA");
    join(db, list.id, "sock@x.co", a.code, "ipA");
    expect(statusByCode(db, list.id, a.code)?.referrals).toBe(0);
    join(db, list.id, "c@x.co", "nosuchcode", "ipC");
    expect(statusByCode(db, list.id, a.code)?.referrals).toBe(0);
    const other = createList(db, createListSchema.parse({ name: "Other" }));
    join(db, other.id, "d@x.co", a.code, "ipD"); // code from another list
    expect(statusByCode(db, list.id, a.code)?.referrals).toBe(0);
  });

  it("credits referrals when the client IP is unknown (no proxy configured)", () => {
    const a = join(db, list.id, "a@x.co", null, "unknown");
    join(db, list.id, "b@x.co", a.code, "unknown");
    expect(statusByCode(db, list.id, a.code)?.referrals).toBe(1);
  });

  it("breaks ties by join time", () => {
    const a = join(db, list.id, "a@x.co", null, "1");
    const b = join(db, list.id, "b@x.co", null, "2");
    join(db, list.id, "c@x.co", a.code, "3");
    join(db, list.id, "d@x.co", b.code, "4");
    expect(statusByCode(db, list.id, a.code)?.position).toBe(1);
    expect(statusByCode(db, list.id, b.code)?.position).toBe(2);
  });

  it("scopes admin deletion to the list and clears the referrer link", () => {
    const a = join(db, list.id, "a@x.co", null, "1");
    join(db, list.id, "b@x.co", a.code, "2");
    const entries = listEntries(db, list.id);
    expect(entries[1]?.referredBy).toBe("a@x.co");
    deleteEntry(db, "other-list", entries[0]?.id as number);
    expect(listEntries(db, list.id)).toHaveLength(2);
    deleteEntry(db, list.id, entries[0]?.id as number);
    expect(listEntries(db, list.id)[0]?.referredBy).toBeNull();
  });
});

const mkDeps = (over: Partial<Deps["limiters"]> = {}): Deps => ({
  db,
  limiters: {
    joinPerList: new RateLimiter(5, 60_000),
    joinPerIp: new RateLimiter(100, 60_000),
    ...over,
  },
});
const req = (body: unknown, headers: Record<string, string> = {}, raw = false) =>
  new Request("http://localhost:3220/api/w/x/join", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  });

describe("handleJoin", () => {
  it("creates (201), then returns the existing standing (200)", async () => {
    const deps = mkDeps();
    const r1 = await handleJoin(req({ email: "a@x.co" }), list.id, deps);
    expect(r1.status).toBe(201);
    const s1 = await r1.json();
    expect(s1).toMatchObject({ ok: true, position: 1, total: 1 });
    const r2 = await handleJoin(req({ email: "A@X.co" }), list.id, deps);
    expect(r2.status).toBe(200);
    expect((await r2.json()).code).toBe(s1.code);
  });

  it("validates input", async () => {
    const deps = mkDeps({ joinPerList: new RateLimiter(100, 60_000) });
    expect((await handleJoin(req({ email: "nope" }), list.id, deps)).status).toBe(400);
    expect((await handleJoin(req("{bad", {}, true), list.id, deps)).status).toBe(400);
    expect((await handleJoin(req("[1]", {}, true), list.id, deps)).status).toBe(400);
    expect((await handleJoin(req("x".repeat(5000), {}, true), list.id, deps)).status).toBe(413);
    const wrong = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "a",
    });
    expect((await handleJoin(wrong, list.id, deps)).status).toBe(415);
    expect((await handleJoin(req({ email: "a@x.co" }), "missing", deps)).status).toBe(404);
  });

  it("swallows honeypot fills without storing", async () => {
    const res = await handleJoin(
      req({ email: "bot@x.co", website: "http://spam" }),
      list.id,
      mkDeps(),
    );
    expect(res.status).toBe(200);
    expect(listEntries(db, list.id)).toHaveLength(0);
  });

  it("rate limits with Retry-After", async () => {
    const deps = mkDeps();
    for (let i = 0; i < 5; i++) await handleJoin(req({ email: `u${i}@x.co` }), list.id, deps);
    const res = await handleJoin(req({ email: "late@x.co" }), list.id, deps);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("enforces the origin allowlist but always accepts its own origin", async () => {
    const locked = createList(
      db,
      createListSchema.parse({ name: "L", allowedOrigins: ["https://site.ma/"] }),
    );
    const deps = mkDeps({ joinPerList: new RateLimiter(100, 60_000) });
    const evil = await handleJoin(
      req({ email: "a@x.co" }, { origin: "https://evil.com" }),
      locked.id,
      deps,
    );
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const ok = await handleJoin(
      req({ email: "a@x.co" }, { origin: "https://site.ma" }),
      locked.id,
      deps,
    );
    expect(ok.status).toBe(201);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://site.ma");
    const self = await handleJoin(
      req({ email: "b@x.co" }, { origin: "http://localhost:3220" }),
      locked.id,
      deps,
    );
    expect(self.status).toBe(201);
  });

  it("answers preflight with a wildcard for open lists", () => {
    const res = handleOptions(db, list.id, new Request("http://x/", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("handleStatus", () => {
  it("returns standing for a valid code and 404 otherwise", async () => {
    const deps = mkDeps();
    const s = join(db, list.id, "a@x.co", null, "1");
    const ok = handleStatus(new Request(`http://x/status?code=${s.code}`), list.id, deps);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ position: 1 });
    expect(handleStatus(new Request("http://x/status?code=zzzzzzzz"), list.id, deps).status).toBe(
      404,
    );
    expect(
      handleStatus(new Request("http://x/status?code=%27%20OR%201%3D1"), list.id, deps).status,
    ).toBe(404);
  });
});

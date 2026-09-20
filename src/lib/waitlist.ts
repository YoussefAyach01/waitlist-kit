import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { z } from "zod";

export interface Waitlist {
  id: string;
  name: string;
  allowedOrigins: string[];
  createdAt: string;
}

export interface Standing {
  code: string;
  position: number;
  referrals: number;
  total: number;
}

const originSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\/+$/, ""))
  .refine((s) => {
    try {
      const u = new URL(s);
      return (u.protocol === "https:" || u.protocol === "http:") && u.origin === s;
    } catch {
      return false;
    }
  }, "Origin must look like https://example.com (no path)");

export const createListSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  allowedOrigins: z.array(originSchema).max(20).default([]),
});

/** Lowercased, trimmed, sane e-mail or null. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  if (e.length > 254 || e.length < 3) return null;
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/.test(e) ? e : null;
}

export const UNKNOWN_IP = "unknown";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/o/1/l/i lookalikes
function newCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

interface ListRow {
  id: string;
  name: string;
  allowed_origins: string;
  created_at: string;
}
const toList = (r: ListRow): Waitlist => ({
  id: r.id,
  name: r.name,
  allowedOrigins: JSON.parse(r.allowed_origins) as string[],
  createdAt: r.created_at,
});

export function createList(db: DatabaseSync, input: z.output<typeof createListSchema>): Waitlist {
  const id = randomBytes(6).toString("base64url");
  db.prepare(
    "INSERT INTO waitlists (id, name, allowed_origins, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, input.name, JSON.stringify(input.allowedOrigins), new Date().toISOString());
  return getList(db, id) as Waitlist;
}

export function getList(db: DatabaseSync, id: string): Waitlist | null {
  const r = db.prepare("SELECT * FROM waitlists WHERE id = ?").get(id) as ListRow | undefined;
  return r ? toList(r) : null;
}

export function listLists(db: DatabaseSync): (Waitlist & { count: number })[] {
  const rows = db
    .prepare(
      "SELECT w.*, (SELECT COUNT(*) FROM entries e WHERE e.list_id = w.id) AS count FROM waitlists w ORDER BY w.created_at DESC",
    )
    .all() as unknown as (ListRow & { count: number })[];
  return rows.map((r) => ({ ...toList(r), count: r.count }));
}

export function deleteList(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM waitlists WHERE id = ?").run(id);
}

interface EntryRow {
  id: number;
  code: string;
}

/**
 * Rank = 1 + number of entries ahead. Ahead means more referrals, or equal referrals and joined earlier.
 * Referrals are the only way to move up, so the order is deterministic and explainable to users.
 */
function standingOf(db: DatabaseSync, listId: string, entry: EntryRow): Standing {
  const refs = (
    db.prepare("SELECT COUNT(*) AS n FROM entries WHERE referred_by = ?").get(entry.id) as {
      n: number;
    }
  ).n;
  const ahead = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT e.id, (SELECT COUNT(*) FROM entries r WHERE r.referred_by = e.id) AS refs
         FROM entries e WHERE e.list_id = ?
       ) x WHERE x.refs > ? OR (x.refs = ? AND x.id < ?)`,
    )
    .get(listId, refs, refs, entry.id) as { n: number };
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM entries WHERE list_id = ?").get(listId) as { n: number }
  ).n;
  return { code: entry.code, position: ahead.n + 1, referrals: refs, total };
}

export function statusByCode(db: DatabaseSync, listId: string, code: string): Standing | null {
  const e = db
    .prepare("SELECT id, code FROM entries WHERE list_id = ? AND code = ?")
    .get(listId, code) as EntryRow | undefined;
  return e ? standingOf(db, listId, e) : null;
}

/**
 * Adds an e-mail to the list. Joining twice returns the same standing (no new referral credit).
 * A referral is credited only if the code exists in this list and comes from a different IP hash,
 * which blocks the cheapest self-referral trick.
 */
export function join(
  db: DatabaseSync,
  listId: string,
  email: string,
  refCode: string | null,
  ipHash: string,
): Standing & { isNew: boolean } {
  const existing = db
    .prepare("SELECT id, code FROM entries WHERE list_id = ? AND email = ?")
    .get(listId, email) as EntryRow | undefined;
  if (existing) return { ...standingOf(db, listId, existing), isNew: false };

  let referrerId: number | null = null;
  if (refCode && /^[a-z0-9]{6,16}$/.test(refCode)) {
    const ref = db
      .prepare("SELECT id, ip_hash FROM entries WHERE list_id = ? AND code = ?")
      .get(listId, refCode) as { id: number; ip_hash: string } | undefined;
    // With no trusted client IP ("unknown") the same-IP check would block every referral, so skip it.
    if (ref && (ipHash === UNKNOWN_IP || ref.ip_hash !== ipHash)) referrerId = ref.id;
  }

  const code = newCode();
  const res = db
    .prepare(
      "INSERT INTO entries (list_id, email, code, referred_by, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(listId, email, code, referrerId, ipHash, new Date().toISOString());
  return { ...standingOf(db, listId, { id: Number(res.lastInsertRowid), code }), isNew: true };
}

export interface EntryView {
  id: number;
  email: string;
  code: string;
  referrals: number;
  referredBy: string | null;
  createdAt: string;
}

export function listEntries(db: DatabaseSync, listId: string, limit = 5000): EntryView[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.email, e.code, e.created_at,
         (SELECT COUNT(*) FROM entries r WHERE r.referred_by = e.id) AS referrals,
         (SELECT p.email FROM entries p WHERE p.id = e.referred_by) AS referred_by
       FROM entries e WHERE e.list_id = ? ORDER BY e.id ASC LIMIT ?`,
    )
    .all(listId, limit) as unknown as {
    id: number;
    email: string;
    code: string;
    created_at: string;
    referrals: number;
    referred_by: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    code: r.code,
    referrals: r.referrals,
    referredBy: r.referred_by,
    createdAt: r.created_at,
  }));
}

export function deleteEntry(db: DatabaseSync, listId: string, id: number): void {
  db.prepare("DELETE FROM entries WHERE id = ? AND list_id = ?").run(id, listId);
}

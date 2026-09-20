import type { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

// node:sqlite is loaded at runtime (not `import`) so the Next bundler never tries to resolve it.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS waitlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  allowed_origins TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id TEXT NOT NULL REFERENCES waitlists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  referred_by INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (list_id, email)
);
CREATE INDEX IF NOT EXISTS idx_entries_referrer ON entries(referred_by);
`;

export function openDb(file: string): DatabaseSync {
  const sqlite = process.getBuiltinModule("node:sqlite");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new sqlite.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

const g = globalThis as unknown as { __waitlistDb?: DatabaseSync };

/** Single shared connection (survives dev hot reloads). */
export function getDb(): DatabaseSync {
  g.__waitlistDb ??= openDb(process.env.DATABASE_PATH ?? "data/waitlist-kit.db");
  return g.__waitlistDb;
}

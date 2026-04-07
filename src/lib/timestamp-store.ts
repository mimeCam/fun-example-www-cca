// src/lib/timestamp-store.ts
// DB layer for RFC 3161 TimeStampToken storage.
// Adds tst_token / tst_at / tsa_name columns to conviction_ledger via migration.
// Uses its own SQLite connection to the same revivals.db (WAL mode — safe).
// Follows the same singleton pattern as conviction-ledger.ts and verdict-resolver.ts.
//
// Credits: Mike (arch §timestamp-store)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TstData {
  tst_token: string;   // base64-encoded DER TimeStampToken
  tst_at:    number;   // Unix ms timestamp when TST was received
  tsa_name:  string;   // e.g. 'FreeTSA.org'
}

// ---------------------------------------------------------------------------
// DB singleton — same revivals.db, separate connection (WAL handles concurrency)
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  _db = new Database(resolve(dir, 'revivals.db'));
  _db.pragma('journal_mode = WAL');
  migrate(_db);
  return _db;
}

/** Add RFC 3161 columns to conviction_ledger — safe to run on every startup. */
function migrate(d: Database.Database): void {
  const cols = ['tst_token TEXT', 'tst_at INTEGER', 'tsa_name TEXT'];
  for (const col of cols) {
    try { d.exec(`ALTER TABLE conviction_ledger ADD COLUMN ${col} DEFAULT NULL`); }
    catch { /* column already exists — safe to ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/**
 * Persist a TST against the ledger row identified by chain hash.
 * Called after stamp() succeeds in conviction-seal and verdict-resolve APIs.
 */
export function storeTst(hash: string, token: string, tsaName: string): void {
  db().prepare(
    'UPDATE conviction_ledger SET tst_token = ?, tst_at = ?, tsa_name = ? WHERE hash = ?',
  ).run(token, Date.now(), tsaName, hash);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** TST for a slug's conviction seal row. Null if not yet stamped. */
export function getTstForSeal(slug: string): TstData | null {
  const row = db().prepare(
    "SELECT tst_token, tst_at, tsa_name FROM conviction_ledger " +
    "WHERE post_slug = ? AND event_type = 'seal' AND tst_token IS NOT NULL LIMIT 1",
  ).get(slug) as TstData | undefined;
  return row ?? null;
}

/** TST for a slug's verdict row. Null if not yet stamped or no verdict. */
export function getTstForVerdict(slug: string): TstData | null {
  const row = db().prepare(
    "SELECT tst_token, tst_at, tsa_name FROM conviction_ledger " +
    "WHERE post_slug = ? AND event_type = 'verdict' AND tst_token IS NOT NULL LIMIT 1",
  ).get(slug) as TstData | undefined;
  return row ?? null;
}

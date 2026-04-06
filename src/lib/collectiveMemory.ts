// src/lib/collectiveMemory.ts
// SQLite-backed storage for collective revival counts.
// Only module that touches the database. Everything else stays pure.
//
// Lazy singleton: DB created on first call, reused thereafter.
// better-sqlite3 is synchronous — no connection pool, no promises, no races.

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const RATE_WINDOW_MS = 30_000;

// ---------------------------------------------------------------------------
// Lazy DB singleton
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function dbPath(): string {
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL');
  initTables(_db);
  return _db;
}

function initTables(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS revivals (
      slug  TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS rate_limit (
      ip_slug TEXT PRIMARY KEY,
      last_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limit_session (
      session_slug TEXT PRIMARY KEY,
      last_at      INTEGER NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** Batch-read all revival counts (one query for homepage). */
export function getRevivalCounts(): Map<string, number> {
  const rows = db().prepare('SELECT slug, count FROM revivals').all() as Array<{ slug: string; count: number }>;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.slug, r.count);
  return map;
}

/** Single revival count for one slug. */
export function getRevivalCount(slug: string): number {
  const row = db().prepare('SELECT count FROM revivals WHERE slug = ?').get(slug) as { count: number } | undefined;
  return row?.count ?? 0;
}

/** Most-revived post. Used by first-visit spectacle for social proof. */
export function getTopRevival(): { slug: string; count: number } {
  const row = db()
    .prepare('SELECT slug, count FROM revivals ORDER BY count DESC LIMIT 1')
    .get() as { slug: string; count: number } | undefined;
  return row ?? { slug: '', count: 0 };
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/** Atomically increment the revival count for a slug. Returns new count. */
export function incrementRevival(slug: string): number {
  const stmt = db().prepare(`
    INSERT INTO revivals (slug, count) VALUES (?, 1)
    ON CONFLICT(slug) DO UPDATE SET count = count + 1
    RETURNING count
  `);
  const row = stmt.get(slug) as { count: number } | undefined;
  return row?.count ?? 1;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** True if this IP+slug combo hasn't fired within the rate window. */
export function canRevive(ip: string, slug: string): boolean {
  const key = `${ip}:${slug}`;
  const row = db().prepare('SELECT last_at FROM rate_limit WHERE ip_slug = ?').get(key) as { last_at: number } | undefined;
  if (!row) return true;
  return Date.now() - row.last_at >= RATE_WINDOW_MS;
}

/** Stamp the rate-limit record for this IP+slug. */
export function recordRevival(ip: string, slug: string): void {
  const key = `${ip}:${slug}`;
  db().prepare(`
    INSERT INTO rate_limit (ip_slug, last_at) VALUES (?, ?)
    ON CONFLICT(ip_slug) DO UPDATE SET last_at = ?
  `).run(key, Date.now(), Date.now());
}

// ---------------------------------------------------------------------------
// Session-based rate limiting (preferred over IP when session ID is known)
// ---------------------------------------------------------------------------

/** True if this session+slug combo hasn't fired within the rate window. */
export function canReviveBySession(sessionId: string, slug: string): boolean {
  const key = `${sessionId}:${slug}`;
  const row = db()
    .prepare('SELECT last_at FROM rate_limit_session WHERE session_slug = ?')
    .get(key) as { last_at: number } | undefined;
  if (!row) return true;
  return Date.now() - row.last_at >= RATE_WINDOW_MS;
}

/** Stamp the session rate-limit record for this session+slug. */
export function recordRevivalBySession(sessionId: string, slug: string): void {
  const key = `${sessionId}:${slug}`;
  db().prepare(`
    INSERT INTO rate_limit_session (session_slug, last_at) VALUES (?, ?)
    ON CONFLICT(session_slug) DO UPDATE SET last_at = ?
  `).run(key, Date.now(), Date.now());
}

// ---------------------------------------------------------------------------
// Cleanup (optional, call periodically or on deploy)
// ---------------------------------------------------------------------------

/** Purge stale rate-limit entries older than 1 hour. */
export function pruneRateLimits(): void {
  const cutoff = Date.now() - 3_600_000;
  db().prepare('DELETE FROM rate_limit WHERE last_at < ?').run(cutoff);
  db().prepare('DELETE FROM rate_limit_session WHERE last_at < ?').run(cutoff);
}

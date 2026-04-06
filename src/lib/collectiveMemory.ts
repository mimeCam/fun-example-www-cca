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
const READING_RATE_MS = 25_000; // Accept a pulse every 25s (client fires every 30s)

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
      slug      TEXT PRIMARY KEY,
      count     INTEGER DEFAULT 0,
      risen_at  TEXT DEFAULT NULL
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
  migrateRisenAt(d);
  migrateGuardTables(d);
  migrateReadingSessions(d);
  migrateEntombedAt(d);
}

/**
 * Add reading_seconds column + rate_limit_reading table (safe to run repeatedly).
 * reading_seconds accumulates passive reading time per slug.
 */
function migrateReadingSessions(d: Database.Database): void {
  const cols = d.prepare("PRAGMA table_info('revivals')").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'reading_seconds')) {
    d.exec("ALTER TABLE revivals ADD COLUMN reading_seconds INTEGER DEFAULT 0");
  }
  d.exec(`CREATE TABLE IF NOT EXISTS rate_limit_reading (
    session_slug TEXT PRIMARY KEY,
    last_at      INTEGER NOT NULL
  );`);
}

/** Add entombed_at column if missing (safe to run repeatedly). */
function migrateEntombedAt(d: Database.Database): void {
  const cols = d.prepare("PRAGMA table_info('revivals')").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'entombed_at')) {
    d.exec("ALTER TABLE revivals ADD COLUMN entombed_at TEXT DEFAULT NULL");
  }
}

/** Add risen_at column if missing (safe to run repeatedly). */
function migrateRisenAt(d: Database.Database): void {
  const cols = d.prepare("PRAGMA table_info('revivals')").all() as Array<{ name: string }>;
  const has = cols.some(c => c.name === 'risen_at');
  if (!has) d.exec("ALTER TABLE revivals ADD COLUMN risen_at TEXT DEFAULT NULL");
}

/** Create Revival Guard tables for anti-gaming (safe to run repeatedly). */
function migrateGuardTables(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS visitor_trust (
      fp_hash    TEXT PRIMARY KEY,
      score      REAL DEFAULT 0.5,
      visits     INTEGER DEFAULT 0,
      last_at    INTEGER NOT NULL,
      first_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS velocity_log (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      ts   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_velocity_slug_ts
      ON velocity_log(slug, ts);
    CREATE TABLE IF NOT EXISTS daily_counts (
      key    TEXT PRIMARY KEY,
      count  INTEGER DEFAULT 0,
      day    TEXT NOT NULL
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

/** Resurrect a post: bump revival count by weight, set risen_at. Returns new count. */
export function resurrectPost(slug: string, weight: number): number {
  const stmt = db().prepare(`
    INSERT INTO revivals (slug, count, risen_at) VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET count = count + ?, risen_at = ?
    RETURNING count
  `);
  const now = new Date().toISOString();
  const row = stmt.get(slug, weight, now, weight, now) as { count: number } | undefined;
  return row?.count ?? weight;
}

/** Get risen_at timestamps for all posts (one query for homepage). */
export function getRisenTimestamps(): Map<string, Date> {
  const rows = db()
    .prepare('SELECT slug, risen_at FROM revivals WHERE risen_at IS NOT NULL')
    .all() as Array<{ slug: string; risen_at: string }>;
  const map = new Map<string, Date>();
  for (const r of rows) map.set(r.slug, new Date(r.risen_at));
  return map;
}

/** Get last revival timestamp for a single slug (for dormancy check). */
export function getLastRevivalAt(slug: string): Date | null {
  const row = db()
    .prepare('SELECT risen_at FROM revivals WHERE slug = ?')
    .get(slug) as { risen_at: string | null } | undefined;
  if (!row?.risen_at) return null;
  return new Date(row.risen_at);
}

// ---------------------------------------------------------------------------
// Entombment — record when a post first crosses the decay threshold
// ---------------------------------------------------------------------------

/**
 * Record the first entombment timestamp for a slug.
 * Idempotent: COALESCE guarantees existing entombed_at is never overwritten.
 */
export function entombPost(slug: string, now = new Date()): void {
  const iso = now.toISOString();
  db().prepare(`
    INSERT INTO revivals (slug, entombed_at) VALUES (?, ?)
    ON CONFLICT(slug) DO UPDATE SET entombed_at = COALESCE(entombed_at, ?)
  `).run(slug, iso, iso);
}

/** Batch-read all entombed_at timestamps (one query for graveyard page). */
export function getEntombedTimestamps(): Map<string, Date> {
  const rows = db()
    .prepare('SELECT slug, entombed_at FROM revivals WHERE entombed_at IS NOT NULL')
    .all() as Array<{ slug: string; entombed_at: string }>;
  const map = new Map<string, Date>();
  for (const r of rows) map.set(r.slug, new Date(r.entombed_at));
  return map;
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
  db().prepare('DELETE FROM rate_limit_reading WHERE last_at < ?').run(cutoff);
}

// ---------------------------------------------------------------------------
// Reading seconds — passive reading time accumulation
// ---------------------------------------------------------------------------

/** Total accumulated reading seconds for a single slug. */
export function getReadingSeconds(slug: string): number {
  const row = db()
    .prepare('SELECT reading_seconds FROM revivals WHERE slug = ?')
    .get(slug) as { reading_seconds: number } | undefined;
  return row?.reading_seconds ?? 0;
}

/** Batch-read all reading_seconds (one query for homepage). */
export function getAllReadingSeconds(): Map<string, number> {
  const rows = db()
    .prepare('SELECT slug, reading_seconds FROM revivals WHERE reading_seconds > 0')
    .all() as Array<{ slug: string; reading_seconds: number }>;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.slug, r.reading_seconds);
  return map;
}

/** Add seconds to the running total for a slug. Returns the new total. */
export function addReadingSeconds(slug: string, seconds: number): number {
  const stmt = db().prepare(`
    INSERT INTO revivals (slug, reading_seconds) VALUES (?, ?)
    ON CONFLICT(slug) DO UPDATE SET reading_seconds = COALESCE(reading_seconds, 0) + ?
    RETURNING reading_seconds
  `);
  const row = stmt.get(slug, seconds, seconds) as { reading_seconds: number } | undefined;
  return row?.reading_seconds ?? seconds;
}

/** True if this session+slug has not pulsed within the rate window. */
export function canPulse(sessionId: string, slug: string): boolean {
  const key = `${sessionId}:${slug}`;
  const row = db()
    .prepare('SELECT last_at FROM rate_limit_reading WHERE session_slug = ?')
    .get(key) as { last_at: number } | undefined;
  if (!row) return true;
  return Date.now() - row.last_at >= READING_RATE_MS;
}

/** Stamp the reading rate-limit record for this session+slug. */
export function recordPulse(sessionId: string, slug: string): void {
  const key = `${sessionId}:${slug}`;
  db().prepare(`
    INSERT INTO rate_limit_reading (session_slug, last_at) VALUES (?, ?)
    ON CONFLICT(session_slug) DO UPDATE SET last_at = ?
  `).run(key, Date.now(), Date.now());
}

// ---------------------------------------------------------------------------
// Revival Guard: visitor trust
// ---------------------------------------------------------------------------

type TrustRow = { fp_hash: string; score: number; visits: number; first_seen: number };

/** Read trust record for a fingerprint hash. */
export function getVisitorTrust(fp: string): TrustRow | null {
  const row = db()
    .prepare('SELECT fp_hash, score, visits, first_seen FROM visitor_trust WHERE fp_hash = ?')
    .get(fp) as TrustRow | undefined;
  return row ?? null;
}

/** Upsert trust: increment visits, recalculate score. */
export function upsertVisitorTrust(fp: string): void {
  const now = Date.now();
  upsertVisitorRow(fp, now);
  recalcTrust(fp);
}

/** Insert or update the visitor_trust row. */
function upsertVisitorRow(fp: string, now: number): void {
  db().prepare(`
    INSERT INTO visitor_trust (fp_hash, score, visits, last_at, first_seen)
    VALUES (?, 0.5, 1, ?, ?)
    ON CONFLICT(fp_hash) DO UPDATE SET visits = visits + 1, last_at = ?
  `).run(fp, now, now, now);
}

/** Recalculate trust score based on age and visit count. */
function recalcTrust(fp: string): void {
  const row = getVisitorTrust(fp);
  if (!row) return;
  const ageMs = Date.now() - row.first_seen;
  const dayMs = 86_400_000;
  const score = (ageMs > dayMs && row.visits > 3) ? 1.0 : 0.5;
  db().prepare('UPDATE visitor_trust SET score = ? WHERE fp_hash = ?')
    .run(score, fp);
}

// ---------------------------------------------------------------------------
// Revival Guard: velocity tracking
// ---------------------------------------------------------------------------

/** Log a revival event for velocity calculation. */
export function logVelocity(slug: string): void {
  db().prepare('INSERT INTO velocity_log (slug, ts) VALUES (?, ?)')
    .run(slug, Date.now());
  maybePruneVelocity();
}

// ---------------------------------------------------------------------------
// Ghost Echoes — revival timeline (for sparkline)
// ---------------------------------------------------------------------------

/**
 * Fetch the weekly revival timeline for a slug over the last N weeks.
 * Uses velocity_log (now retained for 90 days — see maybePruneVelocity fix).
 * Returns raw timestamps so revivalHistory.ts can shape them into buckets.
 */
export function getRevivalTimeline(slug: string, windowWeeks = 8): {
  timestamps: number[];
  lastAt: string | null;
  total: number;
} {
  const cutoff = Date.now() - windowWeeks * 7 * 86_400_000;
  const rows = db()
    .prepare('SELECT ts FROM velocity_log WHERE slug = ? AND ts > ? ORDER BY ts ASC')
    .all(slug, cutoff) as Array<{ ts: number }>;
  const timestamps = rows.map(r => r.ts);
  const lastRow = db()
    .prepare('SELECT risen_at FROM revivals WHERE slug = ?')
    .get(slug) as { risen_at: string | null } | undefined;
  const total = getRevivalCount(slug);
  return { timestamps, lastAt: lastRow?.risen_at ?? null, total };
}

/** Count revivals for a slug in the last 30 days (for witness badge). */
export function getMonthlyRevivalCount(slug: string): number {
  const cutoff = Date.now() - 30 * 86_400_000;
  const row = db()
    .prepare('SELECT COUNT(*) AS c FROM velocity_log WHERE slug = ? AND ts > ?')
    .get(slug, cutoff) as { c: number };
  return row.c;
}

/** Count revivals for a slug within a time window. */
export function getSlugVelocity(slug: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  const row = db()
    .prepare('SELECT COUNT(*) AS c FROM velocity_log WHERE slug = ? AND ts > ?')
    .get(slug, cutoff) as { c: number };
  return row.c;
}

/** Count all revivals within a time window. */
export function getGlobalVelocity(windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  const row = db()
    .prepare('SELECT COUNT(*) AS c FROM velocity_log WHERE ts > ?')
    .get(cutoff) as { c: number };
  return row.c;
}

/** Prune velocity entries older than 90 days (bounded delete).
 *  90 days preserves the full 8-week Ghost Echoes sparkline window + buffer.
 *  Was incorrectly set to 2 hours — that erased all sparkline history. */
let _lastPrune = 0;
function maybePruneVelocity(): void {
  const now = Date.now();
  if (now - _lastPrune < 120_000) return;
  _lastPrune = now;
  const cutoff = now - 90 * 86_400_000; // 90 days
  db().prepare(
    'DELETE FROM velocity_log WHERE id IN (SELECT id FROM velocity_log WHERE ts < ? LIMIT 1000)'
  ).run(cutoff);
}

// ---------------------------------------------------------------------------
// Revival Guard: daily counts (fingerprint + IP)
// ---------------------------------------------------------------------------

/** Today's date key for daily bucketing. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get daily revival count for a fingerprint. */
export function getDailyCountByFp(fp: string): number {
  return getDailyCount(`fp:${fp}`);
}

/** Get daily revival count for an IP. */
export function getDailyCountByIp(ip: string): number {
  return getDailyCount(`ip:${ip}`);
}

/** Increment daily count for a key. */
export function incrementDailyCount(key: string): void {
  const day = todayKey();
  db().prepare(`
    INSERT INTO daily_counts (key, count, day) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN day = ? THEN count + 1 ELSE 1 END,
      day = ?
  `).run(key, day, day, day);
}

/** Read daily count, resetting if the day has changed. */
function getDailyCount(key: string): number {
  const day = todayKey();
  const row = db()
    .prepare('SELECT count, day FROM daily_counts WHERE key = ?')
    .get(key) as { count: number; day: string } | undefined;
  if (!row || row.day !== day) return 0;
  return row.count;
}

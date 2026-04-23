// src/lib/collectiveMemory.ts
// SQLite-backed storage for collective revival counts.
// Only module that touches the database. Everything else stays pure.
//
// Lazy singleton: DB created on first call, reused thereafter.
// better-sqlite3 is synchronous — no connection pool, no promises, no races.
//
// Clock seam (2026-04-23 wedge): every wall-clock read in this file routes
// through `now()` / `nowDate()` / `nowISO()` from `./clock`. One SSR request
// = one pinned `now`. Net: 20 raw wall-clock callsites removed (Date-now
// and bare-new-Date alike); the heavy DB module now agrees with the
// middleware's pin and the `/api/docs/cite` payload byte-for-byte. Two
// helpers (`rateWindowOpen`, `cutoffMs`) are extracted so the golden test
// can lock the math without touching the seam.
//
// Credits: Mike Koch (napkin §3 wedge plan + §6 PoI checklist),
//          Paul Kim (E7 ship-signal: byte-identical citations across surfaces),
//          Elon (§5.2 finish the migration, §3.a no-new-deps),
//          Krystle Clear (v171 per-file freeze-witness template),
//          Tanya Donska (§6 evidentiary timestamps don't dance on update),
//          Sid (every helper ≤ 10 lines).
//          2026-04-23.

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import type { CauseOfDeath } from './cause-of-death';
import { rowToVerdictRecord } from './verdict-resolver';
import type { VerdictRecord } from './verdict-resolver';
import { now, nowDate, nowISO } from './clock';

const RATE_WINDOW_MS = 30_000;
const READING_RATE_MS = 25_000; // Accept a pulse every 25s (client fires every 30s)
const HOUR_MS         = 3_600_000;
const DAY_MS          = 86_400_000;
const VELOCITY_RETENTION_DAYS = 90; // covers the 8-week sparkline + buffer

// ---------------------------------------------------------------------------
// Lazy DB singleton
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

/** Resolve the SQLite path for the revivals DB. Honours `REVIVALS_DB_PATH`
 *  when set (mirrors `COMMUNITY_DB_PATH` on `communityPosts.ts`) — pass
 *  `:memory:` for hermetic tests. Default: `data/revivals.db` (production
 *  + dev). v176 PR-E §3.6 — keep-golden.test.ts wires this seam so its
 *  three-mouth proof runs against a clean ledger every prebuild. */
function dbPath(): string {
  const override = process.env.REVIVALS_DB_PATH;
  if (override && override.length > 0) return override;
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function db(): Database.Database {
  if (_db) return _db;
  // `:memory:` is a sqlite sentinel; new Database(':memory:') is supported
  // and journal_mode=WAL is a no-op there. Production path is unchanged.
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
  migrateCauseOfDeath(d);
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

/**
 * Add cause_of_death column if missing (safe to run repeatedly).
 * First-write wins: COALESCE in setCauseOfDeath ensures the verdict at the
 * moment of death is never revised — historical honesty.
 */
function migrateCauseOfDeath(d: Database.Database): void {
  const cols = d.prepare("PRAGMA table_info('revivals')").all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'cause_of_death')) {
    d.exec("ALTER TABLE revivals ADD COLUMN cause_of_death TEXT DEFAULT NULL");
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
  const iso = nowISO();
  const row = stmt.get(slug, weight, iso, weight, iso) as { count: number } | undefined;
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
export function entombPost(slug: string, when: Date = nowDate()): void {
  const iso = when.toISOString();
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
// Cause of death — set once at entombment, never overwritten (COALESCE contract)
// ---------------------------------------------------------------------------

/**
 * Persist the cause of death for a slug.
 * COALESCE guarantees first-write wins — cause is the verdict at moment of death.
 * Idempotent: calling twice for the same slug leaves the original value intact.
 */
export function setCauseOfDeath(slug: string, cause: CauseOfDeath): void {
  db().prepare(`
    INSERT INTO revivals (slug, cause_of_death) VALUES (?, ?)
    ON CONFLICT(slug) DO UPDATE SET cause_of_death = COALESCE(cause_of_death, ?)
  `).run(slug, cause, cause);
}

/** Batch-read all cause_of_death values (one query for graveyard page). */
export function getAllCausesOfDeath(): Map<string, CauseOfDeath> {
  const rows = db()
    .prepare('SELECT slug, cause_of_death FROM revivals WHERE cause_of_death IS NOT NULL')
    .all() as Array<{ slug: string; cause_of_death: string }>;
  const map = new Map<string, CauseOfDeath>();
  for (const r of rows) map.set(r.slug, r.cause_of_death as CauseOfDeath);
  return map;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Pure: has the rate window since `lastAt` opened relative to `nowMs`?
 * Extracted (Mike PoI §3) so the golden test can lock the math without
 * `freezeClock`. `lastAt === null` (no prior stamp) is always "open".
 */
export function rateWindowOpen(lastAt: number | null, nowMs: number, windowMs: number): boolean {
  if (lastAt === null) return true;
  return nowMs - lastAt >= windowMs;
}

/** True if this IP+slug combo hasn't fired within the rate window. */
export function canRevive(ip: string, slug: string): boolean {
  const key = `${ip}:${slug}`;
  const row = db().prepare('SELECT last_at FROM rate_limit WHERE ip_slug = ?').get(key) as { last_at: number } | undefined;
  return rateWindowOpen(row?.last_at ?? null, now(), RATE_WINDOW_MS);
}

/** Stamp the rate-limit record for this IP+slug. */
export function recordRevival(ip: string, slug: string): void {
  const key = `${ip}:${slug}`;
  const t   = now();   // PoI §2: ONE clock read, written into both columns.
  db().prepare(`
    INSERT INTO rate_limit (ip_slug, last_at) VALUES (?, ?)
    ON CONFLICT(ip_slug) DO UPDATE SET last_at = ?
  `).run(key, t, t);
}

// ---------------------------------------------------------------------------
// Session-based rate limiting (preferred over IP when session ID is known)
// ---------------------------------------------------------------------------

/**
 * True if this session+slug has NEVER been revived.
 * One revival per tab per post — no time window, permanent lock.
 * (Tab = sessionStorage session, renewed on each new browser tab.)
 */
export function canReviveBySession(sessionId: string, slug: string): boolean {
  const key = `${sessionId}:${slug}`;
  const row = db()
    .prepare('SELECT session_slug FROM rate_limit_session WHERE session_slug = ?')
    .get(key);
  return !row;
}

/** Stamp the session rate-limit record for this session+slug. */
export function recordRevivalBySession(sessionId: string, slug: string): void {
  const key = `${sessionId}:${slug}`;
  const t   = now();   // PoI §2: one clock read per stamp.
  db().prepare(`
    INSERT INTO rate_limit_session (session_slug, last_at) VALUES (?, ?)
    ON CONFLICT(session_slug) DO UPDATE SET last_at = ?
  `).run(key, t, t);
}

// ---------------------------------------------------------------------------
// Cleanup (optional, call periodically or on deploy)
// ---------------------------------------------------------------------------

/** Purge stale rate-limit entries older than 1 hour. */
export function pruneRateLimits(): void {
  const cutoff = cutoffMs(now(), HOUR_MS);
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
  return rateWindowOpen(row?.last_at ?? null, now(), READING_RATE_MS);
}

/** Stamp the reading rate-limit record for this session+slug. */
export function recordPulse(sessionId: string, slug: string): void {
  const key = `${sessionId}:${slug}`;
  const t   = now();   // PoI §2: one clock read per stamp.
  db().prepare(`
    INSERT INTO rate_limit_reading (session_slug, last_at) VALUES (?, ?)
    ON CONFLICT(session_slug) DO UPDATE SET last_at = ?
  `).run(key, t, t);
}

// ---------------------------------------------------------------------------
// Shared DB handle — exposed for sibling ledger modules (v150c cell-events).
// Rule (Mike napkin §1): one module reaches into SQLite first; siblings may
// piggyback via this accessor to avoid a parallel connection. The exposed
// handle is the same singleton this file uses — callers must not close it.
// ---------------------------------------------------------------------------

/** Return the shared DB handle for sibling modules (read + write). */
export function sharedDatabase(): Database.Database {
  return db();
}

/**
 * @internal Test-only override. Swaps the lazy singleton so a suite can
 * point sibling modules at an in-memory database without touching the
 * production file. Pass `null` to restore cold-start behaviour.
 *
 * When a DB is provided we eagerly run `initTables` against it so the
 * collectiveMemory tables exist immediately — tests that wrote against
 * `sharedDatabase()` for cell-events have always done their own
 * `ensureSchema()`, so this is purely additive (Mike PoI §6).
 */
export function __setSharedDbForTests(override: Database.Database | null): void {
  _db = override;
  if (override) initTables(override);
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
  const t = now();
  upsertVisitorRow(fp, t);
  recalcTrust(fp, t);
}

/** Insert or update the visitor_trust row. */
function upsertVisitorRow(fp: string, t: number): void {
  db().prepare(`
    INSERT INTO visitor_trust (fp_hash, score, visits, last_at, first_seen)
    VALUES (?, 0.5, 1, ?, ?)
    ON CONFLICT(fp_hash) DO UPDATE SET visits = visits + 1, last_at = ?
  `).run(fp, t, t, t);
}

/** Recalculate trust score based on age and visit count. */
function recalcTrust(fp: string, t: number = now()): void {
  const row = getVisitorTrust(fp);
  if (!row) return;
  const ageMs = t - row.first_seen;
  const score = (ageMs > DAY_MS && row.visits > 3) ? 1.0 : 0.5;
  db().prepare('UPDATE visitor_trust SET score = ? WHERE fp_hash = ?')
    .run(score, fp);
}

// ---------------------------------------------------------------------------
// Revival Guard: velocity tracking
// ---------------------------------------------------------------------------

/** Log a revival event for velocity calculation. */
export function logVelocity(slug: string): void {
  db().prepare('INSERT INTO velocity_log (slug, ts) VALUES (?, ?)')
    .run(slug, now());
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
  const cutoff = cutoffMs(now(), windowWeeks * 7 * DAY_MS);
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
  const cutoff = cutoffMs(now(), 30 * DAY_MS);
  const row = db()
    .prepare('SELECT COUNT(*) AS c FROM velocity_log WHERE slug = ? AND ts > ?')
    .get(slug, cutoff) as { c: number };
  return row.c;
}

/** Count revivals for a slug within a time window. */
export function getSlugVelocity(slug: string, windowMs: number): number {
  const cutoff = cutoffMs(now(), windowMs);
  const row = db()
    .prepare('SELECT COUNT(*) AS c FROM velocity_log WHERE slug = ? AND ts > ?')
    .get(slug, cutoff) as { c: number };
  return row.c;
}

/** Count all revivals within a time window. */
export function getGlobalVelocity(windowMs: number): number {
  const cutoff = cutoffMs(now(), windowMs);
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
  const t = now();
  if (t - _lastPrune < 120_000) return;
  _lastPrune = t;
  const cutoff = cutoffMs(t, VELOCITY_RETENTION_DAYS * DAY_MS);
  db().prepare(
    'DELETE FROM velocity_log WHERE id IN (SELECT id FROM velocity_log WHERE ts < ? LIMIT 1000)'
  ).run(cutoff);
}

// ---------------------------------------------------------------------------
// Revival Guard: daily counts (fingerprint + IP)
// ---------------------------------------------------------------------------

/** Today's date key for daily bucketing.
 *  Shape (`YYYY-MM-DD`) is load-bearing for existing daily_counts rows —
 *  do NOT swap to Intl.DateTimeFormat (Mike PoI §4). */
function todayKey(): string {
  return nowISO().slice(0, 10);
}

/**
 * Pure: `nowMs - windowMs`. Extracted (Mike PoI §3) so the test can lock
 * sparkline / prune cutoffs without `freezeClock`. Saturates at 0 — a
 * negative cutoff would let SQLite filters reach into prehistory.
 */
export function cutoffMs(nowMs: number, windowMs: number): number {
  return Math.max(0, nowMs - windowMs);
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

// ---------------------------------------------------------------------------
// Verdict records — reads from conviction_ledger (event_type = 'verdict')
// ---------------------------------------------------------------------------

type VerdictRow = {
  post_slug: string;
  conviction_score: number | null;
  payload_json: string | null;
  timestamp: number;
  hmac_seal: string | null;
};

const VERDICT_SELECT = `
  SELECT post_slug, conviction_score, payload_json, timestamp, hmac_seal
  FROM conviction_ledger WHERE event_type = 'verdict'
`;

/**
 * Returns the sealed verdict record for a slug, or null if none exists.
 * First-write-wins: only the earliest verdict event counts.
 */
export function getVerdictRecord(slug: string): VerdictRecord | null {
  const row = db()
    .prepare(`${VERDICT_SELECT} AND post_slug = ? ORDER BY id ASC LIMIT 1`)
    .get(slug) as VerdictRow | undefined;
  return row ? rowToVerdictRecord(row) : null;
}

/**
 * Returns a slug-keyed map of all sealed verdict records.
 * Used by allPostDisplayData() for a single batch read.
 */
export function getAllVerdicts(): Map<string, VerdictRecord> {
  const rows = db()
    .prepare(`${VERDICT_SELECT} ORDER BY id ASC`)
    .all() as VerdictRow[];
  const map = new Map<string, VerdictRecord>();
  for (const row of rows) {
    if (!map.has(row.post_slug)) map.set(row.post_slug, rowToVerdictRecord(row));
  }
  return map;
}

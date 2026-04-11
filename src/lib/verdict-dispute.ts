// src/lib/verdict-dispute.ts
// Reader dispute layer — sits between verdict-resolver.ts and batting-average.ts.
// Readers who staked 'disagree' can formally challenge an author's sealed verdict.
// >33% dispute threshold marks verdict as 'contested' (excluded from batting avg).
// Zero new dependencies. Same revivals.db WAL singleton pattern.
// Credits: Mike (napkin plan §Verdict-Dispute-Engine), Elon (fatal-flaw diagnosis),
//          Paul Kim (Challenge Moment as must-have #3), Krystle (accountability loop)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DisputeState =
  | { status: 'no-verdict' }                                                 // verdict not sealed
  | { status: 'no-stancers' }                                                // 0 disagree stances
  | { status: 'clean';     ratio: number; total: number; disputes: number }  // ratio < 0.33
  | { status: 'contested'; ratio: number; total: number; disputes: number }; // ratio ≥ 0.33

export type DisputeResolutionState = 'upheld' | 'overturned';

export interface DisputeResolution {
  post_slug:          string;
  state:              DisputeResolutionState;
  resolved_at:        number;
  challenge_share_pct: number;  // 0–100
}

// ---------------------------------------------------------------------------
// DB — opens same revivals.db as conviction-ledger (WAL mode)
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
  initTable(_db);
  return _db;
}

function initTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS verdict_disputes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_slug   TEXT    NOT NULL,
      session_id  TEXT    NOT NULL,
      timestamp   INTEGER NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_session
      ON verdict_disputes(post_slug, session_id);
    CREATE INDEX IF NOT EXISTS idx_dispute_slug
      ON verdict_disputes(post_slug);
    CREATE TABLE IF NOT EXISTS dispute_resolutions (
      post_slug           TEXT    PRIMARY KEY,
      state               TEXT    NOT NULL,
      resolved_at         INTEGER NOT NULL,
      challenge_share_pct REAL    NOT NULL DEFAULT 0
    ) STRICT;
  `);
}

// ---------------------------------------------------------------------------
// Queries — each does exactly one thing
// ---------------------------------------------------------------------------

function hasVerdictSealed(slug: string): boolean {
  const row = db()
    .prepare("SELECT id FROM conviction_ledger WHERE post_slug = ? AND event_type = 'verdict' LIMIT 1")
    .get(slug);
  return !!row;
}

function countDisagreers(slug: string): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM reader_stances WHERE post_slug = ? AND stance = 'disagree'")
    .get(slug) as { n: number };
  return row?.n ?? 0;
}

function countDisputes(slug: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM verdict_disputes WHERE post_slug = ?')
    .get(slug) as { n: number };
  return row?.n ?? 0;
}

function toRatio(disputes: number, total: number): number {
  return total > 0 ? Math.round((disputes / total) * 100) / 100 : 0;
}

function buildState(disputes: number, total: number): DisputeState {
  const ratio = toRatio(disputes, total);
  if (ratio >= 0.33) return { status: 'contested', ratio, total, disputes };
  return { status: 'clean', ratio, total, disputes };
}

// ---------------------------------------------------------------------------
// Resolution queries — window tracking + final state
// ---------------------------------------------------------------------------

/** Unix ms of the first dispute on this slug — starts the 72h window. */
export function getWindowOpenedAt(slug: string): number | null {
  const row = db()
    .prepare('SELECT MIN(timestamp) AS t FROM verdict_disputes WHERE post_slug = ?')
    .get(slug) as { t: number | null } | undefined;
  return row?.t ?? null;
}

/** Read the final community resolution for a slug (null = window not yet resolved). */
export function getDisputeResolution(slug: string): DisputeResolution | null {
  const row = db()
    .prepare('SELECT post_slug, state, resolved_at, challenge_share_pct FROM dispute_resolutions WHERE post_slug = ?')
    .get(slug) as DisputeResolution | undefined;
  return row ?? null;
}

/** Persist the community resolution — idempotent via INSERT OR IGNORE. */
export function writeDisputeResolution(
  slug: string,
  state: DisputeResolutionState,
  challengeSharePct: number,
): void {
  db().prepare(
    'INSERT OR IGNORE INTO dispute_resolutions (post_slug, state, resolved_at, challenge_share_pct) VALUES (?, ?, ?, ?)',
  ).run(slug, state, Date.now(), Math.round(challengeSharePct * 100) / 100);
}

/** Count posts with a final dispute resolution — used by BattingAverageHero gate. */
export function getResolvedVerdictCount(): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM dispute_resolutions')
    .get() as { n: number } | undefined;
  return row?.n ?? 0;
}

/** All slugs that are currently contested (disputes recorded, no resolution yet). */
export function getContestedSlugs(): string[] {
  const rows = db()
    .prepare(`
      SELECT DISTINCT d.post_slug FROM verdict_disputes d
      LEFT JOIN dispute_resolutions r ON r.post_slug = d.post_slug
      WHERE r.post_slug IS NULL
    `)
    .all() as { post_slug: string }[];
  return rows.map(r => r.post_slug);
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/**
 * Record a reader dispute for a session on a post.
 * Idempotent via INSERT OR IGNORE + UNIQUE index.
 * Returns true if a new row was inserted (false = already recorded).
 */
export function recordDispute(slug: string, sessionId: string): boolean {
  const result = db().prepare(
    'INSERT OR IGNORE INTO verdict_disputes (post_slug, session_id, timestamp) VALUES (?, ?, ?)',
  ).run(slug, sessionId, Date.now());
  return result.changes > 0;
}

/** Fast point lookup — true if this session already disputed this verdict. */
export function disputeAlreadyRecorded(slug: string, sessionId: string): boolean {
  const row = db()
    .prepare('SELECT id FROM verdict_disputes WHERE post_slug = ? AND session_id = ?')
    .get(slug, sessionId);
  return row !== undefined;
}

// ---------------------------------------------------------------------------
// Public read — state machine
// ---------------------------------------------------------------------------

/**
 * Compute the dispute state for a post's sealed verdict.
 * Called by batting-average.ts — contested verdicts are excluded from the score.
 * Safe to call at build time; returns 'no-verdict' if DB is absent or verdict not sealed.
 */
export function getDisputeState(slug: string): DisputeState {
  try {
    if (!hasVerdictSealed(slug)) return { status: 'no-verdict' };
    const total = countDisagreers(slug);
    if (total === 0) return { status: 'no-stancers' };
    const disputes = countDisputes(slug);
    return buildState(disputes, total);
  } catch {
    return { status: 'no-verdict' };
  }
}

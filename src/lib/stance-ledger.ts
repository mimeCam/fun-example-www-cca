// src/lib/stance-ledger.ts
// Reader stance storage — persists agree/torn/disagree votes per post.
// Uses the same revivals.db as collectiveMemory.ts (WAL mode, singleton pattern).
// One write path. One schema. UNIQUE index enforces idempotency at the storage layer.
// Credits: Mike (arch spec — Adversarial Stance Drawer napkin plan)
//          Sid (2026-04-23 ledger wedge v173: stamp routes through clock seam).

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { now as clockNow } from './clock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StanceValue = 'agree' | 'torn' | 'disagree';

export interface StanceDistribution {
  agree: number;
  torn: number;
  disagree: number;
  total: number;
}

// ---------------------------------------------------------------------------
// DB singleton — opens the same revivals.db as collectiveMemory (WAL mode)
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

/** @internal Test hatch (2026-04-23, Sid ledger wedge): swap the lazy DB
 *  singleton to a caller-supplied handle. See conviction-ledger's twin. */
export function __setDbForTests(override: Database.Database | null): void {
  if (_db && _db !== override) { try { _db.close(); } catch { /* closed */ } }
  _db = override;
  if (override) initTable(override);
}

function initTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS reader_stances (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      post_slug    TEXT    NOT NULL,
      session_id   TEXT    NOT NULL,
      stance       TEXT    NOT NULL CHECK (stance IN ('agree','torn','disagree')),
      score        INTEGER NOT NULL DEFAULT 3 CHECK (score BETWEEN 1 AND 5),
      timestamp    INTEGER NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stance_session
      ON reader_stances(post_slug, session_id);
    CREATE INDEX IF NOT EXISTS idx_stance_slug
      ON reader_stances(post_slug);
  `);
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/**
 * Record a reader stance for a session on a post.
 * Idempotent via INSERT OR IGNORE + UNIQUE index.
 * Returns true if a new row was inserted (false = already recorded).
 */
export function recordStance(
  slug: string,
  sessionId: string,
  stance: StanceValue,
  score = 3,
): boolean {
  const result = db().prepare(`
    INSERT OR IGNORE INTO reader_stances (post_slug, session_id, stance, score, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(slug, sessionId, stance, score, clockNow());
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** Fast point lookup — true if this session already recorded a stance for this post. */
export function stanceAlreadyRecorded(slug: string, sessionId: string): boolean {
  const row = db()
    .prepare('SELECT id FROM reader_stances WHERE post_slug = ? AND session_id = ?')
    .get(slug, sessionId);
  return row !== undefined;
}

/** Return the recorded stance for a session, or null if none recorded yet. */
export function getStanceForSession(slug: string, sessionId: string): StanceValue | null {
  const row = db()
    .prepare('SELECT stance FROM reader_stances WHERE post_slug = ? AND session_id = ?')
    .get(slug, sessionId) as { stance: StanceValue } | undefined;
  return row?.stance ?? null;
}

/** Aggregate stance counts for a single slug. */
export function getStanceDistribution(slug: string): StanceDistribution {
  const rows = db()
    .prepare(`
      SELECT stance, COUNT(*) AS n
      FROM reader_stances
      WHERE post_slug = ?
      GROUP BY stance
    `)
    .all(slug) as Array<{ stance: StanceValue; n: number }>;
  return aggregateRows(rows);
}

/** Batch-read stance distributions for all slugs (one query for homepage). */
export function getAllStanceDistributions(): Map<string, StanceDistribution> {
  const rows = db()
    .prepare(`
      SELECT post_slug, stance, COUNT(*) AS n
      FROM reader_stances
      GROUP BY post_slug, stance
    `)
    .all() as Array<{ post_slug: string; stance: StanceValue; n: number }>;
  return groupBySlug(rows);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Sum agree/torn/disagree rows into a StanceDistribution. */
function aggregateRows(rows: Array<{ stance: StanceValue; n: number }>): StanceDistribution {
  const dist: StanceDistribution = { agree: 0, torn: 0, disagree: 0, total: 0 };
  for (const r of rows) {
    dist[r.stance] = r.n;
    dist.total += r.n;
  }
  return dist;
}

/** Group batch rows by slug into a Map. */
function groupBySlug(
  rows: Array<{ post_slug: string; stance: StanceValue; n: number }>,
): Map<string, StanceDistribution> {
  const map = new Map<string, StanceDistribution>();
  for (const r of rows) {
    const d = map.get(r.post_slug) ?? { agree: 0, torn: 0, disagree: 0, total: 0 };
    d[r.stance] = r.n;
    d.total += r.n;
    map.set(r.post_slug, d);
  }
  return map;
}

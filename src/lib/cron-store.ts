// src/lib/cron-store.ts
// Persistent history for cron job runs — cron_runs table in revivals.db (WAL).
// One write path: recordStart → recordFinish | recordError.
// No polymorphism. No abstractions. Just a table and four functions.
//
// Credits: Mike (arch §cron-store)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CronStatus = 'ok' | 'partial' | 'error';

export interface CronRun {
  id: number;
  job_name: string;
  started_at: number;
  finished_at: number | null;
  status: CronStatus | null;
  upgraded: number;
  still_pending: number;
  failed: number;
  error_msg: string | null;
  consecutive_failures: number;
}

// ---------------------------------------------------------------------------
// DB singleton — same revivals.db as conviction-ledger
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
  initSchema(_db);
  return _db;
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name             TEXT    NOT NULL,
      started_at           INTEGER NOT NULL,
      finished_at          INTEGER,
      status               TEXT,
      upgraded             INTEGER DEFAULT 0,
      still_pending        INTEGER DEFAULT 0,
      failed               INTEGER DEFAULT 0,
      error_msg            TEXT,
      consecutive_failures INTEGER DEFAULT 0
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_cron_runs_job
      ON cron_runs(job_name, started_at DESC);
  `);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function jobNameForId(id: number): string {
  const row = db()
    .prepare('SELECT job_name FROM cron_runs WHERE id = ?')
    .get(id) as { job_name: string } | undefined;
  return row?.job_name ?? '';
}

/** Consecutive failure count from the previous completed run for this job. */
function prevStreak(jobName: string, currentId: number): number {
  const row = db()
    .prepare(
      'SELECT consecutive_failures FROM cron_runs ' +
      'WHERE job_name = ? AND id < ? AND finished_at IS NOT NULL ' +
      'ORDER BY id DESC LIMIT 1',
    )
    .get(jobName, currentId) as { consecutive_failures: number } | undefined;
  return row?.consecutive_failures ?? 0;
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/** Insert a new run row. Returns its row id for the subsequent update. */
export function recordStart(jobName: string): number {
  const result = db()
    .prepare('INSERT INTO cron_runs (job_name, started_at) VALUES (?, ?)')
    .run(jobName, Date.now());
  return result.lastInsertRowid as number;
}

/** Mark the run completed with outcome counters. Resets streak on clean success. */
export function recordFinish(
  id: number,
  status: CronStatus,
  upgraded: number,
  stillPending: number,
  failed: number,
): void {
  const jobName = jobNameForId(id);
  const streak  = status !== 'ok' ? prevStreak(jobName, id) + 1 : 0;
  db().prepare(`
    UPDATE cron_runs
    SET finished_at = ?, status = ?, upgraded = ?,
        still_pending = ?, failed = ?, consecutive_failures = ?
    WHERE id = ?
  `).run(Date.now(), status, upgraded, stillPending, failed, streak, id);
}

/** Mark the run as crashed (uncaught exception). Always increments streak. */
export function recordError(id: number, msg: string): void {
  const jobName = jobNameForId(id);
  const streak  = prevStreak(jobName, id) + 1;
  db().prepare(`
    UPDATE cron_runs
    SET finished_at = ?, status = 'error', error_msg = ?,
        consecutive_failures = ?
    WHERE id = ?
  `).run(Date.now(), msg.slice(0, 500), streak, id);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** Most recent completed run per job (for health endpoint). */
export function getLastRuns(): CronRun[] {
  return db().prepare(`
    SELECT * FROM cron_runs
    WHERE id IN (
      SELECT MAX(id) FROM cron_runs
      WHERE finished_at IS NOT NULL
      GROUP BY job_name
    )
    ORDER BY job_name
  `).all() as CronRun[];
}

/** Consecutive failure count from the most recent completed run. */
export function getFailureStreak(jobName: string): number {
  const row = db()
    .prepare(
      'SELECT consecutive_failures FROM cron_runs ' +
      'WHERE job_name = ? AND finished_at IS NOT NULL ' +
      'ORDER BY id DESC LIMIT 1',
    )
    .get(jobName) as { consecutive_failures: number } | undefined;
  return row?.consecutive_failures ?? 0;
}

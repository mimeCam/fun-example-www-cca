// src/lib/presenceStats.ts
// Server-side presence statistics — pure functions, no state.
// Queries SQLite for today's revival activity + wraps heartbeat connection count.
//
// Credits: Mike (architecture), Paul (priority framework)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { connectionCount } from './heartbeat';

/** Today's total revival count across all slugs. */
export function todayRevivalCount(): number {
  const d = openDb();
  if (!d) return 0;
  return queryTodayRevivals(d);
}

/** Active SSE connections — proxy for "readers here now". */
export function activeReaderEstimate(): number {
  return connectionCount();
}

/** Combined stats for SSE presence frame. */
export function presenceSnapshot(): { readers: number; revivals: number } {
  return {
    readers: activeReaderEstimate(),
    revivals: todayRevivalCount(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dbPath(): string {
  return resolve(process.cwd(), 'data', 'revivals.db');
}

/** Open DB read-only; returns null if file doesn't exist yet. */
function openDb(): Database.Database | null {
  try {
    return new Database(dbPath(), { readonly: true });
  } catch {
    return null;
  }
}

/** Count rows in velocity_log with today's date. */
function queryTodayRevivals(d: Database.Database): number {
  try {
    const row = d.prepare(
      "SELECT COUNT(*) AS c FROM velocity_log WHERE date(ts / 1000, 'unixepoch') = date('now')"
    ).get() as { c: number } | undefined;
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

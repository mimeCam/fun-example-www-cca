// src/lib/batting-average.ts
// Pure reader: aggregates conviction accuracy from the ledger.
// Single responsibility: the ledger writes; this module only reads and counts.
// Returns a discriminated union — no nullable fields, no boolean flags.
//
// Scoring rules (Mike §1):
//   correct → sealed + died with score ≥ 7
//   wrong   → sealed + died with score ≤ 4
//   pending → sealed, still alive
//   neutral → sealed + died with score 5–6 (excluded from pct denominator)
//   pct     → correct / (correct + wrong)   — pending never penalise
//
// Credits: Mike (architecture spec §1), Tanya (UX §2 — chip threshold states)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BattingAverage =
  | { status: 'cold'; total: 0 }
  | { status: 'live'; total: number; correct: number; wrong: number; pending: number; pct: number };

interface SealRow     { post_slug: string; conviction_score: number }
interface SlugRow     { post_slug: string }
interface Counts      { correct: number; wrong: number; pending: number }
type Verdict = 'correct' | 'wrong' | 'pending' | 'neutral';

const CORRECT_MIN = 7;
const WRONG_MAX   = 4;

// ---------------------------------------------------------------------------
// DB — lazy singleton, read-only mirror of conviction-ledger's revivals.db
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function dbPath(): string {
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function avgDb(): Database.Database | null {
  if (_db) return _db;
  try {
    _db = new Database(dbPath());
    _db.pragma('journal_mode = WAL');
    return _db;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Queries — each does exactly one thing
// ---------------------------------------------------------------------------

function fetchSeals(d: Database.Database): SealRow[] {
  return d
    .prepare("SELECT post_slug, conviction_score FROM conviction_ledger WHERE event_type = 'seal'")
    .all() as SealRow[];
}

function fetchDeadSlugs(d: Database.Database): Set<string> {
  const rows = d
    .prepare("SELECT DISTINCT post_slug FROM conviction_ledger WHERE event_type = 'death'")
    .all() as SlugRow[];
  return new Set(rows.map(r => r.post_slug));
}

// ---------------------------------------------------------------------------
// Pure computation — no DB, no side effects
// ---------------------------------------------------------------------------

function verdict(score: number, died: boolean): Verdict {
  if (!died)             return 'pending';
  if (score >= CORRECT_MIN) return 'correct';
  if (score <= WRONG_MAX)   return 'wrong';
  return 'neutral';
}

function tally(seals: SealRow[], dead: Set<string>): Counts {
  const c: Counts = { correct: 0, wrong: 0, pending: 0 };
  for (const s of seals) {
    const v = verdict(s.conviction_score, dead.has(s.post_slug));
    if (v === 'correct') c.correct++;
    else if (v === 'wrong') c.wrong++;
    else if (v === 'pending') c.pending++;
  }
  return c;
}

function toPercent(correct: number, wrong: number): number {
  const denom = correct + wrong;
  return denom > 0 ? Math.round((correct / denom) * 100) : 0;
}

function buildLive(seals: SealRow[], dead: Set<string>): BattingAverage {
  const { correct, wrong, pending } = tally(seals, dead);
  return { status: 'live', total: seals.length, correct, wrong, pending, pct: toPercent(correct, wrong) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compute sitewide batting average. Safe to call at build time (returns cold if DB absent). */
export function computeBattingAverage(): BattingAverage {
  try {
    const d = avgDb();
    if (!d) return { status: 'cold', total: 0 };
    const seals = fetchSeals(d);
    if (!seals.length) return { status: 'cold', total: 0 };
    return buildLive(seals, fetchDeadSlugs(d));
  } catch { return { status: 'cold', total: 0 }; }
}

/** Returns all sealed post slugs. Used by the /api/conviction-stats chain-integrity check. */
export function getSealedSlugs(): string[] {
  try {
    const d = avgDb();
    if (!d) return [];
    return fetchSeals(d).map(s => s.post_slug);
  } catch { return []; }
}

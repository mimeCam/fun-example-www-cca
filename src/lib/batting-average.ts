// src/lib/batting-average.ts
// Pure reader: aggregates conviction accuracy from the ledger.
// Single responsibility: the ledger writes; this module only reads and counts.
// Returns a discriminated union — no nullable fields, no boolean flags.
//
// Scoring rules (updated 2026-04-07):
//   correct → VerdictRecord with verdict='still-true'
//   wrong   → VerdictRecord with verdict='wrong' or 'abandoned'
//   neutral → VerdictRecord with verdict='evolved' (excluded from pct denominator)
//   pending → sealed, no VerdictRecord yet
//   pct     → correct / (correct + wrong)   — pending never penalise
//
// Sealed verdict events are the only canonical source (Mike §verdict-resolution).
// Frontmatter inference is retired; runtime verdicts drive the batting average.
//
// Credits: Mike (architecture spec §verdict-resolution), Tanya (UX §3 verdict page)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BattingAverage =
  | { status: 'cold'; total: 0 }
  | { status: 'live'; total: number; correct: number; wrong: number; pending: number; pct: number };

/**
 * Prediction-granular accuracy — computed from PredictionStats (frontmatter-derived).
 * Companion to BattingAverage; kept here so the nav chip can show both in one import.
 * Credits: Mike (arch spec §Prediction-Vault §5 Batting Average Is Now Prediction-Granular)
 */
export type PredictionAccuracy =
  | { status: 'cold' }
  | { status: 'live'; total: number; correct: number; incorrect: number; partial: number; pending: number; overdue: number; accuracy: number };

interface SealRow        { post_slug: string }
interface VerdictEventRow { post_slug: string; payload_json: string | null }
interface Counts          { correct: number; wrong: number; pending: number }
type VerdictTally = 'correct' | 'wrong' | 'neutral';

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

function fetchSealSlugs(d: Database.Database): SealRow[] {
  return d
    .prepare("SELECT post_slug FROM conviction_ledger WHERE event_type = 'seal'")
    .all() as SealRow[];
}

function fetchVerdictEvents(d: Database.Database): VerdictEventRow[] {
  return d
    .prepare("SELECT post_slug, payload_json FROM conviction_ledger WHERE event_type = 'verdict' ORDER BY id ASC")
    .all() as VerdictEventRow[];
}

// ---------------------------------------------------------------------------
// Pure computation — no DB, no side effects
// ---------------------------------------------------------------------------

function verdictTally(outcome: string): VerdictTally {
  if (outcome === 'still-true') return 'correct';
  if (outcome === 'wrong' || outcome === 'abandoned') return 'wrong';
  return 'neutral'; // 'evolved' — excluded from denominator
}

function tallyVerdicts(verdictEvents: VerdictEventRow[], totalSealed: number): Counts {
  const c: Counts = { correct: 0, wrong: 0, pending: 0 };
  const resolvedSlugs = new Set<string>();
  for (const v of verdictEvents) {
    if (resolvedSlugs.has(v.post_slug)) continue; // first-write-wins
    resolvedSlugs.add(v.post_slug);
    const payload = v.payload_json ? JSON.parse(v.payload_json) as Record<string, unknown> : {};
    const t = verdictTally((payload.verdict as string) ?? '');
    if (t === 'correct') c.correct++;
    else if (t === 'wrong') c.wrong++;
    // neutral excluded from counts
  }
  c.pending = Math.max(0, totalSealed - resolvedSlugs.size);
  return c;
}

function toPercent(correct: number, wrong: number): number {
  const denom = correct + wrong;
  return denom > 0 ? Math.round((correct / denom) * 100) : 0;
}

function buildLive(seals: SealRow[], verdictEvents: VerdictEventRow[]): BattingAverage {
  const { correct, wrong, pending } = tallyVerdicts(verdictEvents, seals.length);
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
    const seals = fetchSealSlugs(d);
    if (!seals.length) return { status: 'cold', total: 0 };
    const verdictEvents = fetchVerdictEvents(d);
    if (!verdictEvents.length) return { status: 'cold', total: 0 };
    return buildLive(seals, verdictEvents);
  } catch { return { status: 'cold', total: 0 }; }
}

/**
 * Lift PredictionStats into PredictionAccuracy discriminated union.
 * Takes already-computed stats from prediction-engine so this stays DB-free.
 */
export function computePredictionBattingAverage(
  stats: { total: number; correct: number; incorrect: number; partial: number; pending: number; overdue: number; accuracy: number | null },
): PredictionAccuracy {
  if (stats.total === 0 || stats.accuracy === null) return { status: 'cold' };
  const { total, correct, incorrect, partial, pending, overdue, accuracy } = stats;
  return { status: 'live', total, correct, incorrect, partial, pending, overdue, accuracy };
}

/** Returns all sealed post slugs. Used by the /api/conviction-stats chain-integrity check. */
export function getSealedSlugs(): string[] {
  try {
    const d = avgDb();
    if (!d) return [];
    return fetchSealSlugs(d).map(s => s.post_slug);
  } catch { return []; }
}

// src/lib/batting-average.ts
// Pure reader: aggregates conviction accuracy from the ledger.
// Single responsibility: the ledger writes; this module only reads and counts.
// Returns a discriminated union — no nullable fields, no boolean flags.
//
// Scoring rules (updated 2026-04-07):
//   correct   → VerdictRecord with verdict='still-true' AND dispute state != 'contested'
//   wrong     → VerdictRecord with verdict='wrong' or 'abandoned'
//   neutral   → VerdictRecord with verdict='evolved' (excluded from pct denominator)
//   contested → verdict sealed but disputed by ≥33% of disagree-stakers → treated as pending
//   pending   → sealed, no VerdictRecord yet
//   pct       → correct / (correct + wrong)   — pending and contested never penalise
//
// Sealed verdict events are the only canonical source (Mike §verdict-resolution).
// Frontmatter inference is retired; runtime verdicts drive the batting average.
// Dispute state is the external anchor that prevents author self-grading (Mike §Dispute).
//
// Credits: Mike (architecture spec §verdict-resolution, §Verdict-Dispute-Engine),
//          Tanya (UX §3 verdict page), Elon (fatal-flaw diagnosis)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { getDisputeState } from './verdict-dispute';
import { getSealsByAuthor, getVerdictEventsForSlugs } from './conviction-ledger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BattingAverage =
  | { status: 'cold'; total: 0 }
  | { status: 'live'; total: number; correct: number; wrong: number; pending: number; pct: number };

// ── Integrity types (BA Integrity Overhaul 2026-04-12) ──────────────────────
// Mike: "Two numbers, one truth. BA alone is half the story."
// TrophyTier is the polymorphism anchor: component, CSS data-attr, and API
// all branch on this one type — adding a tier = 1 threshold + 1 token + 1 rule.
//
// MIN_VERDICTS: the single gatekeeper. Both chip and hero defer to isBadgeEligible().
// Don't scatter this threshold — it lives here, nowhere else.

export const MIN_VERDICTS = 5; // minimum resolved verdicts before badge is shown

export type TrophyTier = 'locked' | 'bronze' | 'silver' | 'gold' | 'diamond';

// ── Thermal State — conviction maturity visual language ──────────────────────
// Mike §napkin: cold (untested) → warming (building track record) → hot (earned).
// Pure derivation from resolvedTotal — no new DB column, no new cache.
// CSS branches on [data-ba-thermal]; JS sets it; SSR renders the initial value.

export type ThermalState = 'cold' | 'warming' | 'hot';

/** Derive thermal state from resolved verdict count. Zero state management. */
export function getThermalState(resolvedTotal: number): ThermalState {
  if (resolvedTotal === 0) return 'cold';
  if (resolvedTotal < MIN_VERDICTS) return 'warming';
  return 'hot';
}

export interface BattingAverageResult {
  authorSlug:      string;
  resolvedCorrect: number;
  resolvedTotal:   number;
  battingAverage:  number | null; // 0–1 decimal; null when not eligible
  totalPublished:  number;        // all posts ever published by author
  totalSealed:     number;        // posts author chose to seal
  selectivityRate: number | null; // totalSealed / totalPublished (null if 0 posts)
  eligible:        boolean;       // resolvedTotal >= MIN_VERDICTS
  trophyTier:      TrophyTier;
  thermalState:    ThermalState;  // cold | warming | hot — conviction maturity
}

/**
 * Prediction-granular accuracy — computed from PredictionStats (frontmatter-derived).
 * Companion to BattingAverage; kept here so the nav chip can show both in one import.
 * Credits: Mike (arch spec §Prediction-Vault §5 Batting Average Is Now Prediction-Granular)
 */
export type PredictionAccuracy =
  | { status: 'cold' }
  | { status: 'live'; total: number; correct: number; incorrect: number; partial: number; pending: number; overdue: number; accuracy: number };

interface SealRow                  { post_slug: string }
export interface VerdictEventRow  { post_slug: string; payload_json: string | null }
export interface Counts           { correct: number; wrong: number; evolved: number; pending: number }
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

function isContested(slug: string): boolean {
  try { return getDisputeState(slug).status === 'contested'; } catch { return false; }
}

export function tallyVerdicts(verdictEvents: VerdictEventRow[], totalSealed: number): Counts {
  const c: Counts = { correct: 0, wrong: 0, evolved: 0, pending: 0 };
  const resolvedSlugs = new Set<string>();
  for (const v of verdictEvents) {
    if (resolvedSlugs.has(v.post_slug)) continue; // first-write-wins
    resolvedSlugs.add(v.post_slug);
    if (isContested(v.post_slug)) continue; // contested → treated as pending
    const payload = v.payload_json ? JSON.parse(v.payload_json) as Record<string, unknown> : {};
    const t = verdictTally((payload.verdict as string) ?? '');
    if (t === 'correct') c.correct++;
    else if (t === 'wrong') c.wrong++;
    else c.evolved++; // neutral/'evolved' — counted with 0.5 weight in denominator
  }
  c.pending = Math.max(0, totalSealed - resolvedSlugs.size);
  return c;
}

/** evolved counts as 0.5 wrong in denominator (prevents author self-grading via "evolved" loophole). */
export function toPercent(correct: number, wrong: number, evolved: number): number {
  const denom = correct + wrong + evolved * 0.5;
  return denom > 0 ? Math.round((correct / denom) * 100) : 0;
}

function buildLive(seals: SealRow[], verdictEvents: VerdictEventRow[]): BattingAverage {
  const { correct, wrong, evolved, pending } = tallyVerdicts(verdictEvents, seals.length);
  return { status: 'live', total: seals.length, correct, wrong, pending, pct: toPercent(correct, wrong, evolved) };
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

// ── BA Integrity — pure classifiers (no DB, no side effects) ─────────────────

/** Single threshold gate. Change MIN_VERDICTS here; nowhere else. */
export function isBadgeEligible(resolvedTotal: number): boolean {
  return resolvedTotal >= MIN_VERDICTS;
}

/** selectivityRate: skin-in-the-game signal. Cosmetic only — never modifies BA formula. */
export function getSelectivityRate(sealed: number, published: number): number | null {
  if (published === 0) return null;
  return Math.round((sealed / published) * 100) / 100;
}

/** Maps pct (0–100 int) + eligibility to the polymorphism anchor TrophyTier. */
export function getTrophyTier(eligible: boolean, pctInt: number | null): TrophyTier {
  if (!eligible || pctInt === null) return 'locked';
  if (pctInt >= 85) return 'diamond';
  if (pctInt >= 70) return 'gold';
  if (pctInt >= 50) return 'silver';
  return 'bronze';
}

// ── BA Integrity — builder (pure after DB calls done) ─────────────────────────

function buildResult(
  authorSlug: string, counts: Counts, totalSeals: number, totalPublished: number,
): BattingAverageResult {
  const resolvedTotal  = counts.correct + counts.wrong;
  const eligible       = isBadgeEligible(resolvedTotal);
  const pctInt         = eligible ? toPercent(counts.correct, counts.wrong, counts.evolved) : null;
  return {
    authorSlug, resolvedCorrect: counts.correct, resolvedTotal,
    battingAverage:  pctInt !== null ? pctInt / 100 : null,
    totalPublished,  totalSealed: totalSeals,
    selectivityRate: getSelectivityRate(totalSeals, totalPublished),
    eligible,        trophyTier: getTrophyTier(eligible, pctInt),
    thermalState:    getThermalState(resolvedTotal),
  };
}

function emptyResult(authorSlug: string, totalPublished: number): BattingAverageResult {
  return buildResult(authorSlug, { correct: 0, wrong: 0, evolved: 0, pending: 0 }, 0, totalPublished);
}

// ── BA Integrity — public API ──────────────────────────────────────────────────

/**
 * Resolve per-author batting average with full integrity data.
 * totalPublished: caller provides content-collection count (no posts table in DB).
 * Safe to call at SSR time — returns locked empty result on any error.
 */
export function getBattingAverageResult(authorSlug: string, totalPublished: number): BattingAverageResult {
  try {
    const seals  = getSealsByAuthor(authorSlug);
    const events = getVerdictEventsForSlugs(seals.map(s => s.post_slug));
    const counts = tallyVerdicts(events, seals.length);
    return buildResult(authorSlug, counts, seals.length, totalPublished);
  } catch { return emptyResult(authorSlug, totalPublished); }
}

/** Returns all sealed post slugs. Used by the /api/conviction-stats chain-integrity check. */
export function getSealedSlugs(): string[] {
  try {
    const d = avgDb();
    if (!d) return [];
    return fetchSealSlugs(d).map(s => s.post_slug);
  } catch { return []; }
}

// ── Unlock Progress (Mike napkin §BattingProgressRing) ────────────────────────
// Derived state — never persisted. COUNT of resolved verdicts, queried from ledger.
// "Query it, don't write it." — Mike §points-of-interest #9

export interface UnlockProgress {
  authorSlug: string;
  resolved:   number;   // 0–MIN_VERDICTS (capped for ring display)
  required:   number;   // MIN_VERDICTS = 5
  pct:        number;   // 0.0–1.0
  unlocked:   boolean;  // true when unique resolved >= required
}

/** Count unique posts that have at least one verdict event (first-write-wins). */
function countUniqueVerdicts(events: VerdictEventRow[]): number {
  return new Set(events.map(e => e.post_slug)).size;
}

/** Derived progress toward batting average unlock. Read-only — safe at SSR time. */
export function getUnlockProgress(authorSlug: string): UnlockProgress {
  try {
    const seals  = getSealsByAuthor(authorSlug);
    const events = getVerdictEventsForSlugs(seals.map(s => s.post_slug));
    const unique = countUniqueVerdicts(events);
    return {
      authorSlug,
      resolved: Math.min(unique, MIN_VERDICTS),
      required: MIN_VERDICTS,
      pct:      Math.min(unique / MIN_VERDICTS, 1),
      unlocked: unique >= MIN_VERDICTS,
    };
  } catch {
    return { authorSlug, resolved: 0, required: MIN_VERDICTS, pct: 0, unlocked: false };
  }
}

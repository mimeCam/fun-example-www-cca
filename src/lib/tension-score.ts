// src/lib/tension-score.ts
// Pure tension computation — no DB calls. Input: StanceDistribution.
// Trivially unit-testable in isolation. O(1). No polymorphism.
// Credits: Mike (arch spec — Adversarial Stance Drawer napkin plan)

import type { StanceDistribution } from './stance-ledger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TensionLabel = 'contested' | 'consensus' | 'indifferent';

export interface TensionResult {
  label: TensionLabel;
  score: number;        // 0–100, continuous
  contestedPct: number; // % of readers on the minority side (for display)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_STANCES = 10;
const DOMINANCE_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Pure helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

/** Safe ratio — returns 0 when total is 0 to avoid NaN. */
function pct(n: number, total: number): number {
  return total > 0 ? n / total : 0;
}

/** Minority count between agree and disagree (torn is neutral). */
function minority(dist: StanceDistribution): number {
  return Math.min(dist.agree, dist.disagree);
}

/** Build an 'indifferent' result — not enough data. */
function indifferent(): TensionResult {
  return { label: 'indifferent', score: 0, contestedPct: 0 };
}

/** Build a 'consensus' result — one side dominates. */
function consensus(dist: StanceDistribution): TensionResult {
  const dominated = pct(Math.max(dist.agree, dist.disagree), dist.total);
  const score = Math.round(dominated * 100);
  return { label: 'consensus', score, contestedPct: 100 - score };
}

/** Build a 'contested' result — opinion is genuinely split. */
function contested(dist: StanceDistribution): TensionResult {
  const m = minority(dist);
  // Mike's spec: score = (min(agree,disagree) / total) * 200, capped at 100
  const score = Math.min(100, Math.round(pct(m, dist.total) * 200));
  const contestedPct = Math.round(pct(m, dist.total) * 100);
  return { label: 'contested', score, contestedPct };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute tension label + score from a stance distribution.
 * Pure function — no DB calls, no side effects.
 */
export function computeTension(dist: StanceDistribution): TensionResult {
  if (dist.total < MIN_STANCES) return indifferent();

  const agreePct    = pct(dist.agree,    dist.total);
  const disagreePct = pct(dist.disagree, dist.total);

  if (agreePct > DOMINANCE_THRESHOLD || disagreePct > DOMINANCE_THRESHOLD) {
    return consensus(dist);
  }

  return contested(dist);
}

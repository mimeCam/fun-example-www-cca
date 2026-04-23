// src/lib/stage-tempo.ts
// v163 "Stage Tempo Divergence" — 5-D oracle: bezier + duration per stage.
// v165 "Urgency Shape" — five distinct durations; endangered is the unique
//      strict minimum (the one stage where the reader can still act).
//
// Why this module exists (Mike napkin v163 §TL;DR):
//   v162 guarded only the 4-D shape of every stage's cubic-bezier curve.
//   That left the duration half unguarded — a stage could keep its curve
//   intact while drifting to a felt-indistinguishable *tempo* via duration
//   alone, AND a diagonal cancellation (ease drift ⊕ duration drift) could
//   dodge an axis-independent JND check entirely. The 5-D Euclidean
//   divergence over `(x1, y1, x2, y2, dMs·τ)` catches both failure modes
//   in a single metric — "widen, don't mint" (Mike §6).
//
// v165 duration delta (Tanya §4.1 / Mike napkin v165 §4):
//   Each stage now carries its own felt tempo. The five numbers are chosen
//   so that `endangered` (140 ms) is strictly faster than every other
//   stage — that is the one and only stage where the reader can still act
//   to revive the post. The widened guard enforces this ordering as a
//   machine-readable rule: see `check-stage-tempo-divergence.ts`
//   (`duration-alias` + `endangered-not-min`).
//
// τ unit reconciler:
//   `TAU = 1 / SNAP_MS`. Duration coords are multiplied by τ inside
//   `tempoDivergence` so ms and unit-bezier mix on comparable scales. On
//   day one (v163) durations were collinear and the 5-D distance reduced
//   to 4-D; v165 breaks that collinearity deliberately — every pair now
//   contributes a real duration term, and the 5-D JND floor still clears
//   for every unordered pair (see stage-tempo.test.ts §5).
//
// Anti-scope: pure data + arithmetic. No DOM, no FS, no CSS rendering.
//   Shape helpers for the 4-D half live in stage-ease.ts and are imported
//   here — stage-ease.ts is the "shape" oracle, stage-tempo.ts is the
//   "shape + tempo" oracle. Neither duplicates the other.
//
// Freeze: STAGE_TEMPO_VECTORS has exactly 5 entries. Adding a 6th is an
//   AGENTS.md freeze violation — enforced by the Record<DecayStage,…> type.
//
// Credits: Mike Koch (napkin v163 + v165 — τ reconciler, "widen don't
//   mint", conjunction-not-substitution guard), Tanya Donska (UX spec
//   2026-04-23 — the five felt durations + "agency, not drama" framing),
//   Elon Musk (§2.3 counterexample that makes duration-distinctness
//   strictly stronger than unique-local-min; §5.2 5-D nomination), Paul
//   Kim (urgency reading of endangered-is-fastest), Jason Fried (climax
//   instinct, dramaturgical vocabulary shed per Tanya §4.3), Krystle
//   Clear (five-literal proposal), stage-ease.ts (the 4-D oracle this
//   widens). Sid — 2026-04-23. Motto: "Code maintenance without tests."

import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';
import {
  STAGE_EASE_CURVES,
  stagePairs as easeStagePairs,
} from './stage-ease';
import type { BezierTuple } from './stage-ease';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * 5-tuple: [x1, y1, x2, y2, durationMs]. The first four coords match the
 * cubic-bezier 4-tuple used in stage-ease.ts; the fifth is the stage's
 * interaction duration in milliseconds (raw, unscaled — the τ scaling is
 * applied only inside `tempoDivergence`).
 */
export type Tempo5 = readonly [number, number, number, number, number];

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * Snap duration in milliseconds — the baseline "one tick" of the design
 * system. Declared here once and referenced by TAU so unit changes remain
 * mechanical. Must match `--motion-snap-duration` in src/styles/motion.css
 * byte-for-byte; the prebuild guard asserts that parity.
 */
export const SNAP_MS: number = 120;

/**
 * Unit reconciler. `TAU = 1 / SNAP_MS` converts milliseconds into
 * dimensionless "snap-units" so the 5-D distance mixes durations and
 * bezier coords on comparable scales. With every duration at SNAP_MS
 * today, every duration coord is 1.0 → collinear → 5-D reduces to 4-D.
 */
export const TAU: number = 1 / SNAP_MS;

/**
 * The minimum 5-D divergence required between any two stage tempos.
 * Picked to equal JND_FLOOR from stage-ease.ts (day-one invariance:
 * with collinear durations, the 5-D distance equals the 4-D one). See
 * stage-tempo.test.ts for the arithmetic proof.
 */
export const TEMPO_JND_FLOOR: number = 0.25;

// ── The five stage-tempo vectors ─────────────────────────────────────────
//
// Each 5-tuple is `[...STAGE_EASE_CURVES[stage], duration_in_ms]`. The
// bezier coords are imported wholesale so stage-ease.ts remains the single
// source of truth for the shape half; this module only adds the duration.
//
// v165 durations (ms): five distinct felt tempos. `endangered` is the
// unique strict minimum — fastest on purpose, because it is the only
// stage where the reader can still act to save the post (Tanya §3).
// The distinctness + strict-min ordering is machine-enforced by
// `check-stage-tempo-divergence.ts` — changing these numbers without
// re-running the guard fails the Docker prebuild.

/** v165 stage duration table (ms). Byte-mirror of tokens.css. */
const STAGE_DURATIONS_MS: Readonly<Record<DecayStage, number>> = {
  fresh:      280,  // new posts settle in; slight weight
  fading:     360,  // interest cools; longer exhale
  endangered: 140,  // unique strict minimum — the only actionable stage
  ghost:      540,  // drifting; no hurry
  fossil:     720,  // sealed; the page's longest beat
} as const;

/** Compose a Tempo5 tuple for one stage from the ease oracle + duration. */
function tempoVectorFor(stage: DecayStage): Tempo5 {
  const [x1, y1, x2, y2] = STAGE_EASE_CURVES[stage];
  return [x1, y1, x2, y2, STAGE_DURATIONS_MS[stage]] as const;
}

/** Build the full record once at module load. Frozen shape, 5 entries. */
function buildStageTempoVectors(): Readonly<Record<DecayStage, Tempo5>> {
  const out = {} as Record<DecayStage, Tempo5>;
  for (const s of DECAY_STAGES) out[s] = tempoVectorFor(s);
  return out as Readonly<Record<DecayStage, Tempo5>>;
}

/** The 5-D tempo oracle: one (bezier + duration) tuple per decay stage. */
export const STAGE_TEMPO_VECTORS: Readonly<Record<DecayStage, Tempo5>> =
  buildStageTempoVectors();

// ── Divergence helper — 5-D Euclidean over (bezier, τ·duration) ─────────

/**
 * 5-D Euclidean distance between two tempo tuples. The fifth coord is
 * scaled by TAU so milliseconds and unit-bezier coords mix on the same
 * dimensionless scale. Symmetric: `tempoDivergence(a, b) === tempoDivergence(b, a)`.
 */
export function tempoDivergence(a: Tempo5, b: Tempo5): number {
  const dx1 = a[0] - b[0];
  const dy1 = a[1] - b[1];
  const dx2 = a[2] - b[2];
  const dy2 = a[3] - b[3];
  const dd  = (a[4] - b[4]) * TAU;
  return Math.sqrt(dx1 * dx1 + dy1 * dy1 + dx2 * dx2 + dy2 * dy2 + dd * dd);
}

// ── Pair enumeration — delegated to stage-ease (one source, Sid §poly) ──

/** Every unordered (stage, stage) pair, once. Re-exports the ease pairer
 *  to stay single-source (Mike §6 "polymorphism is a killer"). */
export function stagePairs(): Array<readonly [DecayStage, DecayStage]> {
  return easeStagePairs();
}

// ── Minimum divergence — cached arithmetic ───────────────────────────────

/** Smallest pairwise 5-D divergence. Tests assert ≥ TEMPO_JND_FLOOR. */
export function minTempoDivergence(): number {
  let min = Infinity;
  for (const [a, b] of stagePairs()) {
    const d = tempoDivergence(STAGE_TEMPO_VECTORS[a], STAGE_TEMPO_VECTORS[b]);
    if (d < min) min = d;
  }
  return min;
}

// ── Derivation helper — build a Tempo5 from ease + ms ────────────────────

/**
 * Compose a Tempo5 from a 4-D bezier tuple and a duration in ms. Exposed
 * so the prebuild guard (which scans tokens.css for both halves
 * independently) can construct a synthetic tuple from the scanned values
 * and compare against the oracle without re-implementing the shape.
 */
export function composeTempo(bezier: BezierTuple, durationMs: number): Tempo5 {
  return [bezier[0], bezier[1], bezier[2], bezier[3], durationMs] as const;
}

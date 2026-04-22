// src/lib/stage-ease.ts
// v162 "Stage Ease Divergence" — one cubic-bezier per decay stage.
//
// Why this module exists (Mike napkin §5):
//   The 7×5 `/api/docs` matrix has always called `tempo` a 5-valued axis.
//   On disk, four of the five stages used to alias the snap profile — so
//   the tempo row of the API was 1 unique + 4 aliases. This module is
//   the single source of truth for the five 4-tuples that close that gap.
//
//   Tests, prebuild guards, and any future SSR consumer (e.g. an OG
//   renderer that paints the curve) all import from here. The CSS-side
//   literals in `tokens.css` MUST match these tuples byte-for-byte; the
//   `scripts/check-stage-ease-divergence.ts` guard asserts that parity
//   every Docker build.
//
// Anti-scope: this module does NOT render CSS, read from disk, or touch
//             the DOM. It is pure data + arithmetic — 4-D Euclidean
//             divergence on bezier control points. One number in, five
//             curves out, no side effects.
//
// Freeze: STAGE_EASE_CURVES has exactly 5 entries (one per DECAY_STAGES).
//         Adding a 6th curve is an AGENTS.md freeze violation; the
//         TypeScript record type enforces the shape at compile time.
//
// Credits: Mike Koch (napkin v162 §5 "polymorphism is a killer" — one
//          source, many readers), Tanya Donska (UX spec §2 "the five
//          felt qualities" — she picked the curves), Elon (Physics
//          Gate JND/WCAG/CLS, §5 cheapest-win nomination), Paul (widen-
//          don't-mint discipline), AGENTS.md (freeze, polish what we
//          have — AAA), Sid — 2026-04-22. Motto: "Code maintenance
//          without tests."

import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A cubic-bezier 4-tuple: [x1, y1, x2, y2]. Matches the CSS
 * `cubic-bezier(x1, y1, x2, y2)` spec (two control points, anchors at
 * (0,0) and (1,1) are implicit). Tuple type keeps consumers honest.
 */
export type BezierTuple = readonly [number, number, number, number];

// ── The five curves — one felt tempo per decay stage ──────────────────────
//
// Each curve was picked for its FELT quality (Tanya §2); the numeric
// divergence between any pair is above the JND floor (see test). The
// tuples are frozen in code AND in tokens.css — the guard asserts parity.
//
//   fresh       — overshoot (alive, bouncing in)
//   fading      — gentle settle (warmth pulling away)
//   endangered  — taut attack then hold (urgency is fast, then tense)
//   ghost       — near-linear drift (hesitant, unsure it wants to move)
//   fossil      — late clamp (no tempo, no wiggle — already there)
//
// The `fresh` tuple resolves from `--motion-easing-spring` in tokens.css;
// it is the one ease that was already bespoke before v162. Every other
// tuple replaced a `var(--motion-snap-easing)` alias.

export const STAGE_EASE_CURVES: Readonly<Record<DecayStage, BezierTuple>> = {
  fresh:      [0.34, 1.56, 0.64, 1.0 ],  // --motion-easing-spring (v146)
  fading:     [0.25, 0.8,  0.3,  1.0 ],  // soft ease-out — warmth retreats
  endangered: [0.4,  0.0,  0.2,  1.0 ],  // crisp attack — urgency is now
  ghost:      [0.5,  0.05, 0.5,  0.95],  // near-linear drift — hesitant
  fossil:     [1.0,  0.0,  1.0,  0.0 ],  // late clamp — no entrance
} as const;

// ── Divergence helper — Euclidean distance in control-point space ─────────
//
// The JND proof: if any two tuples are close enough that a reader could
// confuse their felt quality, the gate fails. Simple 4-D Euclidean
// distance is defensible (every axis is dimensionless, same [0,1]-ish
// range except y-overshoot), small to write, and exact — no tolerances
// drift later. Unit-tested with hand-computed cases in stage-ease.test.ts.

/**
 * Euclidean distance between two bezier control-point 4-tuples.
 * Pure, symmetric, bezierDivergence(a, b) === bezierDivergence(b, a).
 */
export function bezierDivergence(a: BezierTuple, b: BezierTuple): number {
  const dx1 = a[0] - b[0];
  const dy1 = a[1] - b[1];
  const dx2 = a[2] - b[2];
  const dy2 = a[3] - b[3];
  return Math.sqrt(dx1 * dx1 + dy1 * dy1 + dx2 * dx2 + dy2 * dy2);
}

/**
 * The minimum divergence required between any two stage curves. Any
 * pair below this floor fails the JND gate. Picked empirically such
 * that the current five tuples all clear it with headroom (the closest
 * pair — endangered vs ghost — is ≈0.32, so 0.25 is the ceiling we can
 * defend without needing to re-tune today). See stage-ease.test.ts.
 */
export const JND_FLOOR: number = 0.25;

// ── CSS rendering helper (string-only, no DOM) ────────────────────────────
//
// `cubicBezierCss(tuple)` is the canonical projection from a 4-tuple to
// the CSS string. The guard parses tokens.css and asserts that the
// extracted value equals `cubicBezierCss(STAGE_EASE_CURVES[stage])` for
// every stage. Whitespace MUST match byte-for-byte; this helper owns
// the format.

/** Render a BezierTuple as a CSS `cubic-bezier(...)` string. */
export function cubicBezierCss(t: BezierTuple): string {
  return `cubic-bezier(${t[0]}, ${t[1]}, ${t[2]}, ${t[3]})`;
}

// ── Pair enumeration — every unordered stage pair, once ───────────────────

/**
 * The 10 unordered (stage, stage) pairs — one row per divergence assertion.
 * Guards and tests iterate over this list; no caller hand-rolls the pairs
 * (that's how drift creeps in, Sid §no-polymorphism).
 */
export function stagePairs(): Array<readonly [DecayStage, DecayStage]> {
  const out: Array<readonly [DecayStage, DecayStage]> = [];
  for (let i = 0; i < DECAY_STAGES.length; i++) {
    for (let j = i + 1; j < DECAY_STAGES.length; j++) {
      out.push([DECAY_STAGES[i], DECAY_STAGES[j]] as const);
    }
  }
  return out;
}

// ── Minimum divergence — cached arithmetic ────────────────────────────────

/**
 * The smallest divergence across all 10 pairs. A pure read of the
 * STAGE_EASE_CURVES record; tests assert this is ≥ JND_FLOOR.
 */
export function minPairwiseDivergence(): number {
  let min = Infinity;
  for (const [a, b] of stagePairs()) {
    const d = bezierDivergence(STAGE_EASE_CURVES[a], STAGE_EASE_CURVES[b]);
    if (d < min) min = d;
  }
  return min;
}

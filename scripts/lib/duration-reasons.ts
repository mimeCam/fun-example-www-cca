// scripts/lib/duration-reasons.ts
//
// The Duration Ledger — closed vocabulary of perceptual thresholds used
// to justify every literal `ms` / `s` value in src/styles/tokens.css.
//
// Rationale (Mike napkin §§1-4, building on Paul v37 and Elon v3):
//   A design-system ceiling we can defend has to name the WHY of every
//   millisecond. A count-cap ("only 5 durations") fails the moment
//   `grep -c duration src/styles/tokens.css` returns 26+. A reason-
//   requirement ("every duration cites a threshold") is true against
//   the current repo, portable to new tokens (a 7th reason is fine, a
//   7th reason-free millisecond is not), and printable on a napkin.
//
// This module is pure — no fs, no process.exit, no globals. It exports
// the closed vocabulary + three small helpers used by both the guard
// and its unit tests. Every function is ≤10 LOC; the vocabulary itself
// is the largest thing in the file, and that is the point.
//
// Credits: Mike Koch (v3 napkin §4 labels, §5.1 alias rule), Elon
// (arithmetic teardown — ceiling-is-a-reason), Paul (the need for a
// memorable ceiling), Tanya (reuse-over-invent discipline), Sid —
// 2026-04-22. Motto: "Code maintenance without tests."

// ── Closed vocabulary (additions require a PR note — see AGENTS.md) ──────

/** The ledger. Each label pins a named perceptual band.
 *  Order is alphabetical-within-family for grep ergonomics.               */
export const LEGAL_REASONS = [
  // Causality (≤200ms) — the eye reads it as "the thing you did did it".
  'micro-feedback',
  // 400ms ± — Doherty threshold, author feels the weight before proceeding.
  'doherty',
  // 300–500ms — entrance moments: stamp bloom, meter fill, receipt land.
  'ceremony-phase',
  // 800–2000ms — deliberate ceremonial pauses: notarize, counter, dwell.
  'ceremony-dwell',
  // Stage-BPM derived rhythm (fresh 72 → fading 55 → critical 38).
  'heartbeat-bpm',
  // Per-DECAY_STAGE flash / interaction duration — tied to the 5-stage axis.
  'stage-identity',
  // Stage-transition choreography triplet (fast / base / slow).
  'snap',
  // ≥1000ms — reflection / settle ceremonies (sympathetic, ghost drain).
  'linger',
  // Slow background breathing decoupled from the decay axis (thermal, urgency).
  'ambient-pulse',
] as const;

export type DurationReason = typeof LEGAL_REASONS[number];

export const LEGAL_REASONS_SET: ReadonlySet<string> = new Set(LEGAL_REASONS);

// ── Line-scanner helpers (pure, unit-tested) ─────────────────────────────

/** Regex capturing `/* reason: <label> *\/` inside a CSS comment.
 *  Label character class intentionally narrow: `[a-z-]+` — the vocabulary
 *  is lowercase-with-hyphens and nothing else; a typo → guard failure.    */
export const REASON_COMMENT_RE = /\/\*\s*reason:\s*([a-z][a-z-]*)\s*\*\//;

/** Regex matching a CSS line that assigns a LITERAL duration value.
 *  Group 1 = the property name (--foo-duration / --bar-delay / --baz-dur).
 *  Group 2 = the numeric + unit (e.g. `833ms`, `0.4s`).
 *  A value that is only a `var(...)` reference is NOT a literal — those
 *  are aliases and inherit the referenced token's reason (Mike §5.1).    */
export const LITERAL_DURATION_RE =
  /^\s*(--[\w-]+)\s*:\s*(\d+(?:\.\d+)?(?:ms|s))\s*;/;

/** Regex matching a CSS line that assigns a var() alias.                 */
export const ALIAS_VALUE_RE = /^\s*--[\w-]+\s*:\s*var\(\s*--[\w-]+\s*\)\s*;/;

/** True when `line` is of the form `--x: var(--y);`. Alias inherits its
 *  reason from the referenced token (Mike §5.1 — exempt from the guard). */
export function isAliasValue(line: string): boolean {
  return ALIAS_VALUE_RE.test(line);
}

/** Pull the reason label from a `/* reason: X *\/` comment. Returns null
 *  when no comment or label is not in the closed vocabulary.              */
export function parseReasonComment(text: string): DurationReason | null {
  const m = REASON_COMMENT_RE.exec(text);
  if (!m) return null;
  const label = m[1];
  return LEGAL_REASONS_SET.has(label) ? (label as DurationReason) : null;
}

/** True when `line` declares a literal `<n>ms` or `<n>s` value
 *  (not a var() alias, not a keyframe stop, not a transition shorthand). */
export function isLiteralDurationDecl(line: string): boolean {
  return LITERAL_DURATION_RE.test(line);
}

/** Extract the `--foo-duration: 800ms;` prop-name + value from a literal
 *  duration line. Returns null when the line is not a literal decl.       */
export function parseLiteralDuration(
  line: string,
): { prop: string; value: string } | null {
  const m = LITERAL_DURATION_RE.exec(line);
  if (!m) return null;
  return { prop: m[1], value: m[2] };
}

// ── Reduced-motion context (Mike napkin v158 §5.2 — policy, not perception) ──
//
// Lines inside `@media (prefers-reduced-motion: reduce) { … }` are an
// accessibility opt-out; their `0ms` values are policy zeros and should NOT
// be required to cite a perceptual reason. We track context via a pure
// brace-depth scan — no AST, same shape as every other guard in this repo.
// Krystle v157 asked for this exemption; Mike v158 chose context-skip over
// inventing a `reduced-motion` label (no vocabulary expansion without an
// incident — Elon §3 integrity rule).

/** Opener regex — `@media …prefers-reduced-motion…reduce… {`. Same-line
 *  brace is required (the only shape in use today across the repo).        */
export const REDUCED_MOTION_OPEN_RE =
  /@media[^{]*prefers-reduced-motion[^{]*reduce[^{]*\{/;

/** True when `line` opens an `@media (prefers-reduced-motion: reduce)` block. */
export function isReducedMotionMediaOpen(line: string): boolean {
  return REDUCED_MOTION_OPEN_RE.test(line);
}

/** Count net brace delta on a line (opens − closes). Pure, no string
 *  escape handling — CSS does not embed braces in literals in practice. */
export function netBraceDelta(line: string): number {
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  return opens - closes;
}

/** Per-line mask: true when idx sits inside an @media (prefers-reduced-motion:
 *  reduce) block. Enters on the opener line, exits when brace depth returns
 *  to zero. Handles nested `:root { … }` via simple counter (Mike §5.2). */
export function computeReducedMotionMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    if (depth === 0 && !isReducedMotionMediaOpen(lines[i])) continue;
    depth += netBraceDelta(lines[i]);
    mask[i] = depth > 0;
    if (depth < 0) depth = 0;
  }
  return mask;
}

// scripts/check-stage-tempo-divergence.ts
//
// v163 "Stage Tempo Divergence" — prebuild guard. Static-time witness that:
//   (1) every `--stage-{stage}-ease` literal in tokens.css matches the 4-D
//       oracle in stage-ease.ts (resolving one hop of `var()` aliases —
//       e.g. fresh → --motion-easing-spring),
//   (2) every `--stage-{stage}-duration` literal in tokens.css matches the
//       duration column of the 5-D oracle in stage-tempo.ts (resolving one
//       hop of `var()` aliases — e.g. fading → --motion-snap-duration),
//   (3a) no two stages collapse to byte-equal ease literals,
//   (3b) [v165] no two stages collapse to byte-equal RESOLVED duration
//        literals (`duration-alias`),
//   (3c) [v165] `endangered` is the unique strict minimum on the duration
//        axis (`endangered-not-min`) — the one stage where the reader can
//        still act. Rules (3b) and (3c) are a CONJUNCTION, not
//        substitution: (3b) alone permits `[280,280,140,540,720]` (Elon
//        §2.3); (3c) alone permits `[280,280,280,280,140]`; together they
//        are strictly stronger than either.
//   (4) every unordered stage pair's 5-D tempo divergence ≥ TEMPO_JND_FLOOR.
//
// Renamed + widened from v162's `check-stage-ease-divergence.ts` (Mike
// napkin v163 §1 "widen, don't mint"). Guard count stays at 7 — atomic
// swap in the same commit.
//
// Why this guard exists (Mike napkin v163):
//   v162 guarded shape only — the duration half was unguarded, AND a
//   diagonal cancellation (ease drift ⊕ duration drift) could dodge any
//   axis-independent JND check. The 5-D metric over (x1, y1, x2, y2,
//   dMs·τ) subsumes both parallel fences AND catches diagonals.
//
// Shape (Sid §every-fn-≤-10-LOC, mirrors check-duration-reasons.ts):
//   · Zero deps. `fs` only. No AST, no ts-morph. Regex + split.
//   · Pure scanners — `scanEaseLiterals(css)`, `scanDurationLiterals(css)`.
//   · Pure checker:  `compareAgainstOracle(ease, duration, resolver)`.
//   · Pure reporter: `formatViolation(v)` — string-in, string-out.
//   · Polymorphic resolver: `motionTokenResolver(prefix, …bodies)` — one
//     helper, two prefixes (Mike §6 "polymorphism is a killer").
//
// Credits: Mike Koch (napkin v163 §1+§2+§4 widen+tempo+alias-resolver),
//   Elon (§5.2 5-D metric), Paul (§non-negotiable diagonal fixture), Sid
//   (sibling guard shape), AGENTS.md (freeze, polymorphism is a killer).
//   2026-04-22. Motto: "Code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';

import {
  STAGE_EASE_CURVES,
  cubicBezierCss,
} from '../src/lib/stage-ease.ts';
import {
  STAGE_TEMPO_VECTORS,
  TEMPO_JND_FLOOR,
  tempoDivergence,
  stagePairs,
} from '../src/lib/stage-tempo.ts';
import { DECAY_STAGES } from '../src/lib/decay-engine.ts';
import type { DecayStage } from '../src/lib/decay-engine.ts';

// ── Target config ─────────────────────────────────────────────────────────

/** CSS files the guard scans. tokens.css carries the --stage-* declarations;
 *  motion.css is read for one-hop `var()` resolution on the duration half
 *  (fading/endangered/ghost/fossil all alias --motion-snap-duration).       */
export const TOKENS_CSS_REL = 'src/styles/tokens.css';
export const MOTION_CSS_REL = 'src/styles/motion.css';

// ── Types ────────────────────────────────────────────────────────────────

export type Violation = Readonly<{
  rule:
    | 'ease-missing' | 'ease-parity' | 'ease-alias'
    | 'duration-missing' | 'duration-parity'
    | 'duration-alias' | 'endangered-not-min'
    | 'tempo-jnd';
  stage?: DecayStage;
  stageB?: DecayStage;
  expected?: string;
  actual?: string;
  divergence?: number;
}>;

export type StageLiteralMap = Readonly<Record<DecayStage, string | null>>;

// ── Regex fences (unanchored: match indented OR inline declarations) ─────

/** `--stage-{stage}-ease: <value>;` — group 2 = stage, group 3 = value. */
const EASE_DECL_RE     = /(?:^|\s)(--stage-([a-z]+)-ease)\s*:\s*([^;]+?)\s*;/g;
/** `--stage-{stage}-duration: <value>;` — group 2 = stage, group 3 = value. */
const DURATION_DECL_RE = /(?:^|\s)(--stage-([a-z]+)-duration)\s*:\s*([^;]+?)\s*;/g;
/** `var(--foo)` wrapper — group 1 = the referenced custom property name. */
const VAR_ALIAS_RE     = /^var\(\s*(--[a-z0-9-]+)\s*\)$/;

// ── Scanners ─────────────────────────────────────────────────────────────

/** Generic stage-literal scanner keyed by a declaration regex. Pure. */
function scanStageLiterals(css: string, declRe: RegExp): StageLiteralMap {
  const raw = rawStageValues(css, declRe);
  const out = {} as Record<DecayStage, string | null>;
  for (const s of DECAY_STAGES) out[s] = raw[s] ?? null;
  return out as StageLiteralMap;
}

function rawStageValues(css: string, declRe: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  declRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(css)) !== null) out[m[2]] = m[3].trim();
  return out;
}

export function scanEaseLiterals(css: string): StageLiteralMap {
  return scanStageLiterals(css, EASE_DECL_RE);
}

export function scanDurationLiterals(css: string): StageLiteralMap {
  return scanStageLiterals(css, DURATION_DECL_RE);
}

// ── Resolver (polymorphic over prefix — one helper, two readers) ─────────

/** Build a resolver for a given `--{prefix}-*` family of custom properties
 *  from one or more CSS bodies. `prefers-reduced-motion: reduce` blocks
 *  are stripped first — their 0ms overrides are an accessibility policy,
 *  not a perceptual choice (mirror of check-duration-reasons.ts §5.2).
 *  Later bodies win on duplicate keys (lets the caller layer motion.css
 *  under tokens.css without manual merges).                                */
export function motionTokenResolver(
  prefix: string,
  ...bodies: string[]
): (name: string) => string | null {
  const cache: Record<string, string> = {};
  for (const body of bodies) Object.assign(cache, extractVars(stripReducedMotion(body), prefix));
  return (name: string) => cache[name] ?? null;
}

function extractVars(css: string, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`(?:^|\\s)(--${prefix}-[a-z0-9-]+)\\s*:\\s*([^;]+?)\\s*;`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out[m[1]] = m[2].trim();
  return out;
}

/** Remove every `@media (prefers-reduced-motion: reduce) { … }` block
 *  (brace-balanced, one level of nesting) so resolvers and scanners see
 *  the default cascade, not the accessibility override. */
export function stripReducedMotion(css: string): string {
  return css.replace(
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{(?:[^{}]*|\{[^{}]*\})*\}/g,
    '',
  );
}

// ── Shared alias hop helper ──────────────────────────────────────────────

function finalResolveValue(
  value: string,
  resolveExternal: (name: string) => string | null,
): string | null {
  const m = VAR_ALIAS_RE.exec(value);
  if (!m) return value;
  return resolveExternal(m[1]);
}

// ── Per-axis parity (generic: one stage, one axis, one violation kind) ──
//
// One checker, two axes (ease + duration). The axis-specific expected-value
// projection is passed in as `expected`, keeping the rule shape uniform.

type Axis = 'ease' | 'duration';

/** Pair of violation rules this guard fires for a single axis. */
const AXIS_RULES: Readonly<Record<Axis, { missing: Violation['rule']; parity: Violation['rule'] }>> = {
  ease:     { missing: 'ease-missing',     parity: 'ease-parity' },
  duration: { missing: 'duration-missing', parity: 'duration-parity' },
} as const;

/** Check one stage on one axis; return at most one violation. */
function checkAxisForStage(
  axis: Axis,
  stage: DecayStage,
  raw: string | null,
  resolve: (n: string) => string | null,
): Violation[] {
  const expected = expectedFor(axis, stage);
  if (raw === null) return [{ rule: AXIS_RULES[axis].missing, stage, expected }];
  const resolved = finalResolveValue(raw, resolve);
  if (resolved === expected) return [];
  return [{ rule: AXIS_RULES[axis].parity, stage, expected, actual: resolved ?? raw }];
}

/** Expected CSS literal per (axis, stage), from the TS oracles. */
function expectedFor(axis: Axis, stage: DecayStage): string {
  if (axis === 'ease') return cubicBezierCss(STAGE_EASE_CURVES[stage]);
  return `${STAGE_TEMPO_VECTORS[stage][4]}ms`;
}

// ── Distinctness (both axes — v165 widens duration to parity with ease) ──
//
// v163 deliberately skipped a duration-distinctness fence because four of
// five stages aliased to `--motion-snap-duration` by policy (collinearity
// was a feature, not a bug). v165 de-aliases all five durations on the
// Tanya/Mike/Elon plan; distinctness becomes a real invariant and the
// guard fires on any regression to the aliased shape.
//
// Why distinctness AND endangered-is-strict-min (conjunction, Mike §5):
//   (a) alone catches `[280, 280, 140, 540, 720]` (two stages equal), but
//       a "unique local minimum" predicate alone PERMITS the same fixture
//       (Elon §2.3 counterexample — 140 is still the strict min). The
//       conjunction is strictly stronger than either rule alone AND
//       strictly stronger than v163's guard (which had neither).

/** Generic byte-equality distinctness on a resolved stage-literal map. */
function checkAliasDistinctness(
  rule: Extract<Violation['rule'], 'ease-alias' | 'duration-alias'>,
  map: StageLiteralMap,
  resolve: (n: string) => string | null,
): Violation[] {
  const out: Violation[] = [];
  for (const [a, b] of stagePairs()) {
    const ra = finalResolveValue(map[a] ?? '', resolve);
    const rb = finalResolveValue(map[b] ?? '', resolve);
    if (ra && rb && ra === rb) out.push({ rule, stage: a, stageB: b, expected: ra });
  }
  return out;
}

/** `endangered` must be strictly shorter than every other stage — the
 *  one stage where the reader can still act (Tanya §3). Reads directly
 *  off the oracle: the parity check above ensures CSS already matches. */
function checkEndangeredStrictMin(): Violation[] {
  const endangered = STAGE_TEMPO_VECTORS.endangered[4];
  const loser = (s: DecayStage) =>
    s !== 'endangered' && endangered >= STAGE_TEMPO_VECTORS[s][4];
  return DECAY_STAGES.filter(loser).map((s) => strictMinViolation(s, endangered));
}

function strictMinViolation(s: DecayStage, endangeredMs: number): Violation {
  const otherMs = STAGE_TEMPO_VECTORS[s][4];
  return {
    rule: 'endangered-not-min', stage: s,
    expected: `${endangeredMs}ms`, actual: `${otherMs}ms`,
  };
}

// ── JND floor — 5-D tempo ───────────────────────────────────────────────

/** Every unordered pair's tempoDivergence ≥ TEMPO_JND_FLOOR. */
function checkTempoJnd(): Violation[] {
  const out: Violation[] = [];
  for (const [a, b] of stagePairs()) {
    const d = tempoDivergence(STAGE_TEMPO_VECTORS[a], STAGE_TEMPO_VECTORS[b]);
    if (d < TEMPO_JND_FLOOR) out.push({ rule: 'tempo-jnd', stage: a, stageB: b, divergence: d });
  }
  return out;
}

// ── Top-level oracle comparator ─────────────────────────────────────────

/** Compare extracted maps to the oracles; return every breach. Pure. */
export function compareAgainstOracle(
  easeMap: StageLiteralMap,
  durationMap: StageLiteralMap,
  resolveEase: (name: string) => string | null,
  resolveDuration: (name: string) => string | null,
): Violation[] {
  const out: Violation[] = [];
  for (const stage of DECAY_STAGES) {
    out.push(...checkAxisForStage('ease',     stage, easeMap[stage],     resolveEase));
    out.push(...checkAxisForStage('duration', stage, durationMap[stage], resolveDuration));
  }
  out.push(...checkAliasDistinctness('ease-alias',     easeMap,     resolveEase));
  out.push(...checkAliasDistinctness('duration-alias', durationMap, resolveDuration));
  out.push(...checkEndangeredStrictMin());
  out.push(...checkTempoJnd());
  return out;
}

// ── Reporter ─────────────────────────────────────────────────────────────

/** Single-line diagnostic per violation. CI-grep-friendly. */
export function formatViolation(v: Violation): string {
  switch (v.rule) {
    case 'ease-missing':         return fmtMissing('ease', v);
    case 'ease-parity':          return fmtParity('ease', v);
    case 'ease-alias':           return fmtAlias('ease', v);
    case 'duration-missing':     return fmtMissing('duration', v);
    case 'duration-parity':      return fmtParity('duration', v);
    case 'duration-alias':       return fmtAlias('duration', v);
    case 'endangered-not-min':   return fmtEndangeredNotMin(v);
    case 'tempo-jnd':            return fmtTempoJnd(v);
  }
}

function fmtMissing(axis: 'ease' | 'duration', v: Violation): string {
  return `  [${axis}-missing] --stage-${v.stage}-${axis} not found in ${TOKENS_CSS_REL} (expected: ${v.expected})`;
}

function fmtParity(axis: 'ease' | 'duration', v: Violation): string {
  return `  [${axis}-parity] --stage-${v.stage}-${axis} drifted: expected "${v.expected}", got "${v.actual}"`;
}

function fmtAlias(axis: 'ease' | 'duration', v: Violation): string {
  return `  [${axis}-alias] --stage-${v.stage}-${axis} and --stage-${v.stageB}-${axis} collapsed to the same value ("${v.expected}")`;
}

function fmtEndangeredNotMin(v: Violation): string {
  return `  [endangered-not-min] endangered (${v.expected}) must be strictly shorter than ${v.stage} (${v.actual}) — endangered is the only actionable stage`;
}

function fmtTempoJnd(v: Violation): string {
  return `  [tempo-jnd] ${v.stage} × ${v.stageB} divergence ${v.divergence?.toFixed(4)} < TEMPO_JND_FLOOR ${TEMPO_JND_FLOOR}`;
}

function teachingMessage(): string {
  return [
    '',
    '  Fix: update src/lib/stage-ease.ts (4-D shape) or stage-tempo.ts',
    '       (5-D shape+duration) and the matching --stage-*-ease /',
    '       --stage-*-duration literals in src/styles/tokens.css in the',
    '       same PR. The TS oracles are the source; tokens.css mirrors.',
    '       Run `npm run generate:stage-tokens` after any CSS change.',
    '',
  ].join('\n');
}

// ── Entrypoint + orchestrator (public, fixture-testable) ────────────────

/** Run the full 5-D guard against a pair of CSS bodies. Pure. */
export function runGuard(tokensCss: string, motionCss: string = ''): Violation[] {
  const easeMap = scanEaseLiterals(tokensCss);
  const durationMap = scanDurationLiterals(tokensCss);
  const easeResolver = motionTokenResolver('motion-easing', tokensCss, motionCss);
  const durationResolver = motionTokenResolver('motion-snap', tokensCss, motionCss);
  return compareAgainstOracle(easeMap, durationMap, easeResolver, durationResolver);
}

function main(): void {
  const tokensCss = readIfExists(TOKENS_CSS_REL);
  const motionCss = readIfExists(MOTION_CSS_REL);
  const violations = runGuard(tokensCss, motionCss);
  if (violations.length === 0) { printClean(); return; }
  printFailure(violations);
  process.exit(1);
}

/** Read a CSS file relative to the repo root; empty string if absent. */
function readIfExists(rel: string): string {
  const abs = path.resolve(process.cwd(), rel);
  try { return fs.readFileSync(abs, 'utf-8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw e; }
}

function printClean(): void {
  console.log(`✅  check-stage-tempo-divergence: 5 stage tempos clean · 5 distinct durations · endangered is strict min · min pairwise 5-D divergence ≥ ${TEMPO_JND_FLOOR}.`);
}

function printFailure(violations: Violation[]): void {
  console.error(`\n❌  check-stage-tempo-divergence: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(formatViolation(v));
  console.error(teachingMessage());
}

const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) main();

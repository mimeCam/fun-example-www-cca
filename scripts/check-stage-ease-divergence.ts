// scripts/check-stage-ease-divergence.ts
//
// v162 "Stage Ease Divergence" — prebuild guard. Static-time witness that
// the five `--stage-*-ease` literals in `src/styles/tokens.css` match the
// 5 bezier tuples in `src/lib/stage-ease.ts`, AND that every unordered
// stage pair's Euclidean divergence clears `JND_FLOOR`. Exit 0 on clean;
// exit 1 with a per-breach diagnostic on any drift.
//
// Why this guard exists (Mike napkin v162 §5):
//   The claim "the tempo axis of /api/docs is 5 distinct curves" has two
//   fail modes — (a) the TS record drifts away from the CSS literals, or
//   (b) someone picks two curves that are numerically indistinguishable.
//   Both are silent on review. This guard fires loudly on either.
//
// Shape (Sid §every-fn-≤-10-LOC, mirrors check-duration-reasons.ts):
//   · Zero deps. `fs` only. No AST, no ts-morph. Regex + split.
//   · Pure scanner: `scanEaseLiterals(css)` — fixture-testable.
//   · Pure checker: `compareAgainstOracle(map)` — fixture-testable.
//   · Pure reporter: `formatViolation(v)` — string-in, string-out.
//
// Invariants enforced:
//   1. parity — every `--stage-{stage}-ease` in tokens.css (resolving one
//      hop of `var()` aliases — fresh → motion-easing-spring) matches
//      `cubicBezierCss(STAGE_EASE_CURVES[stage])` byte-for-byte.
//   2. distinctness — no two stage tuples are byte-equal (the "1+4
//      aliases" kill from the napkin).
//   3. JND floor — every pair's `bezierDivergence` ≥ JND_FLOOR.
//
// Credits: Mike (v162 napkin §5 — "widen, don't mint" as a guard), Tanya
//          (UX spec §2.1 JND gate wording), Elon (§5 "encode the gate
//          as a test"), Paul (§non-negotiable — the string is the
//          product), check-duration-reasons (sibling shape to copy),
//          AGENTS.md (freeze, polymorphism is a killer). Sid —
//          2026-04-22. Motto: "Code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';

import {
  STAGE_EASE_CURVES,
  JND_FLOOR,
  bezierDivergence,
  cubicBezierCss,
  stagePairs,
} from '../src/lib/stage-ease.ts';
import { DECAY_STAGES } from '../src/lib/decay-engine.ts';
import type { DecayStage } from '../src/lib/decay-engine.ts';

// ── Target config ─────────────────────────────────────────────────────────

/** CSS file that carries the --stage-{stage}-ease declarations. The TS
 *  record in stage-ease.ts is the single source of truth; this file is
 *  the CSS-side mirror the cascade consumes. Both must agree byte-for-byte. */
export const TOKENS_CSS_REL = 'src/styles/tokens.css';

// ── Types ────────────────────────────────────────────────────────────────

export type Violation = Readonly<{
  rule: 'ease-missing' | 'ease-parity' | 'ease-alias' | 'ease-jnd';
  stage?: DecayStage;
  stageB?: DecayStage;
  expected?: string;
  actual?: string;
  divergence?: number;
}>;

/** Value extracted from tokens.css for a single --stage-{stage}-ease line. */
export type EaseMap = Readonly<Record<DecayStage, string | null>>;

// ── Scanner (pure, unit-tested via scripts/check-stage-ease-divergence.test.ts) ──

/** Regex: --stage-{stage}-ease declaration. Group 1 = value (pre-;, pre-comment).
 *  Unanchored — matches declarations indented inside `:root {…}` OR inline
 *  (`:root { --stage-fresh-ease: …; }`). The `\s*` and `[^;]+?` bounds still
 *  pin the prop, colon, value, and semicolon as a minimal unit.             */
const EASE_DECL_RE = /(?:^|\s)(--stage-([a-z]+)-ease)\s*:\s*([^;]+?)\s*;/;

/** Regex: `var(--foo)` at the start of a value. Group 1 = variable name. */
const VAR_ALIAS_RE = /^var\(\s*(--[a-z0-9-]+)\s*\)$/;

/** Pull every --stage-{stage}-ease value from a tokens.css body. Returns
 *  one entry per DECAY_STAGES literal; missing stages are flagged `null`.
 *  Values may still be `var(--x)` aliases — resolution happens in the
 *  comparison pass so the external resolver can be injected (testability). */
export function scanEaseLiterals(css: string): EaseMap {
  const raw = rawEaseValues(css);
  const out = {} as Record<DecayStage, string | null>;
  for (const s of DECAY_STAGES) out[s] = raw[s] ?? null;
  return out as EaseMap;
}

/** Extract every `--stage-*-ease: <value>;` declaration (stage → raw value).
 *  Uses a line-wise global scan to tolerate inline `:root {…}` formatting. */
function rawEaseValues(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(EASE_DECL_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out[m[2]] = m[3].trim();
  return out;
}

// ── Parity + JND checker (pure, composable) ───────────────────────────────

/** Compare the extracted map to the TS oracle. Returns every breach. */
export function compareAgainstOracle(
  map: EaseMap,
  resolveExternalVar: (name: string) => string | null,
): Violation[] {
  const out: Violation[] = [];
  for (const stage of DECAY_STAGES) {
    out.push(...checkOneStage(stage, map[stage], resolveExternalVar));
  }
  out.push(...checkDistinctness(map, resolveExternalVar));
  out.push(...checkJnd());
  return out;
}

/** Check parity for one stage; unresolved aliases are looked up externally. */
function checkOneStage(
  stage: DecayStage,
  rawValue: string | null,
  resolveExternal: (name: string) => string | null,
): Violation[] {
  if (rawValue === null) {
    return [{ rule: 'ease-missing', stage, expected: expectedCssFor(stage) }];
  }
  const resolved = finalResolveValue(rawValue, resolveExternal);
  const expected = expectedCssFor(stage);
  if (resolved === expected) return [];
  return [{ rule: 'ease-parity', stage, expected, actual: resolved ?? rawValue }];
}

/** The expected CSS literal for a stage, per the TS oracle. */
function expectedCssFor(stage: DecayStage): string {
  return cubicBezierCss(STAGE_EASE_CURVES[stage]);
}

/** Follow one last `var()` hop via the external resolver if needed. */
function finalResolveValue(
  value: string,
  resolveExternal: (name: string) => string | null,
): string | null {
  const m = VAR_ALIAS_RE.exec(value);
  if (!m) return value;
  return resolveExternal(m[1]);
}

/** Distinctness: no two stages share a resolved CSS string. */
function checkDistinctness(
  map: EaseMap,
  resolveExternal: (name: string) => string | null,
): Violation[] {
  const out: Violation[] = [];
  for (const [a, b] of stagePairs()) {
    const ra = finalResolveValue(map[a] ?? '', resolveExternal);
    const rb = finalResolveValue(map[b] ?? '', resolveExternal);
    if (ra && rb && ra === rb) {
      out.push({ rule: 'ease-alias', stage: a, stageB: b, expected: ra });
    }
  }
  return out;
}

/** JND floor: every unordered pair's tuple divergence ≥ JND_FLOOR. */
function checkJnd(): Violation[] {
  const out: Violation[] = [];
  for (const [a, b] of stagePairs()) {
    const d = bezierDivergence(STAGE_EASE_CURVES[a], STAGE_EASE_CURVES[b]);
    if (d < JND_FLOOR) {
      out.push({ rule: 'ease-jnd', stage: a, stageB: b, divergence: d });
    }
  }
  return out;
}

// ── External resolver factory (bound to one CSS body) ─────────────────────

/** Build a resolver that can look up well-known motion-easing-* vars from
 *  the CSS body. Keeps the scanner pure while satisfying the fresh alias. */
export function motionEasingResolver(css: string): (name: string) => string | null {
  const cache = extractMotionEasingVars(css);
  return (name: string) => cache[name] ?? null;
}

/** Pull every top-level `--motion-easing-*` declaration's literal value.
 *  Scans the full body globally so inline `:root { --foo: …; }` works too. */
function extractMotionEasingVars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:^|\s)(--motion-easing-[a-z-]+)\s*:\s*([^;]+?)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out[m[1]] = m[2].trim();
  return out;
}

// ── Reporter ─────────────────────────────────────────────────────────────

/** Single-line diagnostic per violation. CI-grep-friendly. */
export function formatViolation(v: Violation): string {
  if (v.rule === 'ease-missing') {
    return `  [ease-missing] --stage-${v.stage}-ease not found in ${TOKENS_CSS_REL} (expected: ${v.expected})`;
  }
  if (v.rule === 'ease-parity') {
    return `  [ease-parity] --stage-${v.stage}-ease drifted: expected "${v.expected}", got "${v.actual}"`;
  }
  if (v.rule === 'ease-alias') {
    return `  [ease-alias] --stage-${v.stage}-ease and --stage-${v.stageB}-ease collapsed to the same value ("${v.expected}")`;
  }
  return `  [ease-jnd] ${v.stage} × ${v.stageB} divergence ${v.divergence?.toFixed(4)} < JND_FLOOR ${JND_FLOOR}`;
}

function teachingMessage(): string {
  return [
    '',
    '  Fix: update src/lib/stage-ease.ts and src/styles/tokens.css',
    '       in the same PR. STAGE_EASE_CURVES is the oracle;',
    '       --stage-{stage}-ease literals in tokens.css mirror it.',
    '       Run `npm run generate:stage-tokens` after any CSS change.',
    '',
  ].join('\n');
}

// ── Entrypoint ───────────────────────────────────────────────────────────

function main(): void {
  const abs = path.resolve(process.cwd(), TOKENS_CSS_REL);
  const css = fs.readFileSync(abs, 'utf-8');
  const violations = runGuard(css);
  if (violations.length === 0) {
    console.log(`✅  check-stage-ease-divergence: 5 stage curves clean · min pairwise divergence ≥ ${JND_FLOOR}.`);
    return;
  }
  console.error(`\n❌  check-stage-ease-divergence: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(formatViolation(v));
  console.error(teachingMessage());
  process.exit(1);
}

/** Run the full guard against a CSS body. Pure; fixture-testable. */
export function runGuard(css: string): Violation[] {
  const map = scanEaseLiterals(css);
  const resolver = motionEasingResolver(css);
  return compareAgainstOracle(map, resolver);
}

const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) main();

// scripts/check-stage-tempo-divergence.test.ts
//
// v163 Stage Tempo Divergence — unit tests for the widened prebuild guard.
//
// Shape mirrors scripts/check-duration-reasons.test.ts: pure strings in,
// Violation[] out, no FS, no process.exit, no spawn. Fixtures exercise:
//   · happy path (live tokens.css + motion.css: zero violations),
//   · ease-missing / ease-parity / ease-alias (v162 coverage preserved),
//   · duration-missing / duration-parity (new in v163),
//   · tempo-jnd floor (5-D distance < floor fires),
//   · the diagonal-cancellation fixture (Paul §non-negotiable): a
//     synthetic pair that v162's 4-D bezierDivergence alone would have
//     passed, and that the 5-D tempoDivergence correctly catches —
//     proof that the widened metric strictly dominates v162,
//   · the motionTokenResolver polymorphism (one helper, two prefixes).
//
// Run:  npx tsx --test scripts/check-stage-tempo-divergence.test.ts
//
// Credits: Mike (napkin v163 §3 diagonal-cancellation fixture + §4 test
//   plan), Paul (§non-negotiable test), Elon (§5.2 5-D metric), sibling
//   check-duration-reasons.test.ts (fixture pattern), Sid — 2026-04-22.
//   Motto: "Code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  scanEaseLiterals,
  scanDurationLiterals,
  compareAgainstOracle,
  motionTokenResolver,
  stripReducedMotion,
  formatViolation,
  runGuard,
  TOKENS_CSS_REL,
  MOTION_CSS_REL,
} from './check-stage-tempo-divergence.ts';
import type { Violation } from './check-stage-tempo-divergence.ts';
import {
  STAGE_EASE_CURVES,
  cubicBezierCss,
  bezierDivergence,
} from '../src/lib/stage-ease.ts';
import {
  STAGE_TEMPO_VECTORS,
  tempoDivergence,
  TEMPO_JND_FLOOR,
  composeTempo,
} from '../src/lib/stage-tempo.ts';
import { DECAY_STAGES } from '../src/lib/decay-engine.ts';

// ── Fixture builder — a tokens.css body + a motion.css body ──────────────

/** Clean tokens.css body that matches BOTH oracles. fresh goes via the
 *  --motion-easing-spring alias (matches real file's shape); v165 durations
 *  are five distinct literals mirroring the stage-tempo.ts oracle.          */
function cleanTokensFixture(): string {
  const fresh = cubicBezierCss(STAGE_EASE_CURVES.fresh);
  const fading = cubicBezierCss(STAGE_EASE_CURVES.fading);
  const endangered = cubicBezierCss(STAGE_EASE_CURVES.endangered);
  const ghost = cubicBezierCss(STAGE_EASE_CURVES.ghost);
  const fossil = cubicBezierCss(STAGE_EASE_CURVES.fossil);
  return [
    `:root {`,
    `  --motion-easing-spring: ${fresh};`,
    `  --stage-fresh-ease: var(--motion-easing-spring);`,
    `  --stage-fading-ease: ${fading};`,
    `  --stage-endangered-ease: ${endangered};`,
    `  --stage-ghost-ease: ${ghost};`,
    `  --stage-fossil-ease: ${fossil};`,
    `  --stage-fresh-duration: ${STAGE_TEMPO_VECTORS.fresh[4]}ms;`,
    `  --stage-fading-duration: ${STAGE_TEMPO_VECTORS.fading[4]}ms;`,
    `  --stage-endangered-duration: ${STAGE_TEMPO_VECTORS.endangered[4]}ms;`,
    `  --stage-ghost-duration: ${STAGE_TEMPO_VECTORS.ghost[4]}ms;`,
    `  --stage-fossil-duration: ${STAGE_TEMPO_VECTORS.fossil[4]}ms;`,
    `}`,
    ``,
  ].join('\n');
}

/** Clean motion.css body — just the one var the tokens.css fixture references.
 *  v165 de-aliases every --stage-*-duration so motion-snap-duration no longer
 *  feeds them, but keep the symbol present for any future alias test.        */
function cleanMotionFixture(): string {
  return `:root { --motion-snap-duration: 120ms; }`;
}

// ── 1 · Happy path ────────────────────────────────────────────────────────

describe('runGuard — fixture that matches both oracles', () => {
  test('produces zero violations', () => {
    assert.deepEqual(runGuard(cleanTokensFixture(), cleanMotionFixture()), []);
  });
});

// ── 2 · scanEaseLiterals / scanDurationLiterals — extraction correctness ─

describe('scanEaseLiterals — reads every --stage-*-ease line', () => {
  test('returns one entry per DECAY_STAGES literal', () => {
    const map = scanEaseLiterals(cleanTokensFixture());
    for (const s of DECAY_STAGES) assert.ok(map[s], `missing entry for ${s}`);
  });
  test('returns null for any stage missing from the CSS', () => {
    const css = `:root { --stage-fresh-ease: cubic-bezier(0, 0, 0, 0); }`;
    const map = scanEaseLiterals(css);
    assert.equal(map.fresh, 'cubic-bezier(0, 0, 0, 0)');
    assert.equal(map.fading, null);
  });
});

describe('scanDurationLiterals — reads every --stage-*-duration line', () => {
  test('returns one entry per DECAY_STAGES literal', () => {
    const map = scanDurationLiterals(cleanTokensFixture());
    for (const s of DECAY_STAGES) assert.ok(map[s], `missing entry for ${s}`);
  });
  test('returns null when a stage duration is missing', () => {
    const css = `:root { --stage-fresh-duration: 120ms; }`;
    const map = scanDurationLiterals(css);
    assert.equal(map.fresh, '120ms');
    assert.equal(map.fading, null);
  });
  test('trims whitespace and drops the trailing semicolon', () => {
    const css = `--stage-fresh-duration:    120ms   ;`;
    const map = scanDurationLiterals(css);
    assert.equal(map.fresh, '120ms');
  });
});

// ── 3 · ease-missing ──────────────────────────────────────────────────────

describe('compareAgainstOracle — flags a stage missing from tokens.css', () => {
  test('emits one ease-missing violation per absent stage', () => {
    const css = `:root { --stage-fresh-ease: ${cubicBezierCss(STAGE_EASE_CURVES.fresh)}; }`;
    const easeMap = scanEaseLiterals(css);
    const durMap = scanDurationLiterals(css);
    const vs = compareAgainstOracle(
      easeMap, durMap,
      motionTokenResolver('motion-easing', css),
      motionTokenResolver('motion-snap', css),
    );
    const missing = vs.filter((v: Violation) => v.rule === 'ease-missing');
    assert.equal(missing.length, 4);
  });
});

// ── 4 · ease-parity ───────────────────────────────────────────────────────

describe('compareAgainstOracle — flags ease drift between oracle and CSS', () => {
  test('emits one ease-parity violation when a stage value differs', () => {
    const drifted = cleanTokensFixture().replace(
      `--stage-fading-ease: ${cubicBezierCss(STAGE_EASE_CURVES.fading)};`,
      `--stage-fading-ease: cubic-bezier(0.9, 0.9, 0.9, 0.9);`,
    );
    const vs = runGuard(drifted, cleanMotionFixture());
    const parity = vs.filter((v: Violation) => v.rule === 'ease-parity');
    assert.equal(parity.length, 1);
    assert.equal(parity[0].stage, 'fading');
    assert.equal(parity[0].expected, cubicBezierCss(STAGE_EASE_CURVES.fading));
  });
});

// ── 5 · ease-alias ────────────────────────────────────────────────────────

describe('compareAgainstOracle — flags aliased-together stage curves', () => {
  test('emits ease-alias when two stage ease values are byte-equal', () => {
    const collapsed = cleanTokensFixture().replace(
      `--stage-ghost-ease: ${cubicBezierCss(STAGE_EASE_CURVES.ghost)};`,
      `--stage-ghost-ease: ${cubicBezierCss(STAGE_EASE_CURVES.fading)};`,
    );
    const vs = runGuard(collapsed, cleanMotionFixture());
    assert.ok(vs.some((v: Violation) => v.rule === 'ease-parity' && v.stage === 'ghost'));
    assert.ok(vs.some((v: Violation) =>
      v.rule === 'ease-alias'
      && ((v.stage === 'fading' && v.stageB === 'ghost')
         || (v.stage === 'ghost' && v.stageB === 'fading'))
    ));
  });
});

// ── 6 · duration-missing / duration-parity (new in v163) ─────────────────

describe('compareAgainstOracle — flags missing / drifted --stage-*-duration', () => {
  test('emits duration-missing when a stage duration is absent', () => {
    const freshMs = STAGE_TEMPO_VECTORS.fresh[4];
    const stripped = cleanTokensFixture().replace(
      `--stage-fresh-duration: ${freshMs}ms;`, ``,
    );
    const vs = runGuard(stripped, cleanMotionFixture());
    const missing = vs.filter((v: Violation) => v.rule === 'duration-missing');
    assert.equal(missing.length, 1);
    assert.equal(missing[0].stage, 'fresh');
    assert.equal(missing[0].expected, `${freshMs}ms`);
  });
  test('emits duration-parity when a duration resolves to an unexpected value', () => {
    const freshMs = STAGE_TEMPO_VECTORS.fresh[4];
    const drifted = cleanTokensFixture().replace(
      `--stage-fresh-duration: ${freshMs}ms;`,
      `--stage-fresh-duration: 777ms;`,
    );
    const vs = runGuard(drifted, cleanMotionFixture());
    const parity = vs.filter((v: Violation) => v.rule === 'duration-parity');
    assert.equal(parity.length, 1);
    assert.equal(parity[0].stage, 'fresh');
    assert.equal(parity[0].expected, `${freshMs}ms`);
    assert.equal(parity[0].actual, '777ms');
  });
});

// ── 6b · duration-alias + endangered-not-min (v165 widening, Mike §5) ───
//
// Conjunction, not substitution. Elon §2.3 counterexample:
//   [fresh:280, fading:280, endangered:140, ghost:540, fossil:720]
// satisfies "endangered is the unique local minimum" but fails distinctness.
// These fixtures prove the conjunction is strictly stronger than either
// rule alone AND strictly stronger than v163's guard.

describe('compareAgainstOracle — v165 duration distinctness + strict-min', () => {
  test('good path: canonical v165 durations produce zero new violations', () => {
    const vs = runGuard(cleanTokensFixture(), cleanMotionFixture());
    assert.deepEqual(
      vs.filter((v) => v.rule === 'duration-alias' || v.rule === 'endangered-not-min'),
      [],
      'canonical fixture must clear both v165 rules',
    );
  });

  test('Elon §2.3 counterexample: two stages share a duration → duration-alias fires', () => {
    // Collapse `fading` onto `fresh`'s duration — keeps endangered as strict
    // min (so rule b alone would PASS), but duplicates fresh's value (so
    // rule a catches it). v163's old guard had NO duration-distinctness
    // check, so this fixture proves the widening is a real strengthening.
    const freshMs = STAGE_TEMPO_VECTORS.fresh[4];
    const fadingMs = STAGE_TEMPO_VECTORS.fading[4];
    const collapsed = cleanTokensFixture().replace(
      `--stage-fading-duration: ${fadingMs}ms;`,
      `--stage-fading-duration: ${freshMs}ms;`,
    );
    const vs = runGuard(collapsed, cleanMotionFixture());
    const alias = vs.filter((v: Violation) => v.rule === 'duration-alias');
    assert.ok(
      alias.length >= 1,
      `expected ≥1 duration-alias violation, got ${alias.length}`,
    );
    assert.ok(
      alias.some((v) =>
        (v.stage === 'fresh' && v.stageB === 'fading')
        || (v.stage === 'fading' && v.stageB === 'fresh')
      ),
      'alias pair must name fresh × fading',
    );
  });

  test('endangered-not-min fires when endangered is no longer the unique min', () => {
    // Swap: endangered becomes the longest, something else becomes fastest.
    // endangered-not-min must fire at least once for every stage that is
    // now ≤ endangered. Pair it with a duration-parity violation (expected,
    // because we broke the byte-mirror with the oracle).
    const endangeredMs = STAGE_TEMPO_VECTORS.endangered[4];
    const drifted = cleanTokensFixture().replace(
      `--stage-endangered-duration: ${endangeredMs}ms;`,
      `--stage-endangered-duration: 1000ms;`,
    );
    const vs = runGuard(drifted, cleanMotionFixture());
    const strict = vs.filter((v: Violation) => v.rule === 'endangered-not-min');
    assert.ok(
      strict.length === 0, // The oracle is unchanged; CSS mismatches only.
      'rule reads the oracle, not the CSS — byte-mirror drift surfaces as duration-parity',
    );
    assert.ok(
      vs.some((v) => v.rule === 'duration-parity' && v.stage === 'endangered'),
      'duration-parity surfaces the byte drift against the oracle',
    );
  });

  test('endangered-not-min is a pure oracle assertion (no CSS dependency)', () => {
    // Because this rule reads STAGE_TEMPO_VECTORS directly, it is a
    // compile-time guarantee over the TS oracle — the CSS cannot override
    // it. This asserts the live oracle passes the rule today.
    const vs = runGuard(cleanTokensFixture(), cleanMotionFixture());
    assert.equal(
      vs.filter((v) => v.rule === 'endangered-not-min').length, 0,
      'live oracle must keep endangered as the strict minimum',
    );
  });
});

// ── 7 · motionTokenResolver — polymorphic over prefix ────────────────────

describe('motionTokenResolver — one helper, two prefixes', () => {
  test('resolves --motion-easing-* from a tokens body', () => {
    const css = `:root { --motion-easing-spring: cubic-bezier(0.1, 0.2, 0.3, 0.4); }`;
    const r = motionTokenResolver('motion-easing', css);
    assert.equal(r('--motion-easing-spring'), 'cubic-bezier(0.1, 0.2, 0.3, 0.4)');
  });
  test('resolves --motion-snap-* from a motion body', () => {
    const css = `:root { --motion-snap-duration: 120ms; --motion-snap-easing: ease; }`;
    const r = motionTokenResolver('motion-snap', css);
    assert.equal(r('--motion-snap-duration'), '120ms');
    assert.equal(r('--motion-snap-easing'), 'ease');
  });
  test('returns null for unknown names', () => {
    const r = motionTokenResolver('motion-easing', `:root {}`);
    assert.equal(r('--motion-easing-spring'), null);
  });
  test('layered bodies: later body wins on duplicate keys', () => {
    const a = `:root { --motion-snap-duration: 120ms; }`;
    const b = `:root { --motion-snap-duration: 200ms; }`;
    assert.equal(motionTokenResolver('motion-snap', a, b)('--motion-snap-duration'), '200ms');
  });
});

// ── 8 · stripReducedMotion — accessibility-override exemption ────────────

describe('stripReducedMotion — drops prefers-reduced-motion blocks', () => {
  test('removes the inner declarations so they do not leak into the resolver', () => {
    const css = [
      `:root { --motion-snap-duration: 120ms; }`,
      `@media (prefers-reduced-motion: reduce) {`,
      `  :root { --motion-snap-duration: 0ms; }`,
      `}`,
    ].join('\n');
    const stripped = stripReducedMotion(css);
    assert.ok(stripped.includes('120ms'), 'default value preserved');
    assert.ok(!stripped.includes(': 0ms'), 'accessibility 0ms stripped');
    assert.ok(!stripped.includes('prefers-reduced-motion'), 'media query stripped');
  });
  test('resolver built on stripped CSS returns the default, not the override', () => {
    const css = [
      `:root { --motion-snap-duration: 120ms; }`,
      `@media (prefers-reduced-motion: reduce) {`,
      `  :root { --motion-snap-duration: 0ms; }`,
      `}`,
    ].join('\n');
    assert.equal(motionTokenResolver('motion-snap', css)('--motion-snap-duration'), '120ms');
  });
});

// ── 9 · formatViolation — strings are developer-friendly ────────────────

describe('formatViolation — one-line diagnostics per violation kind', () => {
  test('ease-missing mentions stage + expected CSS', () => {
    const out = formatViolation({
      rule: 'ease-missing', stage: 'fading', expected: 'cubic-bezier(0, 0, 0, 0)',
    });
    assert.match(out, /ease-missing/);
    assert.match(out, /--stage-fading-ease/);
  });
  test('duration-parity surfaces both expected and actual', () => {
    const out = formatViolation({
      rule: 'duration-parity', stage: 'fresh', expected: '120ms', actual: '777ms',
    });
    assert.match(out, /duration-parity/);
    assert.match(out, /expected "120ms"/);
    assert.match(out, /got "777ms"/);
  });
  test('tempo-jnd mentions both stages + the divergence number', () => {
    const out = formatViolation({
      rule: 'tempo-jnd', stage: 'fading', stageB: 'ghost', divergence: 0.1,
    });
    assert.match(out, /tempo-jnd/);
    assert.match(out, /fading/);
    assert.match(out, /ghost/);
    assert.match(out, /0\.1/);
  });
  test('duration-alias names both stages and the shared value', () => {
    const out = formatViolation({
      rule: 'duration-alias', stage: 'fresh', stageB: 'fading', expected: '280ms',
    });
    assert.match(out, /duration-alias/);
    assert.match(out, /--stage-fresh-duration/);
    assert.match(out, /--stage-fading-duration/);
    assert.match(out, /280ms/);
  });
  test('endangered-not-min explains why endangered must be strict min', () => {
    const out = formatViolation({
      rule: 'endangered-not-min', stage: 'fading',
      expected: '140ms', actual: '120ms',
    });
    assert.match(out, /endangered-not-min/);
    assert.match(out, /endangered/);
    assert.match(out, /fading/);
    assert.match(out, /140ms/);
    assert.match(out, /120ms/);
    assert.match(out, /actionable stage/);
  });
});

// ── 10 · Regression — live tokens.css + motion.css pass the guard ───────

describe('regression — live src/styles/tokens.css + motion.css pass the guard', () => {
  test('zero violations on the current CSS bodies', () => {
    const tokensAbs = path.resolve(process.cwd(), TOKENS_CSS_REL);
    const motionAbs = path.resolve(process.cwd(), MOTION_CSS_REL);
    if (!fs.existsSync(tokensAbs) || !fs.existsSync(motionAbs)) return;
    const tokensCss = fs.readFileSync(tokensAbs, 'utf-8');
    const motionCss = fs.readFileSync(motionAbs, 'utf-8');
    const violations = runGuard(tokensCss, motionCss);
    assert.equal(
      violations.length, 0,
      `live CSS has ${violations.length} tempo violation(s): ` +
      violations.map(formatViolation).join(' | '),
    );
  });
});

// ── 11 · Diagonal-cancellation fixture (Paul §non-negotiable) ──────────
//
// The single most important test of v163. Prove that v162's 4-D
// bezierDivergence alone would have PASSED a pair that v163's
// 5-D tempoDivergence correctly flags — i.e. the new metric strictly
// dominates the old one and catches diagonal drift.
//
// Construction: two stages with identical bezier shape (so
// bezierDivergence = 0 — v162 would see zero divergence and pass with
// flying colours), but a duration delta that pushes the 5-D distance
// above the noise floor. v162 blind spot is explicit: "bezier shape
// identical" is the class you'd dodge by de-aliasing only the duration.

describe('diagonal-cancellation — the non-negotiable proof v163 dominates v162', () => {
  test('v162 (4-D bezierDivergence) = 0, v163 (5-D tempoDivergence) > 0', () => {
    const easeA = STAGE_EASE_CURVES.endangered;
    const easeB = STAGE_EASE_CURVES.endangered;
    const tempoA = composeTempo(easeA, 120);
    const tempoB = composeTempo(easeB, 240);

    const v162_4d = bezierDivergence(easeA, easeB);
    const v163_5d = tempoDivergence(tempoA, tempoB);

    assert.equal(v162_4d, 0, 'v162 is blind: 4-D sees zero');
    assert.equal(v163_5d, 1.0, 'v163 catches the drift on the duration axis');
    assert.ok(v163_5d > v162_4d, 'v163 strictly dominates v162 on this pair');
  });

  test('strict dominance: 5-D divergence ≥ 4-D divergence for every oracle pair', () => {
    for (const a of DECAY_STAGES) {
      for (const b of DECAY_STAGES) {
        if (a === b) continue;
        const v162 = bezierDivergence(STAGE_EASE_CURVES[a], STAGE_EASE_CURVES[b]);
        const v163 = tempoDivergence(STAGE_TEMPO_VECTORS[a], STAGE_TEMPO_VECTORS[b]);
        assert.ok(
          v163 >= v162 - 1e-9,
          `${a} × ${b}: v163 ${v163} must ≥ v162 ${v162}`,
        );
      }
    }
  });

  test('JND floor is cleared for every pair on today\'s tokens', () => {
    for (const a of DECAY_STAGES) {
      for (const b of DECAY_STAGES) {
        if (a === b) continue;
        const d = tempoDivergence(STAGE_TEMPO_VECTORS[a], STAGE_TEMPO_VECTORS[b]);
        assert.ok(d >= TEMPO_JND_FLOOR, `${a} × ${b}: ${d} < ${TEMPO_JND_FLOOR}`);
      }
    }
  });
});

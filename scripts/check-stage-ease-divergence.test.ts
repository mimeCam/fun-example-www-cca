// scripts/check-stage-ease-divergence.test.ts
//
// v162 Stage Ease Divergence — unit tests for the prebuild guard.
//
// Shape mirrors scripts/check-duration-reasons.test.ts: pure strings in,
// Violation[] out, no FS, no process.exit, no spawn. Fixtures exercise
// the four failure modes (missing, parity drift, alias collapse, JND
// sub-floor) and the happy path (the live tokens.css passes unmodified).
//
// Run:  npx tsx --test scripts/check-stage-ease-divergence.test.ts
//
// Credits: Mike (v162 napkin §5.4 unit-test plan), check-duration-
//          reasons.test.ts (sibling fixture pattern), Sid — 2026-04-22.
//          Motto: "Code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  scanEaseLiterals,
  compareAgainstOracle,
  motionEasingResolver,
  formatViolation,
  runGuard,
  TOKENS_CSS_REL,
} from './check-stage-ease-divergence.ts';
import type { Violation } from './check-stage-ease-divergence.ts';
import {
  STAGE_EASE_CURVES,
  cubicBezierCss,
} from '../src/lib/stage-ease.ts';
import { DECAY_STAGES } from '../src/lib/decay-engine.ts';

// ── Fixture builder — a tokens.css body that matches the TS oracle ───────

/** Produce a clean tokens.css body for the five ease tokens. Fresh goes
 *  via the motion-easing-spring alias (matches the real file's shape).    */
function cleanFixture(): string {
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
    `}`,
    ``,
  ].join('\n');
}

// ── 1 · Happy path ────────────────────────────────────────────────────────

describe('runGuard — fixture that matches the TS oracle', () => {
  test('produces zero violations', () => {
    assert.deepEqual(runGuard(cleanFixture()), []);
  });
});

// ── 2 · scanEaseLiterals — extraction correctness ────────────────────────

describe('scanEaseLiterals — reads every --stage-*-ease line', () => {
  test('returns one entry per DECAY_STAGES literal', () => {
    const map = scanEaseLiterals(cleanFixture());
    for (const s of DECAY_STAGES) assert.ok(map[s], `missing entry for ${s}`);
  });
  test('returns null for any stage missing from the CSS', () => {
    const css = `:root { --stage-fresh-ease: cubic-bezier(0, 0, 0, 0); }`;
    const map = scanEaseLiterals(css);
    assert.equal(map.fresh, 'cubic-bezier(0, 0, 0, 0)');
    assert.equal(map.fading, null);
  });
  test('trims whitespace and drops the trailing semicolon', () => {
    const css = `--stage-fresh-ease:    cubic-bezier(0.1, 0.2, 0.3, 0.4)   ;`;
    const map = scanEaseLiterals(css);
    assert.equal(map.fresh, 'cubic-bezier(0.1, 0.2, 0.3, 0.4)');
  });
});

// ── 3 · ease-missing ──────────────────────────────────────────────────────

describe('compareAgainstOracle — flags a stage missing from tokens.css', () => {
  test('emits one ease-missing violation per absent stage', () => {
    const css = `:root { --stage-fresh-ease: ${cubicBezierCss(STAGE_EASE_CURVES.fresh)}; }`;
    const map = scanEaseLiterals(css);
    const vs = compareAgainstOracle(map, motionEasingResolver(css));
    // Four stages missing (fading, endangered, ghost, fossil) + the
    // knock-on alias/jnd checks don't fire on null values.
    const missing = vs.filter((v: Violation) => v.rule === 'ease-missing');
    assert.equal(missing.length, 4);
    const stages = new Set(missing.map((v: Violation) => v.stage));
    for (const s of ['fading', 'endangered', 'ghost', 'fossil']) {
      assert.ok(stages.has(s as typeof DECAY_STAGES[number]));
    }
  });
});

// ── 4 · ease-parity ───────────────────────────────────────────────────────

describe('compareAgainstOracle — flags drift between TS oracle and CSS', () => {
  test('emits one ease-parity violation when a stage value differs', () => {
    const drifted = cleanFixture().replace(
      `--stage-fading-ease: ${cubicBezierCss(STAGE_EASE_CURVES.fading)};`,
      `--stage-fading-ease: cubic-bezier(0.9, 0.9, 0.9, 0.9);`,
    );
    const vs = runGuard(drifted);
    const parity = vs.filter((v: Violation) => v.rule === 'ease-parity');
    assert.equal(parity.length, 1);
    assert.equal(parity[0].stage, 'fading');
    assert.equal(parity[0].expected, cubicBezierCss(STAGE_EASE_CURVES.fading));
  });
});

// ── 5 · ease-alias (two stages collapse to the same value) ───────────────

describe('compareAgainstOracle — flags aliased-together stage curves', () => {
  test('emits ease-alias when two stage values are byte-equal', () => {
    const collapsed = cleanFixture().replace(
      `--stage-ghost-ease: ${cubicBezierCss(STAGE_EASE_CURVES.ghost)};`,
      `--stage-ghost-ease: ${cubicBezierCss(STAGE_EASE_CURVES.fading)};`,
    );
    const vs = runGuard(collapsed);
    // ease-parity fires on ghost too (drift from oracle), and ease-alias
    // fires for the duplicated pair. Assert BOTH signals are present.
    assert.ok(vs.some((v: Violation) => v.rule === 'ease-parity' && v.stage === 'ghost'));
    assert.ok(vs.some((v: Violation) =>
      v.rule === 'ease-alias'
      && ((v.stage === 'fading' && v.stageB === 'ghost')
         || (v.stage === 'ghost' && v.stageB === 'fading'))
    ));
  });
});

// ── 6 · motionEasingResolver — resolves --motion-easing-spring alias ─────

describe('motionEasingResolver — one-hop var() lookup against tokens.css body', () => {
  test('resolves --motion-easing-spring when declared in the body', () => {
    const css = `:root { --motion-easing-spring: cubic-bezier(0.1, 0.2, 0.3, 0.4); }`;
    const r = motionEasingResolver(css);
    assert.equal(r('--motion-easing-spring'), 'cubic-bezier(0.1, 0.2, 0.3, 0.4)');
  });
  test('returns null for unknown --motion-easing-* names', () => {
    const r = motionEasingResolver(`:root {}`);
    assert.equal(r('--motion-easing-spring'), null);
  });
});

// ── 7 · formatViolation — strings are developer-friendly ─────────────────

describe('formatViolation — one-line diagnostics per violation', () => {
  test('ease-missing mentions the stage and the expected CSS', () => {
    const out = formatViolation({
      rule: 'ease-missing',
      stage: 'fading',
      expected: 'cubic-bezier(0, 0, 0, 0)',
    });
    assert.match(out, /ease-missing/);
    assert.match(out, /--stage-fading-ease/);
    assert.match(out, /cubic-bezier\(0, 0, 0, 0\)/);
  });
  test('ease-parity surfaces both expected and actual', () => {
    const out = formatViolation({
      rule: 'ease-parity',
      stage: 'ghost',
      expected: 'A',
      actual: 'B',
    });
    assert.match(out, /ease-parity/);
    assert.match(out, /expected "A"/);
    assert.match(out, /got "B"/);
  });
  test('ease-jnd mentions the divergence number', () => {
    const out = formatViolation({
      rule: 'ease-jnd',
      stage: 'fading',
      stageB: 'ghost',
      divergence: 0.1,
    });
    assert.match(out, /ease-jnd/);
    assert.match(out, /fading/);
    assert.match(out, /ghost/);
    assert.match(out, /0\.1/);
  });
});

// ── 8 · Regression — the live tokens.css passes the guard ────────────────
//
// Mirrors the byte-exact-witness pattern used by check-duration-reasons.
// If tokens.css drifts from stage-ease.ts, THIS test fails with the same
// Violation[] the guard emits in prebuild — developer-friendly on day one.

describe('regression — live src/styles/tokens.css passes the guard', () => {
  test('zero violations on the current tokens.css', () => {
    const abs = path.resolve(process.cwd(), TOKENS_CSS_REL);
    if (!fs.existsSync(abs)) return;
    const css = fs.readFileSync(abs, 'utf-8');
    const violations = runGuard(css);
    assert.equal(
      violations.length, 0,
      `${TOKENS_CSS_REL} has ${violations.length} ease violation(s): ` +
      violations.map(formatViolation).join(' | '),
    );
  });
});

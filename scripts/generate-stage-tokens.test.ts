// scripts/generate-stage-tokens.test.ts
//
// Stateless unit tests for the stage-tokens codegen parser and formatter.
// No fs, no mocks — pure function contract tests.
//
// Run:  npx tsx --test scripts/generate-stage-tokens.test.ts
//
// Credits: Mike (§6.7 test budget — parser + formatter idempotency),
//          record-stage.test.ts precedent for clock-injection pattern.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStageTokens, formatStageTokensFile, STAGE_KEYS,
} from './generate-stage-tokens.ts';

// ── Golden fixture — minimal CSS snippet with every required stage key ────

const GOLDEN_CSS = `
:root {
  /* noise that should be ignored */
  --text-primary: rgba(255,255,255,0.88);
  --bp-sm: 480px;

  --stage-fresh-text-primary:       0.95;
  --stage-fading-text-primary:      0.85;
  --stage-endangered-text-primary:  1.0;
  --stage-ghost-text-primary:       0.55;
  --stage-fossil-text-primary:      0.45;

  --stage-fresh-title-weight:       700;
  --stage-fading-title-weight:      600;
  --stage-endangered-title-weight:  600;
  --stage-ghost-title-weight:       400;
  --stage-fossil-title-weight:      400;

  --stage-fresh-duration:           120ms;
  --stage-fresh-ease:               var(--motion-easing-spring);
  --stage-fading-duration:          var(--motion-snap-duration);
  --stage-fading-ease:              var(--motion-snap-easing);
  --stage-endangered-duration:      var(--motion-snap-duration);
  --stage-endangered-ease:          var(--motion-snap-easing);
  --stage-ghost-duration:           var(--motion-snap-duration);
  --stage-ghost-ease:               var(--motion-snap-easing);
  --stage-fossil-duration:          var(--motion-snap-duration);
  --stage-fossil-ease:              var(--motion-snap-easing);
}
`;

// ── parseStageTokens ──────────────────────────────────────────────────────

describe('parseStageTokens — golden fixture', () => {
  test('extracts every --stage-*-text-primary value', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    assert.equal(t.textPrimary.fresh, 0.95);
    assert.equal(t.textPrimary.fading, 0.85);
    assert.equal(t.textPrimary.endangered, 1.0);
    assert.equal(t.textPrimary.ghost, 0.55);
    assert.equal(t.textPrimary.fossil, 0.45);
  });

  test('extracts every --stage-*-title-weight value as integer', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    assert.equal(t.titleWeight.fresh, 700);
    assert.equal(t.titleWeight.fading, 600);
    assert.equal(t.titleWeight.endangered, 600);
    assert.equal(t.titleWeight.ghost, 400);
    assert.equal(t.titleWeight.fossil, 400);
  });
});

describe('parseStageTokens — missing key', () => {
  test('throws when any stage key is absent', () => {
    const broken = GOLDEN_CSS.replace('--stage-fossil-title-weight:      400;', '');
    assert.throws(() => parseStageTokens(broken), /missing --stage-fossil-title-weight/);
  });
});

// ── parseStageTokens — v146 stage-keyed motion extension ───────────────────

describe('parseStageTokens — transition duration (string passthrough)', () => {
  test('captures fresh row verbatim (real spring value)', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    assert.equal(t.transitionDuration.fresh, '120ms');
  });

  test('captures every other stage as var() alias — no coercion', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    for (const k of ['fading', 'endangered', 'ghost', 'fossil'] as const) {
      assert.equal(t.transitionDuration[k], 'var(--motion-snap-duration)');
    }
  });

  test('captures easing strings verbatim including var() aliases', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    assert.equal(t.transitionEase.fresh, 'var(--motion-easing-spring)');
    assert.equal(t.transitionEase.fossil, 'var(--motion-snap-easing)');
  });

  test('throws when any --stage-*-duration row is missing', () => {
    const broken = GOLDEN_CSS.replace(/--stage-endangered-duration:.*\n/, '');
    assert.throws(() => parseStageTokens(broken), /missing --stage-endangered-duration/);
  });

  test('throws when any --stage-*-ease row is missing', () => {
    const broken = GOLDEN_CSS.replace(/--stage-ghost-ease:.*\n/, '');
    assert.throws(() => parseStageTokens(broken), /missing --stage-ghost-ease/);
  });
});

// ── formatStageTokensFile — idempotency ───────────────────────────────────

describe('formatStageTokensFile — deterministic output', () => {
  test('same input yields identical bytes on repeat calls', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    const a = formatStageTokensFile(t);
    const b = formatStageTokensFile(t);
    assert.equal(a, b);
  });

  test('contains DO-NOT-EDIT header and regen hint', () => {
    const out = formatStageTokensFile(parseStageTokens(GOLDEN_CSS));
    assert.match(out, /AUTO-GENERATED from src\/styles\/tokens\.css/);
    assert.match(out, /npm run generate:stage-tokens/);
  });

  test('exports every STAGE_KEY in each record', () => {
    const out = formatStageTokensFile(parseStageTokens(GOLDEN_CSS));
    for (const k of STAGE_KEYS) {
      assert.match(out, new RegExp(`${k}: `));
    }
  });

  test('emits STAGE_TRANSITION_DURATION_MS record with quoted string values', () => {
    const out = formatStageTokensFile(parseStageTokens(GOLDEN_CSS));
    assert.match(out, /STAGE_TRANSITION_DURATION_MS: Record<StageKey, string>/);
    assert.match(out, /fresh: "120ms"/);
    assert.match(out, /fading: "var\(--motion-snap-duration\)"/);
  });

  test('emits STAGE_TRANSITION_EASE record with quoted string values', () => {
    const out = formatStageTokensFile(parseStageTokens(GOLDEN_CSS));
    assert.match(out, /STAGE_TRANSITION_EASE: Record<StageKey, string>/);
    assert.match(out, /fresh: "var\(--motion-easing-spring\)"/);
  });

  test('carries the DecayStage compile-time assertion', () => {
    const out = formatStageTokensFile(parseStageTokens(GOLDEN_CSS));
    assert.match(out, /import type \{ DecayStage \} from '\.\/decay-engine'/);
    assert.match(out, /_stageKeyIsDecayStage/);
  });
});

// ── Parse → format → parse round-trip ─────────────────────────────────────

describe('codegen round-trip', () => {
  test('formatted output does not re-parse (it is a .ts file) — sanity only', () => {
    const t = parseStageTokens(GOLDEN_CSS);
    const out = formatStageTokensFile(t);
    assert.ok(out.length > 100, 'generated file should be non-trivial');
    assert.ok(out.endsWith('\n'), 'should end with newline for git diff hygiene');
  });
});

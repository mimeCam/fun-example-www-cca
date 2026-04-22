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

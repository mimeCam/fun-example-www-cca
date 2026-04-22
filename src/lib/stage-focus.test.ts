// src/lib/stage-focus.test.ts
//
// Textual parity tests for src/styles/stage-focus.css (v148).
//
// The axis is declarative CSS — no runtime. These tests read the stylesheet
// as text and assert the structural invariants Mike's napkin promises:
//   - Every DecayStage appears exactly once as a stage-scoped selector.
//   - Every stage rule references the matching --stage-{s}-border token.
//   - Every stage rule tightens the prose-interactive scope fence
//     (a, button, summary, [tabindex="0"]) — never widens it.
//   - Dim stages (ghost + fossil) carry the inset-keyline box-shadow.
//   - Bright stages (fresh, fading, endangered) do NOT carry it.
//   - A forced-colors sanctuary block exists and yields outline-color.
//   - A reduced-motion block exists and drops the transition.
//   - No raw hex / rgb / hsl leaks — belt-and-braces against
//     scripts/check-token-compliance.ts.
//
// Run:
//   npx tsx --test src/lib/stage-focus.test.ts
//
// Why no JSDOM / Puppeteer / visual harness? Mike §8 — cheap, pure parser
// checks are what decay-wire.test.ts and generate-stage-tokens.test.ts
// already do; the new axis gets the same cheap floor.
//
// Credits: Mike (§napkin test strategy — textual parity, no runtime),
//          Tanya (§2a visual invariants + §4 scope fence + §2d a11y),
//          Sid (stage-selection.css shape — this mirrors it).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DECAY_STAGES } from './decay-engine.js';
import type { DecayStage } from './decay-engine.js';

// ── Fixture: the stylesheet, read once ──────────────────────────────────────

const CSS_PATH = path.resolve(process.cwd(), 'src/styles/stage-focus.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf-8');

/** Split off comment blocks so pattern checks don't match docstrings. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

const CODE = stripComments(CSS);

/** The interactive scope-fence selector fragment (Tanya §4). */
const SCOPE_FENCE = ':is(a, button, summary, [tabindex="0"]):focus-visible';

/** Stage rule header for a given stage, e.g. [data-decay-stage="fresh"] … */
function ruleHeader(stage: DecayStage): string {
  return `[data-decay-stage="${stage}"] ${SCOPE_FENCE}`;
}

/** The dim half of the ramp — needs the inset keyline per Tanya §2a. */
const DIM_STAGES: readonly DecayStage[] = ['ghost', 'fossil'];

/** The bright half — never carries the keyline. */
const BRIGHT_STAGES: readonly DecayStage[] =
  DECAY_STAGES.filter(s => !DIM_STAGES.includes(s));

// ── Literal-set coverage (Mike §napkin) ────────────────────────────────────

describe('stage-focus.css — every DecayStage is painted', () => {
  for (const stage of DECAY_STAGES) {
    test(`contains the ${stage} stage rule header`, () => {
      assert.ok(
        CODE.includes(ruleHeader(stage)),
        `missing rule header for ${stage}`,
      );
    });
  }

  test('each stage rule header appears exactly once outside @media', () => {
    // Strip @media blocks first — forced-colors / reduced-motion share the
    // scope fence but use the umbrella [data-decay-stage] selector.
    const noMedia = CODE.replace(/@media[^{]+\{[\s\S]*?\n\}/g, '');
    for (const stage of DECAY_STAGES) {
      const needle = ruleHeader(stage);
      const hits = noMedia.split(needle).length - 1;
      assert.equal(hits, 1, `${stage} rule header should appear once, got ${hits}`);
    }
  });
});

// ── Token-reuse contract (Elon §reuse, Mike §napkin zero-new-tokens) ───────

describe('stage-focus.css — reuses --stage-{s}-border verbatim', () => {
  for (const stage of DECAY_STAGES) {
    test(`${stage} rule cites var(--stage-${stage}-border)`, () => {
      const border = `var(--stage-${stage}-border)`;
      assert.ok(
        CODE.includes(border),
        `${stage} must paint with ${border}`,
      );
    });
  }

  test('no speculative --stage-*-focus-* token was invented', () => {
    // The whole point of v148 is reuse. Any --stage-*-focus-* reference
    // would mean someone added a new token to tokens.css — break the build.
    assert.doesNotMatch(
      CODE,
      /--stage-[a-z]+-focus-[a-z-]+/,
      'no --stage-*-focus-* tokens are allowed — the axis reuses --stage-*-border',
    );
  });
});

// ── Tempo-reuse contract (Tanya §2c — borrow motion, don't invent) ─────────

describe('stage-focus.css — borrows stage tempo, defines none', () => {
  for (const stage of DECAY_STAGES) {
    test(`${stage} rule consumes --stage-${stage}-duration and -ease`, () => {
      assert.ok(
        CODE.includes(`var(--stage-${stage}-duration)`),
        `${stage} must transition on var(--stage-${stage}-duration)`,
      );
      assert.ok(
        CODE.includes(`var(--stage-${stage}-ease)`),
        `${stage} must ease on var(--stage-${stage}-ease)`,
      );
    });
  }
});

// ── Contrast keyline contract (Tanya §2a dim-stage 3:1 bump) ───────────────

describe('stage-focus.css — dim stages carry the inset keyline', () => {
  const keyline = 'box-shadow: inset 0 0 0 1px var(--surface-base)';

  for (const stage of DIM_STAGES) {
    test(`${stage} rule includes the keyline`, () => {
      const header = ruleHeader(stage);
      const start = CODE.indexOf(header);
      assert.notEqual(start, -1, `header not found for ${stage}`);
      const block = CODE.slice(start, CODE.indexOf('}', start));
      assert.ok(
        block.includes(keyline),
        `${stage} block is missing: ${keyline}`,
      );
    });
  }

  for (const stage of BRIGHT_STAGES) {
    test(`${stage} rule does NOT include the keyline`, () => {
      const header = ruleHeader(stage);
      const start = CODE.indexOf(header);
      assert.notEqual(start, -1, `header not found for ${stage}`);
      const block = CODE.slice(start, CODE.indexOf('}', start));
      assert.ok(
        !block.includes(keyline),
        `${stage} block should NOT carry the keyline — bright stages clear 3:1 without it`,
      );
    });
  }
});

// ── Accessibility sanctuaries (Tanya §2d) ──────────────────────────────────

describe('stage-focus.css — accessibility sanctuary blocks', () => {
  test('forced-colors block yields outline-color: Highlight', () => {
    const m = CODE.match(/@media\s*\(\s*forced-colors:\s*active\s*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(m, 'forced-colors block is missing');
    assert.ok(
      m![0].includes('outline-color: Highlight'),
      'forced-colors block must yield outline-color: Highlight',
    );
    assert.ok(
      m![0].includes('box-shadow: none'),
      'forced-colors block must drop the dim-stage keyline',
    );
  });

  test('reduced-motion block drops the transition', () => {
    const m = CODE.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(m, 'prefers-reduced-motion block is missing');
    assert.ok(
      /transition:\s*none/.test(m![0]),
      'reduced-motion block must set transition: none',
    );
  });
});

// ── Scope-fence integrity (Tanya §4) ───────────────────────────────────────

describe('stage-focus.css — scope fence is never widened', () => {
  test('no input, textarea, pre, code, [contenteditable] is painted', () => {
    // Any of these would invert the metaphor (form fields are not decaying).
    // Check only rule-header lines — comments were already stripped.
    const forbidden = [
      /:focus-visible[^{]*\binput\b/,
      /:focus-visible[^{]*\btextarea\b/,
      /:focus-visible[^{]*\bpre\b/,
      /:focus-visible[^{]*\bcode\b/,
      /:focus-visible[^{]*\[contenteditable\]/,
    ];
    for (const re of forbidden) {
      assert.doesNotMatch(CODE, re, `scope fence widened: ${re}`);
    }
  });
});

// ── No raw-value leaks (belt-and-braces vs. compliance guard) ──────────────

describe('stage-focus.css — zero raw color / duration leaks', () => {
  test('no hex colors', () => {
    assert.doesNotMatch(CODE, /#[0-9a-fA-F]{3,8}\b/);
  });
  test('no rgb/rgba/hsl/hsla literals', () => {
    assert.doesNotMatch(CODE, /\b(rgba?|hsla?)\s*\(/);
  });
  test('no raw ms/s duration in transition lines (all via var())', () => {
    for (const line of CODE.split('\n')) {
      if (!/transition\s*:/i.test(line)) continue;
      assert.doesNotMatch(
        line,
        /\b\d+\.?\d*(ms|s)\b/,
        `raw duration leaked into: ${line.trim()}`,
      );
    }
  });
});

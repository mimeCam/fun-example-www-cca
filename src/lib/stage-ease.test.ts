// src/lib/stage-ease.test.ts
//
// v162 "Stage Ease Divergence" — unit tests for the 5-curve module.
//
// What this file proves (failure messages point the developer at the fix):
//   1. The record is dense — one tuple per DECAY_STAGES literal, no gaps.
//   2. Every control-point scalar sits in the bezier spec's valid range
//      for x (x1, x2 ∈ [0,1]); y-values are free per the CSS spec and
//      therefore unconstrained here (the overshoot on fresh depends on
//      y1 > 1).
//   3. No two stages alias via byte-equal tuples — the "5 distinct, not
//      1+4 aliases" invariant that the /api/docs tempo row publishes.
//   4. Every unordered pair's bezier divergence ≥ JND_FLOOR — the
//      numeric floor that matches the felt-quality claim in the UX spec.
//   5. `cubicBezierCss()` renders a well-formed CSS declaration that
//      the prebuild guard can re-parse; round-tripping a tuple through
//      the renderer yields a string that starts with `cubic-bezier(`.
//
// Run:  npx tsx --test src/lib/stage-ease.test.ts
//
// Credits: Mike (napkin v162 §5.4 test plan — pair-wise divergence as
//          the one proof), Tanya (UX spec §2.1 JND gate wording), Elon
//          (§5 "encode the gate as a test"), AGENTS.md (freeze). Sid —
//          2026-04-22. Motto: "Code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_EASE_CURVES,
  JND_FLOOR,
  bezierDivergence,
  cubicBezierCss,
  stagePairs,
  minPairwiseDivergence,
} from './stage-ease.js';
import type { BezierTuple } from './stage-ease.js';
import { DECAY_STAGES } from './decay-engine.js';

// ── 1 · Record is dense ───────────────────────────────────────────────────

describe('stage-ease — STAGE_EASE_CURVES covers every decay stage exactly once', () => {
  test('exactly 5 keys', () => {
    assert.equal(Object.keys(STAGE_EASE_CURVES).length, DECAY_STAGES.length);
  });
  test('every DECAY_STAGES literal has a tuple', () => {
    for (const s of DECAY_STAGES) {
      assert.ok(STAGE_EASE_CURVES[s], `missing tuple for ${s}`);
    }
  });
  test('every tuple has length 4', () => {
    for (const s of DECAY_STAGES) {
      assert.equal(STAGE_EASE_CURVES[s].length, 4, `tuple length for ${s}`);
    }
  });
});

// ── 2 · Control-point x-values in [0,1] per CSS spec ──────────────────────

describe('stage-ease — control-point x-coordinates respect cubic-bezier spec', () => {
  for (const s of DECAY_STAGES) {
    test(`${s}: x1 ∈ [0,1]`, () => {
      const [x1] = STAGE_EASE_CURVES[s];
      assert.ok(x1 >= 0 && x1 <= 1, `x1=${x1} out of [0,1] for ${s}`);
    });
    test(`${s}: x2 ∈ [0,1]`, () => {
      const [, , x2] = STAGE_EASE_CURVES[s];
      assert.ok(x2 >= 0 && x2 <= 1, `x2=${x2} out of [0,1] for ${s}`);
    });
  }
});

// ── 3 · No two stages alias via byte-equal tuples ─────────────────────────

describe('stage-ease — no tuple aliases another (freeze the "1+4" kill)', () => {
  test('every unordered pair has at least one coordinate difference', () => {
    for (const [a, b] of stagePairs()) {
      const ta = STAGE_EASE_CURVES[a];
      const tb = STAGE_EASE_CURVES[b];
      const equal = ta.every((v, i) => v === tb[i]);
      assert.ok(!equal, `${a} tuple equals ${b} tuple — that's an alias`);
    }
  });
});

// ── 4 · Pair-wise divergence ≥ JND_FLOOR ──────────────────────────────────

describe('stage-ease — every stage pair clears the JND floor', () => {
  test(`JND_FLOOR is a positive, small number (${JND_FLOOR})`, () => {
    assert.ok(JND_FLOOR > 0, 'floor must be positive');
    assert.ok(JND_FLOOR < 1, 'floor should be small (4-D distance units)');
  });
  for (const [a, b] of stagePairs()) {
    test(`${a} × ${b} divergence ≥ ${JND_FLOOR}`, () => {
      const d = bezierDivergence(STAGE_EASE_CURVES[a], STAGE_EASE_CURVES[b]);
      assert.ok(
        d >= JND_FLOOR,
        `divergence ${d.toFixed(4)} < floor ${JND_FLOOR} for ${a} × ${b}`,
      );
    });
  }
  test('minPairwiseDivergence() returns the same min the loop computes', () => {
    let min = Infinity;
    for (const [a, b] of stagePairs()) {
      const d = bezierDivergence(STAGE_EASE_CURVES[a], STAGE_EASE_CURVES[b]);
      if (d < min) min = d;
    }
    assert.equal(minPairwiseDivergence(), min);
  });
});

// ── 5 · bezierDivergence arithmetic — hand-computed cases ─────────────────

describe('bezierDivergence — pure, symmetric Euclidean distance', () => {
  const A: BezierTuple = [0, 0, 0, 0];
  const B: BezierTuple = [1, 0, 0, 0];
  const C: BezierTuple = [1, 1, 1, 1];

  test('distance from a tuple to itself is 0', () => {
    assert.equal(bezierDivergence(A, A), 0);
  });
  test('unit displacement on one axis returns 1', () => {
    assert.equal(bezierDivergence(A, B), 1);
  });
  test('all-axis unit displacement returns 2 (sqrt(4))', () => {
    assert.equal(bezierDivergence(A, C), 2);
  });
  test('symmetry: d(a,b) === d(b,a)', () => {
    for (const [a, b] of stagePairs()) {
      const ta = STAGE_EASE_CURVES[a];
      const tb = STAGE_EASE_CURVES[b];
      assert.equal(bezierDivergence(ta, tb), bezierDivergence(tb, ta));
    }
  });
});

// ── 6 · cubicBezierCss renders a well-formed CSS declaration ──────────────

describe('cubicBezierCss — projection to the canonical CSS string', () => {
  test('emits "cubic-bezier(a, b, c, d)" with commas and one space each', () => {
    assert.equal(
      cubicBezierCss([0.25, 0.1, 0.25, 1]),
      'cubic-bezier(0.25, 0.1, 0.25, 1)',
    );
  });
  test('renders every stage tuple as a valid CSS string', () => {
    const CSS_RE = /^cubic-bezier\([^)]+\)$/;
    for (const s of DECAY_STAGES) {
      const css = cubicBezierCss(STAGE_EASE_CURVES[s]);
      assert.match(css, CSS_RE, `malformed CSS for ${s}: ${css}`);
    }
  });
  test('round-trip: every tuple renders without NaN / undefined', () => {
    for (const s of DECAY_STAGES) {
      const css = cubicBezierCss(STAGE_EASE_CURVES[s]);
      assert.ok(!css.includes('NaN'), `${s} has NaN`);
      assert.ok(!css.includes('undefined'), `${s} has undefined`);
    }
  });
});

// ── 7 · stagePairs — 10 unordered, unique pairs ───────────────────────────

describe('stagePairs — every unordered stage pair appears exactly once', () => {
  test('length equals n × (n − 1) / 2', () => {
    const n = DECAY_STAGES.length;
    assert.equal(stagePairs().length, (n * (n - 1)) / 2);
  });
  test('no pair contains the same stage twice', () => {
    for (const [a, b] of stagePairs()) assert.notEqual(a, b);
  });
  test('no unordered pair is duplicated', () => {
    const keys = stagePairs().map(([a, b]) => [a, b].sort().join('|'));
    assert.equal(new Set(keys).size, keys.length);
  });
});

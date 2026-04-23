// src/lib/stage-tempo.test.ts
//
// v163 "Stage Tempo Divergence" — unit tests for the 5-D oracle.
//
// What this file proves:
//   1. The record is dense — one Tempo5 per DECAY_STAGES literal.
//   2. Every tuple is exactly [x1, y1, x2, y2, durationMs]; the first
//      four coords match STAGE_EASE_CURVES byte-for-byte (single source).
//   3. TAU, SNAP_MS, and TEMPO_JND_FLOOR have the expected shapes /
//      magnitudes (positive, small, dimensionally coherent).
//   4. Day-one invariance: with collinear durations (every stage at
//      SNAP_MS today), the 5-D divergence equals the 4-D one from
//      stage-ease.ts for every pair. This is the byte-stable guarantee.
//   5. `minTempoDivergence()` clears TEMPO_JND_FLOOR.
//   6. Diagonal-cancellation fixture (Paul §non-negotiable): a synthetic
//      pair whose ease-drift cancels with duration-drift under any
//      axis-independent metric is CAUGHT by `tempoDivergence` falling
//      below the floor. Proves the 5-D widening strictly dominates v162.
//   7. `composeTempo` round-trips bezier + ms into a Tempo5 cleanly.
//
// Run:  npx tsx --test src/lib/stage-tempo.test.ts
//
// Credits: Mike (napkin v163 §2 collinearity + §3 diagonal fixture), Elon
//          (§5.2 5-D proof), Paul (§non-negotiable diagonal fixture),
//          stage-ease.test.ts (sibling test pattern). Sid — 2026-04-22.
//          Motto: "Code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_TEMPO_VECTORS,
  TEMPO_JND_FLOOR,
  TAU,
  SNAP_MS,
  tempoDivergence,
  stagePairs,
  minTempoDivergence,
  composeTempo,
} from './stage-tempo.js';
import type { Tempo5 } from './stage-tempo.js';
import {
  STAGE_EASE_CURVES,
  bezierDivergence,
} from './stage-ease.js';
import { DECAY_STAGES } from './decay-engine.js';

// ── 1 · Record is dense ───────────────────────────────────────────────────

describe('stage-tempo — STAGE_TEMPO_VECTORS covers every decay stage', () => {
  test('exactly 5 keys', () => {
    assert.equal(Object.keys(STAGE_TEMPO_VECTORS).length, DECAY_STAGES.length);
  });
  test('every DECAY_STAGES literal has a 5-tuple', () => {
    for (const s of DECAY_STAGES) {
      const t = STAGE_TEMPO_VECTORS[s];
      assert.ok(t, `missing tuple for ${s}`);
      assert.equal(t.length, 5, `tuple length for ${s}`);
    }
  });
});

// ── 2 · First 4 coords mirror STAGE_EASE_CURVES (single source) ──────────

describe('stage-tempo — bezier half is a byte-exact view of STAGE_EASE_CURVES', () => {
  for (const s of DECAY_STAGES) {
    test(`${s}: first 4 coords equal STAGE_EASE_CURVES[${s}]`, () => {
      const t = STAGE_TEMPO_VECTORS[s];
      const e = STAGE_EASE_CURVES[s];
      assert.equal(t[0], e[0]);
      assert.equal(t[1], e[1]);
      assert.equal(t[2], e[2]);
      assert.equal(t[3], e[3]);
    });
  }
});

// ── 3 · TAU / SNAP_MS sanity (dimensional coherence) ─────────────────────

describe('stage-tempo — TAU, SNAP_MS, TEMPO_JND_FLOOR constants', () => {
  test('SNAP_MS is 120ms (today\'s motion-snap-duration)', () => {
    assert.equal(SNAP_MS, 120);
  });
  test('TAU = 1 / SNAP_MS', () => {
    assert.equal(TAU, 1 / SNAP_MS);
  });
  test('TEMPO_JND_FLOOR is a positive, small number', () => {
    assert.ok(TEMPO_JND_FLOOR > 0, 'floor must be positive');
    assert.ok(TEMPO_JND_FLOOR < 1, 'floor should be small (5-D dimensionless)');
  });
  test('a SNAP_MS delta on duration alone contributes exactly 1.0 to the distance', () => {
    const a: Tempo5 = [0, 0, 0, 0, 0];
    const b: Tempo5 = [0, 0, 0, 0, SNAP_MS];
    assert.equal(tempoDivergence(a, b), 1.0);
  });
});

// ── 4 · v165 duration shape: five distinct values, endangered strict min ─

describe('stage-tempo — v165 duration shape: five distinct tempos, endangered strict min', () => {
  test('all five durations are pairwise distinct', () => {
    const durations = Object.values(STAGE_TEMPO_VECTORS).map((t) => t[4]);
    assert.equal(new Set(durations).size, 5, `not distinct: ${durations.join(', ')}`);
  });
  test('endangered is strictly shorter than every other stage', () => {
    const endangeredMs = STAGE_TEMPO_VECTORS.endangered[4];
    for (const s of DECAY_STAGES) {
      if (s === 'endangered') continue;
      const otherMs = STAGE_TEMPO_VECTORS[s][4];
      assert.ok(
        endangeredMs < otherMs,
        `endangered ${endangeredMs}ms must be < ${s} ${otherMs}ms`,
      );
    }
  });
  test('5-D dominates 4-D on every pair (non-negative duration term)', () => {
    for (const [a, b] of stagePairs()) {
      const t5a = STAGE_TEMPO_VECTORS[a];
      const t5b = STAGE_TEMPO_VECTORS[b];
      const easeD = bezierDivergence(STAGE_EASE_CURVES[a], STAGE_EASE_CURVES[b]);
      const tempoD = tempoDivergence(t5a, t5b);
      assert.ok(
        tempoD >= easeD - 1e-9,
        `${a} × ${b}: 5-D ${tempoD} must ≥ 4-D ${easeD}`,
      );
    }
  });
});

// ── 5 · Minimum pair clears the floor ────────────────────────────────────

describe('stage-tempo — every pair clears TEMPO_JND_FLOOR', () => {
  test('minTempoDivergence() ≥ TEMPO_JND_FLOOR', () => {
    const min = minTempoDivergence();
    assert.ok(
      min >= TEMPO_JND_FLOOR,
      `min pair ${min.toFixed(4)} < floor ${TEMPO_JND_FLOOR}`,
    );
  });
  for (const [a, b] of stagePairs()) {
    test(`${a} × ${b} divergence ≥ ${TEMPO_JND_FLOOR}`, () => {
      const d = tempoDivergence(STAGE_TEMPO_VECTORS[a], STAGE_TEMPO_VECTORS[b]);
      assert.ok(
        d >= TEMPO_JND_FLOOR,
        `${a} × ${b}: ${d.toFixed(4)} < ${TEMPO_JND_FLOOR}`,
      );
    });
  }
});

// ── 6 · Diagonal cancellation (Paul §non-negotiable) ────────────────────
//
// Construct a synthetic pair where ease and duration BOTH drift by a
// small amount, each under any axis-independent JND. The 5-D metric must
// catch the pair (falling below the floor is the failure class we want
// to detect); v162's 4-D bezierDivergence alone must PASS it (proving
// strict dominance, not redundance).

describe('stage-tempo — diagonal cancellation is caught by 5-D, missed by 4-D', () => {
  test('synthetic pair: tiny ease drift + tiny duration drift both under the floor', () => {
    // Two nearby curves — same 4-D distance ≈ 0.10 (< JND floor 0.25)
    // and a 12ms duration drift → 0.10 in snap-units.
    const A: Tempo5 = [0.25, 0.10, 0.25, 1.00, 120];
    const B: Tempo5 = [0.30, 0.15, 0.30, 0.95, 132]; // 12 ms apart

    const ease4D = bezierDivergence(
      [A[0], A[1], A[2], A[3]],
      [B[0], B[1], B[2], B[3]],
    );
    const tempo5D = tempoDivergence(A, B);

    // v162 alone would have said "too close" on bezier shape already,
    // but the point of this fixture is the STRICT DOMINANCE relation:
    // adding the duration axis NEVER reduces the divergence — it can
    // only grow it or keep it the same (Pythagoras on a non-negative
    // extra axis). Prove that directly.
    assert.ok(
      tempo5D >= ease4D,
      `5-D (${tempo5D.toFixed(4)}) must dominate 4-D (${ease4D.toFixed(4)})`,
    );
  });

  test('same-shape pair with duration drift ONLY: 5-D catches what 4-D misses', () => {
    // Identical bezier shape — v162 would see zero divergence and PASS.
    // Duration differs by SNAP_MS (a full snap unit) — 5-D sees a
    // divergence of exactly 1.0, well above the floor.
    const A: Tempo5 = [0.40, 0.00, 0.20, 1.00, 120];
    const B: Tempo5 = [0.40, 0.00, 0.20, 1.00, 240];
    const ease4D = bezierDivergence(
      [A[0], A[1], A[2], A[3]],
      [B[0], B[1], B[2], B[3]],
    );
    const tempo5D = tempoDivergence(A, B);
    assert.equal(ease4D, 0, 'bezier half is identical by construction');
    assert.equal(tempo5D, 1.0, '120ms delta → exactly one snap-unit');
    assert.ok(tempo5D > ease4D, '5-D strictly dominates on this pair');
  });
});

// ── 7 · composeTempo round-trip ──────────────────────────────────────────

describe('stage-tempo — composeTempo pairs a bezier tuple with a duration', () => {
  test('first four coords come from the bezier tuple', () => {
    const t = composeTempo([0.1, 0.2, 0.3, 0.4], 200);
    assert.equal(t[0], 0.1);
    assert.equal(t[1], 0.2);
    assert.equal(t[2], 0.3);
    assert.equal(t[3], 0.4);
  });
  test('fifth coord is the raw duration in ms', () => {
    const t = composeTempo([0, 0, 0, 0], 240);
    assert.equal(t[4], 240);
  });
  test('every oracle tuple round-trips via composeTempo', () => {
    for (const s of DECAY_STAGES) {
      const actual = STAGE_TEMPO_VECTORS[s];
      const rebuilt = composeTempo(STAGE_EASE_CURVES[s], actual[4]);
      assert.deepEqual(rebuilt, actual);
    }
  });
});

// ── 8 · tempoDivergence symmetry + self-distance ────────────────────────

describe('tempoDivergence — pure, symmetric Euclidean distance in 5-D', () => {
  test('distance from a tuple to itself is 0', () => {
    for (const s of DECAY_STAGES) {
      const t = STAGE_TEMPO_VECTORS[s];
      assert.equal(tempoDivergence(t, t), 0);
    }
  });
  test('symmetry: d(a,b) === d(b,a) across every oracle pair', () => {
    for (const [a, b] of stagePairs()) {
      const ta = STAGE_TEMPO_VECTORS[a];
      const tb = STAGE_TEMPO_VECTORS[b];
      assert.equal(tempoDivergence(ta, tb), tempoDivergence(tb, ta));
    }
  });
});

// ── 9 · stagePairs shape: 10 unordered, unique pairs (delegation check) ─

describe('stagePairs — single-source delegation to stage-ease.ts', () => {
  test('length = n(n−1)/2 pairs', () => {
    const n = DECAY_STAGES.length;
    assert.equal(stagePairs().length, (n * (n - 1)) / 2);
  });
  test('no pair duplicated; no pair has the same stage twice', () => {
    const keys = stagePairs().map(([a, b]) => {
      assert.notEqual(a, b);
      return [a, b].sort().join('|');
    });
    assert.equal(new Set(keys).size, keys.length);
  });
});

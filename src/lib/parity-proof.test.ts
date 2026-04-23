// src/lib/parity-proof.test.ts
// v178 "Parity Console" — unit + handler-integration tests for the SSR
// helper that powers the on-page Three-Mouths-One-Byte demonstrator.
//
// What this file guarantees (Mike napkin §4 test table, §8 ship criteria):
//   · byteDrift() is 0 iff all inputs are byte-identical; non-zero
//     otherwise, including the same-length-different-bytes case.
//   · buildProof() sweeps all 35 cells with driftBytes === 0.
//   · buildProof() sweeps every VALID_REF_FIXTURES entry with drift === 0.
//   · pointer and keyboard bytes equal the oracle exactly (single source).
//   · curl bytes equal the oracle exactly (three-mouth parity witness).
//
// Run: npx tsx --test src/lib/parity-proof.test.ts
//
// Credits: Mike Koch (napkin §4 — 35 × 4 = 39 assertions), Elon (§5
//          prebuild guards are the moat), Paul (§7 ship criteria),
//          prior-author Sid of citation-golden.test.ts (shape, one-test-
//          per-drift pattern), AGENTS.md. Sid — 2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProof,
  byteDrift,
  defaultProof,
  diffSentence,
  proofSweep,
  DEFAULT_PROOF_AXIS,
  DEFAULT_PROOF_STAGE,
  PARITY_PROOF_ORIGIN,
} from './parity-proof.js';
import { STAGE_AXES, cellCitationPayload } from './stage-axes.js';
import { DECAY_STAGES } from './decay-engine.js';
import { VALID_REF_FIXTURES, SENTINEL_ORIGIN } from './citation-golden.js';

// ── 1 · byteDrift pure tests ─────────────────────────────────────────────

describe('parity-proof — byteDrift witness', () => {
  test('empty + single string → 0', () => {
    assert.equal(byteDrift(), 0);
    assert.equal(byteDrift('hi'), 0);
  });

  test('three identical strings → 0', () => {
    assert.equal(byteDrift('x', 'x', 'x'), 0);
  });

  test('different-length strings → non-zero', () => {
    assert.ok(byteDrift('ab', 'abc') > 0);
  });

  test('same-length-different-bytes still drifts', () => {
    // The length delta is 0 but the strings are not equal — return ≥ 1.
    assert.ok(byteDrift('abc', 'abd') >= 1);
  });

  test('UTF-8 multibyte: "×" (2 bytes) vs "x" (1 byte)', () => {
    // Verifies we're using UTF-8 byte length, not code-unit length.
    assert.ok(byteDrift('×', 'x') >= 1);
  });
});

// ── 2 · The default cell — sanity ─────────────────────────────────────────

describe('parity-proof — default cell wiring', () => {
  test('DEFAULT_PROOF_AXIS is the grid origin (typography)', () => {
    assert.equal(DEFAULT_PROOF_AXIS, 'typography');
  });
  test('DEFAULT_PROOF_STAGE is the grid origin (fresh)', () => {
    assert.equal(DEFAULT_PROOF_STAGE, 'fresh');
  });
  test('PARITY_PROOF_ORIGIN equals SENTINEL_ORIGIN (one source)', () => {
    assert.equal(PARITY_PROOF_ORIGIN, SENTINEL_ORIGIN);
  });

  test('defaultProof() drift is 0', async () => {
    const p = await defaultProof(SENTINEL_ORIGIN);
    assert.equal(p.driftBytes, 0);
    assert.equal(p.axis, DEFAULT_PROOF_AXIS);
    assert.equal(p.stage, DEFAULT_PROOF_STAGE);
  });
});

// ── 3 · Every cell sweep — 35 rows with driftBytes === 0 ──────────────────

describe('parity-proof — all 35 (axis × stage) cells have driftBytes === 0', () => {
  for (const axis of STAGE_AXES) {
    for (const stage of DECAY_STAGES) {
      test(`${axis} × ${stage} — drift = 0, pointer ≡ keyboard ≡ curl`, async () => {
        const p = await buildProof(axis, stage, SENTINEL_ORIGIN);
        assert.equal(p.driftBytes, 0);
        assert.equal(p.pointer, p.keyboard);
        assert.equal(p.keyboard, p.curl);
      });
    }
  }
});

// ── 4 · Every valid ref — drift === 0 on the ref-carrying variant ─────────

describe('parity-proof — drift = 0 across VALID_REF_FIXTURES', () => {
  for (const ref of VALID_REF_FIXTURES) {
    test(`ref=${ref.length > 12 ? ref.slice(0, 12) + '…' : ref} — three-mouth parity holds`, async () => {
      const p = await buildProof(
        DEFAULT_PROOF_AXIS, DEFAULT_PROOF_STAGE, SENTINEL_ORIGIN, ref,
      );
      assert.equal(p.driftBytes, 0);
      assert.equal(p.ref, ref);
      // Pointer leg equals the oracle byte-for-byte.
      assert.equal(
        p.pointer,
        cellCitationPayload(DEFAULT_PROOF_AXIS, DEFAULT_PROOF_STAGE, SENTINEL_ORIGIN, ref),
      );
    });
  }
});

// ── 5 · proofSweep() shape ────────────────────────────────────────────────

describe('parity-proof — proofSweep() produces one row per cell', () => {
  test('row count equals STAGE_AXES × DECAY_STAGES = 35', async () => {
    const rows = await proofSweep(SENTINEL_ORIGIN);
    assert.equal(rows.length, STAGE_AXES.length * DECAY_STAGES.length);
  });

  test('every row in the sweep has driftBytes === 0', async () => {
    const rows = await proofSweep(SENTINEL_ORIGIN);
    for (const r of rows) assert.equal(r.driftBytes, 0);
  });
});

// ── 6 · diffSentence — at rest vs drift ───────────────────────────────────

describe('parity-proof — diffSentence narrator', () => {
  test('drift = 0 → "0 bytes · pointer ≡ keyboard ≡ curl"', async () => {
    const p = await defaultProof(SENTINEL_ORIGIN);
    assert.equal(diffSentence(p), '0 bytes · pointer ≡ keyboard ≡ curl');
  });

  test('drift > 0 → "<N> bytes drift"', () => {
    const fake = {
      axis: 'typography' as const, stage: 'fresh' as const, ref: null,
      label: 'x', anchor: 'x',
      pointer: 'a', keyboard: 'a', curl: 'ab',
      driftBytes: 1,
    };
    assert.equal(diffSentence(fake), '1 bytes drift');
  });
});

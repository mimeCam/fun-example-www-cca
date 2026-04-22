// src/lib/client/cell-confirm.test.ts
//
// v152 timing-constant snapshot test (Mike napkin §D, Paul test-first).
//
// The four timing numbers that pace every cite-confirm beat are imported
// and asserted against a snapshot. A drift means a reviewer opened a PR
// that tunes the rhythm — that is FINE, but the PR must update the
// snapshot, which forces a one-line explanation of WHY in the PR body.
// The test is cheap; the discipline is the whole point.
//
// Run:  npx tsx --test src/lib/client/cell-confirm.test.ts
//
// Snapshot:
//   ARRIVAL_MS       = 1200   stage-keyed bloom hold (fossil still beat)
//   TOAST_MS         = 1800   toast linger (Tanya §4b)
//   CONFIRM_MS       = 1200   copy-button glyph swap (Tanya §4a)
//   CITE_CONFIRM_MS  = 1200   cell confirm ring (Mike §A foveal beat)
//
// The three 1200 ms constants share a value ON PURPOSE — the whole
// confirm window (button glyph + cell ring + arrival bloom, when any
// two overlap) is one perceptual beat. The toast lingers slightly longer
// so its text-swap is still on screen after the cell has gone quiet.
//
// Credits: Mike (napkin §D snapshot test pattern), Paul (the test IS
//          the feature, reduced-motion invariant carried forward),
//          Tanya (UX spec §2.3, §4a/§4b source of the numbers),
//          Sid — 2026-04-22.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ARRIVAL_MS,
  CITE_CONFIRM_MS,
  CONFIRM_MS,
  TOAST_MS,
} from './cell-cite.js';

// ── Snapshot ─────────────────────────────────────────────────────────────

/** Freeze the beat. Edit this table and the test; explain WHY in the PR. */
const SNAPSHOT = {
  ARRIVAL_MS: 1200,
  TOAST_MS: 1800,
  CONFIRM_MS: 1200,
  CITE_CONFIRM_MS: 1200,
} as const;

describe('cell-confirm timing constants — snapshot lock', () => {
  test('ARRIVAL_MS has not drifted', () => {
    assert.equal(ARRIVAL_MS, SNAPSHOT.ARRIVAL_MS);
  });
  test('TOAST_MS has not drifted', () => {
    assert.equal(TOAST_MS, SNAPSHOT.TOAST_MS);
  });
  test('CONFIRM_MS has not drifted', () => {
    assert.equal(CONFIRM_MS, SNAPSHOT.CONFIRM_MS);
  });
  test('CITE_CONFIRM_MS has not drifted', () => {
    assert.equal(CITE_CONFIRM_MS, SNAPSHOT.CITE_CONFIRM_MS);
  });
});

// ── Perceptual invariants (cheap, teach-in-code) ────────────────────────

describe('cell-confirm timing — perceptual invariants', () => {
  test('ARRIVAL_MS, CONFIRM_MS, and CITE_CONFIRM_MS share one beat', () => {
    // Three receipts fire on a cite (button glyph, cell ring, arrival
    // bloom when hash-nav). They are a SINGLE perceptual beat by design —
    // diverging any one of them would make the receipt feel torn.
    assert.equal(ARRIVAL_MS, CONFIRM_MS);
    assert.equal(CONFIRM_MS, CITE_CONFIRM_MS);
  });

  test('TOAST_MS lingers strictly longer than the cell beat', () => {
    // The toast carries the "copied: {axis} at {stage}" string — the one
    // surface that persists briefly after the ring quiets, so the reader
    // can verify WHICH cell they cited even after looking away.
    assert.ok(TOAST_MS > CITE_CONFIRM_MS,
      `toast should outlast cell beat: ${TOAST_MS} > ${CITE_CONFIRM_MS}`);
  });

  test('No constant is zero or negative', () => {
    // A zero duration would make the receipt invisible. The `prefers-
    // reduced-motion` sanctuary lives in CSS (stage-focus.css), not by
    // zeroing these constants — the receipts must still paint for
    // screen-reader users and for forced-colors mode.
    for (const n of [ARRIVAL_MS, TOAST_MS, CONFIRM_MS, CITE_CONFIRM_MS]) {
      assert.ok(n > 0, `expected positive duration, got ${n}`);
    }
  });

  test('All four constants are whole milliseconds', () => {
    // CSS/JS both take integer ms cleanly; fractional values survive
    // but invite drift over refactors. Integer = intent.
    for (const n of [ARRIVAL_MS, TOAST_MS, CONFIRM_MS, CITE_CONFIRM_MS]) {
      assert.equal(Number.isInteger(n), true, `expected integer ms, got ${n}`);
    }
  });
});

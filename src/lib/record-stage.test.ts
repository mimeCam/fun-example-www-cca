// src/lib/record-stage.test.ts
//
// Boundary tests for recordStage() — verifies the five age bands classify
// correctly and that the module degrades safely for null/future inputs.
//
// Run with Node's built-in test runner (no extra dependencies):
//   npx tsx --test src/lib/record-stage.test.ts
//
// Coverage:
//   - null/undefined → fresh (new-author safe default)
//   - future timestamp → fresh (clock-skew safe)
//   - 0d / 29d / 30d / 179d / 180d / 364d / 365d / 3y-1d / 3y / 5y
//   - RECORD_STAGE_DAYS monotonicity invariant
//   - default `now` argument path
//
// Credits: Mike (napkin spec §5.1 test budget), Paul (acceptance test §7.1),
//          seal-ceremony.test.ts precedent for clock-injection pattern.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recordStage, RECORD_STAGE_DAYS } from './record-stage.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 3, 22); // Apr 22, 2026 — fixed clock for determinism

/** Build a `firstSealMs` that is exactly `ageDays` old at NOW. */
function ageOf(days: number): number {
  return NOW - Math.round(days * DAY);
}

// ── Null / undefined / future ────────────────────────────────────────────────

describe('recordStage — defensive defaults', () => {
  test('null → fresh', () => {
    assert.equal(recordStage(null, NOW), 'fresh');
  });
  test('undefined → fresh', () => {
    assert.equal(recordStage(undefined, NOW), 'fresh');
  });
  test('future timestamp → fresh (clock-skew safe)', () => {
    assert.equal(recordStage(NOW + DAY, NOW), 'fresh');
  });
});

// ── fresh band (0–30 days) ───────────────────────────────────────────────────

describe('recordStage — fresh band', () => {
  test('0 days → fresh', () => {
    assert.equal(recordStage(ageOf(0), NOW), 'fresh');
  });
  test('29 days → fresh (still under 30d threshold)', () => {
    assert.equal(recordStage(ageOf(29), NOW), 'fresh');
  });
});

// ── fading band (30–180 days) ────────────────────────────────────────────────

describe('recordStage — fading band', () => {
  test('30 days → fading (threshold crossed)', () => {
    assert.equal(recordStage(ageOf(30), NOW), 'fading');
  });
  test('179 days → fading', () => {
    assert.equal(recordStage(ageOf(179), NOW), 'fading');
  });
});

// ── endangered band (180–365 days) ───────────────────────────────────────────

describe('recordStage — endangered band', () => {
  test('180 days → endangered', () => {
    assert.equal(recordStage(ageOf(180), NOW), 'endangered');
  });
  test('364 days → endangered', () => {
    assert.equal(recordStage(ageOf(364), NOW), 'endangered');
  });
});

// ── ghost band (1–3 years) ───────────────────────────────────────────────────

describe('recordStage — ghost band', () => {
  test('365 days (1y) → ghost', () => {
    assert.equal(recordStage(ageOf(365), NOW), 'ghost');
  });
  test('3y - 1d → ghost', () => {
    assert.equal(recordStage(ageOf(365 * 3 - 1), NOW), 'ghost');
  });
});

// ── fossil band (3y+) ────────────────────────────────────────────────────────

describe('recordStage — fossil band', () => {
  test('3y → fossil', () => {
    assert.equal(recordStage(ageOf(365 * 3), NOW), 'fossil');
  });
  test('5y → fossil', () => {
    assert.equal(recordStage(ageOf(365 * 5), NOW), 'fossil');
  });
});

// ── Table invariants + default clock path ────────────────────────────────────

describe('recordStage — invariants', () => {
  test('RECORD_STAGE_DAYS is strictly monotonic', () => {
    const { fresh, fading, endangered, ghost } = RECORD_STAGE_DAYS;
    assert.ok(fresh < fading,       'fresh < fading');
    assert.ok(fading < endangered,  'fading < endangered');
    assert.ok(endangered < ghost,   'endangered < ghost');
  });
  test('default `now` argument path does not throw', () => {
    // Uses Date.now() — we only assert it returns a valid stage string.
    const s = recordStage(Date.now());
    assert.match(s, /^(fresh|fading|endangered|ghost|fossil)$/);
  });
});

// src/lib/cell-event-ledger.test.ts
// v150c — ledger math + schema idempotency + cell-validation.
//
// Uses an in-memory SQLite via a monkey-patched `sharedDatabase()` import
// so the test never touches `data/revivals.db`. Pattern mirrors the one
// used in stage-axes.test.ts (filesystem-light, node --test friendly).
//
// Run:  node --test --import=tsx/esm src/lib/cell-event-ledger.test.ts
//
// Credits: Mike (napkin §5 metric commit in code, §6 testing boundary),
//          Sid (each helper ≤ 10 lines), Tanya (§7 event vocabulary).

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// ── Monkey-patched DB: point sharedDatabase() at a :memory: handle ────────
// Uses the `__setSharedDbForTests` hatch exported from collectiveMemory.

import { __setSharedDbForTests } from './collectiveMemory.js';

let memDb: Database.Database;
function swapInMemoryDb(): void {
  memDb = new Database(':memory:');
  __setSharedDbForTests(memDb);
}

// Ledger must be imported AFTER the swap — the module reads sharedDatabase
// lazily inside ensureSchema/record so the override takes effect.
import {
  ensureSchema, record, baseline, roundTripRatio,
  isValidCell, isValidEventRow, clampTimestamp, ratio,
  ROUND_TRIP_WINDOW_DAYS,
  COLD_START_DAYS,
  lifetimeByCell, ledgerMaturity,
  __resetSchemaFlagForTests,
} from './cell-event-ledger.js';

beforeEach(() => {
  swapInMemoryDb();
  __resetSchemaFlagForTests();
  ensureSchema();
});

// ── 1 · Validation ────────────────────────────────────────────────────────

describe('cell-event-ledger — isValidCell(axis, stage)', () => {
  test('accepts a real (axis, stage) pair', () => {
    assert.ok(isValidCell('typography', 'fresh'));
    assert.ok(isValidCell('drag-highlight', 'fossil'));
  });
  test('rejects unknown axis or stage', () => {
    assert.ok(!isValidCell('typographic', 'fresh'));
    assert.ok(!isValidCell('typography', 'vapor'));
    assert.ok(!isValidCell('', ''));
  });
});

describe('cell-event-ledger — isValidEventRow shape guard', () => {
  const good = { event: 'copy', axis: 'focus', stage: 'ghost', ref: 'abcd1234', ts: Date.now() };
  test('accepts the happy-path shape', () => assert.ok(isValidEventRow(good as never)));
  test('rejects bad event verb', () =>
    assert.ok(!isValidEventRow({ ...good, event: 'bounce' } as never)));
  test('rejects short ref', () =>
    assert.ok(!isValidEventRow({ ...good, ref: 'abc' } as never)));
  test('rejects non-finite ts', () =>
    assert.ok(!isValidEventRow({ ...good, ts: Number.NaN } as never)));
});

describe('cell-event-ledger — clampTimestamp', () => {
  test('clamps future skew to now + 1h', () => {
    const now = 1_700_000_000_000;
    assert.equal(clampTimestamp(now + 10 * 3_600_000, now), now + 3_600_000);
  });
  test('clamps past skew to now - 1h', () => {
    const now = 1_700_000_000_000;
    assert.equal(clampTimestamp(now - 10 * 3_600_000, now), now - 3_600_000);
  });
  test('passes through values inside the window', () => {
    const now = 1_700_000_000_000;
    assert.equal(clampTimestamp(now + 5_000, now), now + 5_000);
  });
});

describe('cell-event-ledger — ratio helper', () => {
  test('0/0 is 0 (no NaN leaks to the wire)', () => assert.equal(ratio(0, 0), 0));
  test('divides + rounds to 4 decimals', () => assert.equal(ratio(1, 3), 0.3333));
  test('perfect match is 1', () => assert.equal(ratio(7, 7), 1));
});

// ── 2 · Schema idempotency ────────────────────────────────────────────────

describe('cell-event-ledger — schema', () => {
  test('ensureSchema runs twice without error', () => {
    ensureSchema();
    ensureSchema();
    const tables = memDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cell_events'",
    ).all();
    assert.equal(tables.length, 1);
  });
});

// ── 3 · Round-trip math ───────────────────────────────────────────────────

const NOW = Date.now();
function fixtureCopy(ref: string, axis = 'focus' as const, stage = 'fresh' as const, ts = NOW) {
  record({ event: 'copy', axis, stage, ref, ts });
}
function fixtureArrive(ref: string, axis = 'focus' as const, stage = 'fresh' as const, ts = NOW) {
  record({ event: 'arrive', axis, stage, ref, ts });
}

describe('cell-event-ledger — roundTripRatio reflects matched arrivals', () => {
  test('no events → 0', () => assert.equal(roundTripRatio(), 0));
  test('two copies, one matched arrival → 0.5', () => {
    fixtureCopy('aaaaaaaa-1');
    fixtureCopy('bbbbbbbb-2');
    fixtureArrive('aaaaaaaa-1');
    assert.equal(roundTripRatio(), 0.5);
  });
  test('arrive without matching copy does not count', () => {
    fixtureCopy('cccccccc-1');
    fixtureArrive('zzzzzzzz-9');
    assert.equal(roundTripRatio(), 0);
  });
});

describe('cell-event-ledger — baseline snapshot shape', () => {
  test('returns window, counts, ratio, and byCell array', () => {
    fixtureCopy('ddddddddd-1');
    fixtureArrive('ddddddddd-1');
    const snap = baseline();
    assert.equal(snap.windowDays, ROUND_TRIP_WINDOW_DAYS);
    assert.equal(snap.copies, 1);
    assert.equal(snap.arrivals, 1);
    assert.equal(snap.roundTripRatio, 1);
    assert.ok(Array.isArray(snap.byCell));
    assert.equal(snap.byCell.length, 1);
  });
});

describe('cell-event-ledger — events older than the window are ignored', () => {
  test('1-day window skips events 48h old', () => {
    // Bypass record()'s ±1h clamp by writing the row directly — we need a
    // genuinely ancient ts to exercise the window filter.
    const old = NOW - 2 * 86_400_000;
    const stmt = memDb.prepare(
      'INSERT INTO cell_events (event, axis, stage, ref, ts) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run('copy',   'focus', 'fresh', 'oldcopy-12345', old);
    stmt.run('arrive', 'focus', 'fresh', 'oldcopy-12345', old);
    const snap = baseline(1);
    assert.equal(snap.copies, 0);
    assert.equal(snap.arrivals, 0);
  });
});

// ── 4 · Lifetime + maturity (v150d — cited-cell heat) ─────────────────────
//
// Same bypass pattern as above: a direct INSERT goes around record()'s
// ±1h clamp so a lifetime query can see genuinely ancient events.

function insertRaw(event: 'copy' | 'arrive', axis: string, stage: string, ref: string, ts: number): void {
  memDb.prepare(
    'INSERT INTO cell_events (event, axis, stage, ref, ts) VALUES (?, ?, ?, ?, ?)',
  ).run(event, axis, stage, ref, ts);
}

describe('cell-event-ledger — lifetimeByCell', () => {
  test('empty ledger → empty array', () => {
    assert.deepEqual(lifetimeByCell(), []);
  });
  test('folds copies + arrivals per cell with lastTs', () => {
    insertRaw('copy',   'focus', 'fresh', 'lifetest-01', NOW - 5 * 86_400_000);
    insertRaw('arrive', 'focus', 'fresh', 'lifetest-01', NOW - 4 * 86_400_000);
    insertRaw('copy',   'focus', 'fresh', 'lifetest-02', NOW - 1 * 86_400_000);
    const rows = lifetimeByCell();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].copies, 2);
    assert.equal(rows[0].arrivals, 1);
    assert.equal(rows[0].lastTs, NOW - 1 * 86_400_000);
  });
  test('ignores rows with invalid axis/stage', () => {
    insertRaw('copy', 'bogus', 'fresh', 'badaxis-01', NOW);
    assert.equal(lifetimeByCell().length, 0);
  });
});

describe('cell-event-ledger — ledgerMaturity', () => {
  test('empty ledger → ready false, ageDays 0', () => {
    const m = ledgerMaturity(NOW);
    assert.equal(m.ready, false);
    assert.equal(m.ageDays, 0);
    assert.equal(m.coldStartDays, COLD_START_DAYS);
  });
  test('one fresh event → ready false, ageDays ~0', () => {
    insertRaw('copy', 'focus', 'fresh', 'young-event-1', NOW);
    const m = ledgerMaturity(NOW);
    assert.equal(m.ready, false);
    assert.ok(m.ageDays < 1);
  });
  test('oldest event older than COLD_START_DAYS → ready true', () => {
    insertRaw('copy', 'focus', 'fresh', 'old-event-1', NOW - (COLD_START_DAYS + 1) * 86_400_000);
    const m = ledgerMaturity(NOW);
    assert.equal(m.ready, true);
    assert.ok(m.ageDays > COLD_START_DAYS);
  });
});

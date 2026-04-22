// src/lib/cell-heat.test.ts
// v150d — unit tests for the pure heat classifier + grid projection.
//
// No DB, no fixtures, no clock. Every test injects `now` and `ledgerReady`
// explicitly so the classifier is deterministic across CI and laptop.
//
// Run:  node --test --import=tsx/esm src/lib/cell-heat.test.ts
//
// Credits: Mike (napkin §classifier-rule — one producer, tested once),
//          Tanya (§4 heat vocabulary, §7 ARIA sentence shape),
//          Elon (cold-start guardrail), Sid (helpers ≤ 10 LOC).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  cellHeat,
  heatedGrid,
  heatSentence,
  HEAT_LEVELS,
  HEAT_WARM_DAYS,
  HEAT_COOL_DAYS,
} from './cell-heat.js';
import type { HeatedCell, HeatLevel } from './cell-heat.js';
import { STAGE_AXES } from './stage-axes.js';
import { DECAY_STAGES } from './decay-engine.js';
import type { CellLifetime } from './cell-event-ledger.js';

const DAY_MS = 86_400_000;
const NOW = 1_714_000_000_000;   // fixed instant — all tests relative to this

// ── 1 · Vocabulary discipline ─────────────────────────────────────────────

describe('cell-heat — vocabulary does not collide with DecayStage', () => {
  test('HEAT_LEVELS has exactly five distinct literals', () => {
    assert.equal(HEAT_LEVELS.length, 5);
    assert.equal(new Set(HEAT_LEVELS).size, 5);
  });
  test('no heat level equals any DecayStage literal', () => {
    for (const h of HEAT_LEVELS)
      assert.ok(!DECAY_STAGES.includes(h as never), `collision: ${h}`);
  });
});

// ── 2 · Classifier boundary cases ─────────────────────────────────────────

describe('cell-heat — cellHeat()', () => {
  test('ledger not ready → dormant regardless of lastTs', () => {
    assert.equal(cellHeat({ lastTs: null, now: NOW, ledgerReady: false }), 'dormant');
    assert.equal(cellHeat({ lastTs: NOW,  now: NOW, ledgerReady: false }), 'dormant');
  });
  test('ledger ready, never cited → unseen', () => {
    assert.equal(cellHeat({ lastTs: null, now: NOW, ledgerReady: true }), 'unseen');
  });
  test('cited just now → warm', () => {
    assert.equal(cellHeat({ lastTs: NOW, now: NOW, ledgerReady: true }), 'warm');
  });
  test('cited exactly on the 7-day boundary → warm (inclusive)', () => {
    const lastTs = NOW - HEAT_WARM_DAYS * DAY_MS;
    assert.equal(cellHeat({ lastTs, now: NOW, ledgerReady: true }), 'warm');
  });
  test('cited at 7 days + 1 hour → cooling', () => {
    const lastTs = NOW - (HEAT_WARM_DAYS * DAY_MS + 3_600_000);
    assert.equal(cellHeat({ lastTs, now: NOW, ledgerReady: true }), 'cooling');
  });
  test('cited exactly on the 30-day boundary → cooling (inclusive)', () => {
    const lastTs = NOW - HEAT_COOL_DAYS * DAY_MS;
    assert.equal(cellHeat({ lastTs, now: NOW, ledgerReady: true }), 'cooling');
  });
  test('cited beyond 30 days → cold', () => {
    const lastTs = NOW - (HEAT_COOL_DAYS + 1) * DAY_MS;
    assert.equal(cellHeat({ lastTs, now: NOW, ledgerReady: true }), 'cold');
  });
});

// ── 3 · Grid projection — always 35 cells, no gaps ────────────────────────

describe('cell-heat — heatedGrid() projection', () => {
  test('empty ledger, not ready → 35 dormant cells', () => {
    const grid = heatedGrid([], { ready: false }, NOW);
    assert.equal(grid.length, STAGE_AXES.length * DECAY_STAGES.length);
    assert.ok(grid.every((c) => c.heat === 'dormant'));
    assert.ok(grid.every((c) => c.copies === 0 && c.arrivals === 0 && c.lastTs === null));
  });
  test('empty ledger, ready → 35 unseen cells', () => {
    const grid = heatedGrid([], { ready: true }, NOW);
    assert.ok(grid.every((c) => c.heat === 'unseen'));
  });
  test('one warm cell, rest unseen', () => {
    const lifetime: CellLifetime[] = [
      { axis: 'focus', stage: 'fresh', copies: 3, arrivals: 2, lastTs: NOW - DAY_MS },
    ];
    const grid = heatedGrid(lifetime, { ready: true }, NOW);
    const hot = grid.find((c) => c.axis === 'focus' && c.stage === 'fresh')!;
    assert.equal(hot.heat, 'warm');
    assert.equal(hot.copies, 3);
    assert.equal(hot.arrivals, 2);
    const cold = grid.filter((c) => !(c.axis === 'focus' && c.stage === 'fresh'));
    assert.ok(cold.every((c) => c.heat === 'unseen'));
  });
  test('grid order matches STAGE_AXES × DECAY_STAGES row-major', () => {
    const grid = heatedGrid([], { ready: true }, NOW);
    let i = 0;
    for (const axis of STAGE_AXES)
      for (const stage of DECAY_STAGES) {
        assert.equal(grid[i].axis, axis);
        assert.equal(grid[i].stage, stage);
        i++;
      }
  });
});

// ── 4 · ARIA sentence — readable by a human, scannable by a parser ────────

describe('cell-heat — heatSentence()', () => {
  function cell(heat: HeatLevel, overrides: Partial<HeatedCell> = {}): HeatedCell {
    return {
      axis: 'typography', stage: 'endangered',
      heat, lastTs: null, copies: 0, arrivals: 0,
      ...overrides,
    };
  }
  test('dormant sentence names the cold-start week', () => {
    const s = heatSentence(cell('dormant'), NOW);
    assert.match(s, /typography at endangered/);
    assert.match(s, /telemetry warms up/);
  });
  test('unseen sentence is explicit, not a lie', () => {
    const s = heatSentence(cell('unseen'), NOW);
    assert.match(s, /not yet cited/);
  });
  test('cited twice, 2 days ago — plural + ago phrase', () => {
    const c = cell('cooling', { copies: 2, lastTs: NOW - 2 * DAY_MS });
    const s = heatSentence(c, NOW);
    assert.match(s, /cited 2 times/);
    assert.match(s, /last 2 days ago/);
  });
  test('cited once today — singular + today phrase', () => {
    const c = cell('warm', { copies: 1, lastTs: NOW });
    const s = heatSentence(c, NOW);
    assert.match(s, /cited 1 time/);
    assert.match(s, /last today/);
  });
});

// src/lib/client/matrix-keynav.test.ts
//
// Pure-function tests for the v151 keyboard-grid movement math. Zero DOM.
// Zero JSDOM. These exist to lock `nextIndex` into clamp-not-wrap forever,
// and to make any future change to arrow/Home/End/PgUp/PgDn semantics an
// obvious red diff.
//
// Run:  npx tsx --test src/lib/client/matrix-keynav.test.ts
//
// Credits: Mike (§6.2 function signature), Tanya (§11.5 clamp acceptance),
//          Elon (§5 ruthless diff — clamp vs wrap is a one-line decision),
//          AGENTS.md (axis freeze — bounds come from tuple lengths).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { nextIndex } from './matrix-keynav.js';
import type { NavKey } from './matrix-keynav.js';
import { STAGE_AXES } from '../stage-axes.js';
import { DECAY_STAGES } from '../decay-engine.js';

// ── Geometry derived once from the frozen tuples. Keeps tests axis-freeze
//    honest: if someone ever sneaks an 8th axis in, these still pass (and
//    the compliance guard blocks the commit upstream).                    ─

const MAX_AXIS  = STAGE_AXES.length   - 1;
const MAX_STAGE = DECAY_STAGES.length - 1;
const MID_AXIS  = Math.floor(MAX_AXIS  / 2);
const MID_STAGE = Math.floor(MAX_STAGE / 2);

// ── Arrow-key movement: one step at a time, clamp at the edges ────────────

describe('nextIndex — ArrowUp moves axis backward and clamps at 0', () => {
  test('from middle row moves up one', () => {
    assert.deepEqual(nextIndex(MID_AXIS, MID_STAGE, 'ArrowUp'),
      { axisIdx: MID_AXIS - 1, stageIdx: MID_STAGE });
  });
  test('at top row stays at 0 (no wrap)', () => {
    assert.deepEqual(nextIndex(0, 2, 'ArrowUp'), { axisIdx: 0, stageIdx: 2 });
  });
});

describe('nextIndex — ArrowDown moves axis forward and clamps at MAX_AXIS', () => {
  test('from middle row moves down one', () => {
    assert.deepEqual(nextIndex(MID_AXIS, MID_STAGE, 'ArrowDown'),
      { axisIdx: MID_AXIS + 1, stageIdx: MID_STAGE });
  });
  test('at bottom row stays at MAX_AXIS (no wrap)', () => {
    assert.deepEqual(nextIndex(MAX_AXIS, 3, 'ArrowDown'),
      { axisIdx: MAX_AXIS, stageIdx: 3 });
  });
});

describe('nextIndex — ArrowLeft moves stage backward and clamps at 0', () => {
  test('from middle col moves left one', () => {
    assert.deepEqual(nextIndex(MID_AXIS, MID_STAGE, 'ArrowLeft'),
      { axisIdx: MID_AXIS, stageIdx: MID_STAGE - 1 });
  });
  test('at leftmost col stays at 0 (no wrap)', () => {
    assert.deepEqual(nextIndex(4, 0, 'ArrowLeft'), { axisIdx: 4, stageIdx: 0 });
  });
});

describe('nextIndex — ArrowRight moves stage forward and clamps at MAX_STAGE', () => {
  test('from middle col moves right one', () => {
    assert.deepEqual(nextIndex(MID_AXIS, MID_STAGE, 'ArrowRight'),
      { axisIdx: MID_AXIS, stageIdx: MID_STAGE + 1 });
  });
  test('at rightmost col stays at MAX_STAGE (no wrap)', () => {
    assert.deepEqual(nextIndex(1, MAX_STAGE, 'ArrowRight'),
      { axisIdx: 1, stageIdx: MAX_STAGE });
  });
});

// ── Home / End: jump within row (stage axis) ──────────────────────────────

describe('nextIndex — Home / End jump within the current row', () => {
  test('Home snaps stage to 0, axis untouched', () => {
    assert.deepEqual(nextIndex(3, MAX_STAGE, 'Home'), { axisIdx: 3, stageIdx: 0 });
  });
  test('End snaps stage to MAX_STAGE, axis untouched', () => {
    assert.deepEqual(nextIndex(3, 0, 'End'), { axisIdx: 3, stageIdx: MAX_STAGE });
  });
  test('Home on already-at-start is a no-op', () => {
    assert.deepEqual(nextIndex(5, 0, 'Home'), { axisIdx: 5, stageIdx: 0 });
  });
});

// ── PageUp / PageDown: jump within column (axis axis) ─────────────────────

describe('nextIndex — PageUp / PageDown jump within the current column', () => {
  test('PageUp snaps axis to 0, stage untouched', () => {
    assert.deepEqual(nextIndex(MAX_AXIS, 2, 'PageUp'), { axisIdx: 0, stageIdx: 2 });
  });
  test('PageDown snaps axis to MAX_AXIS, stage untouched', () => {
    assert.deepEqual(nextIndex(0, 2, 'PageDown'), { axisIdx: MAX_AXIS, stageIdx: 2 });
  });
  test('PageUp on already-at-top is a no-op', () => {
    assert.deepEqual(nextIndex(0, 4, 'PageUp'), { axisIdx: 0, stageIdx: 4 });
  });
});

// ── Exhaustive freeze check: every cell × every nav key stays in-bounds ──

describe('nextIndex — exhaustive bounds check across all 7×5×8 cases', () => {
  const KEYS: NavKey[] = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
  ];

  test('every (axis, stage, key) produces an in-bounds coordinate', () => {
    for (let a = 0; a <= MAX_AXIS; a++) {
      for (let s = 0; s <= MAX_STAGE; s++) {
        for (const k of KEYS) {
          const out = nextIndex(a, s, k);
          assert.ok(out.axisIdx  >= 0 && out.axisIdx  <= MAX_AXIS,
            `axisIdx OOB for ${a},${s},${k}: ${out.axisIdx}`);
          assert.ok(out.stageIdx >= 0 && out.stageIdx <= MAX_STAGE,
            `stageIdx OOB for ${a},${s},${k}: ${out.stageIdx}`);
        }
      }
    }
  });

  test('each nav key only moves along one axis at a time', () => {
    for (const k of KEYS) {
      const out = nextIndex(MID_AXIS, MID_STAGE, k);
      const rowKey = k === 'ArrowUp'   || k === 'ArrowDown'
                  || k === 'PageUp'    || k === 'PageDown';
      const colKey = k === 'ArrowLeft' || k === 'ArrowRight'
                  || k === 'Home'      || k === 'End';
      if (rowKey) assert.equal(out.stageIdx, MID_STAGE, `${k} leaked into stage`);
      if (colKey) assert.equal(out.axisIdx,  MID_AXIS,  `${k} leaked into axis`);
    }
  });
});

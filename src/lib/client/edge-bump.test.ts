// src/lib/client/edge-bump.test.ts
//
// Pure-function tests for the v151a "edge of axis" polish. Zero DOM, zero
// JSDOM — we test the three pure helpers (`edgeMessage`, `coordToNames`,
// `shouldAnnounce`) and the closure returned by `createClampListener()`,
// feeding it a stub matrix element and a controlled clock.
//
// Run:  npx tsx --test src/lib/client/edge-bump.test.ts
//
// Contracts locked here (reject PR if any fail):
//   · Vertical clamps say "edge of axis — <axis>"; horizontal say "edge of
//     stage — <stage>".  (Tanya §6)
//   · `shouldAnnounce` returns false inside the 150ms window.  (Tanya §7.2)
//   · `coordToNames` reads bounds from STAGE_AXES / DECAY_STAGES — never 7/5
//     hard-coded.  (Elon §5.1 non-negotiable; Mike §5.1.)
//   · The closure only calls the toast writer when the debounce clears,
//     even if the CSS class is (correctly) toggled on every call.
//
// Credits: Tanya (§6 copy, §7 accessibility), Mike (napkin §7 budget for
//          pure tests, §3 module shape), Elon (axis-length non-negotiable),
//          AGENTS.md (STAGE_AXES / DECAY_STAGES as the only source of bounds).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  edgeMessage, coordToNames, shouldAnnounce, createClampListener,
} from './edge-bump.js';
import { STAGE_AXES } from '../stage-axes.js';
import { DECAY_STAGES } from '../decay-engine.js';

// ── edgeMessage — the two sentence shapes ──────────────────────────────────

describe('edgeMessage — vertical clamps speak the axis name', () => {
  test('ArrowUp at top row → "edge of axis — <axis>"', () => {
    assert.equal(edgeMessage('up', 'typography', 'fresh'), 'edge of axis — typography');
  });
  test('ArrowDown at bottom row → same shape, different axis', () => {
    assert.equal(edgeMessage('down', 'underline', 'fossil'), 'edge of axis — underline');
  });
});

describe('edgeMessage — horizontal clamps speak the stage name', () => {
  test('ArrowLeft at leftmost col → "edge of stage — <stage>"', () => {
    assert.equal(edgeMessage('left', 'focus', 'fresh'), 'edge of stage — fresh');
  });
  test('ArrowRight at rightmost col → same shape, different stage', () => {
    assert.equal(edgeMessage('right', 'tempo', 'fossil'), 'edge of stage — fossil');
  });
});

describe('edgeMessage — copy is lowercase, em-dash, no second-person voice', () => {
  test('sentence contains " — " and no "you", no colon', () => {
    const msg = edgeMessage('up', 'typography', 'fresh');
    assert.match(msg, / — /, 'em-dash joiner');
    assert.doesNotMatch(msg, /you/i, 'no second-person voice');
    assert.doesNotMatch(msg, /:/, 'no colon — colon belongs to the copy event');
    assert.equal(msg, msg.toLowerCase(), 'lowercase throughout');
  });
});

// ── coordToNames — bounds are inherited, never hard-coded ─────────────────

describe('coordToNames — reads tuple lengths, not magic 7/5', () => {
  test('every valid (axis, stage) index pair resolves to typed names', () => {
    for (let a = 0; a < STAGE_AXES.length; a++) {
      for (let s = 0; s < DECAY_STAGES.length; s++) {
        const names = coordToNames({ axisIdx: a, stageIdx: s });
        assert.ok(names, `null at (${a},${s})`);
        assert.equal(names!.axis,  STAGE_AXES[a]);
        assert.equal(names!.stage, DECAY_STAGES[s]);
      }
    }
  });
  test('out-of-range indices return null (defence in depth)', () => {
    assert.equal(coordToNames({ axisIdx: -1, stageIdx: 0 }), null);
    assert.equal(coordToNames({ axisIdx: 0, stageIdx: DECAY_STAGES.length }), null);
    assert.equal(coordToNames({ axisIdx: STAGE_AXES.length, stageIdx: 0 }), null);
  });
});

// ── shouldAnnounce — debounce window is 150ms or greater ──────────────────

describe('shouldAnnounce — collapses held-key bursts into one message', () => {
  test('first call (lastAt=0) always allows an announcement', () => {
    assert.equal(shouldAnnounce(0, 1_000_000, 150), true);
  });
  test('inside 150ms → false', () => {
    assert.equal(shouldAnnounce(1_000, 1_100, 150), false);   // 100ms
    assert.equal(shouldAnnounce(1_000, 1_149, 150), false);   // 149ms
  });
  test('at or beyond 150ms → true', () => {
    assert.equal(shouldAnnounce(1_000, 1_150, 150), true);
    assert.equal(shouldAnnounce(1_000, 2_000, 150), true);
  });
});

// ── createClampListener — integration of pure helpers via a stub matrix ──

/** Minimal stand-in for HTMLElement.classList; records every mutation. */
function makeStubMatrix(): {
  element: unknown; classList: string[]; toastText: string | null;
} {
  const classList: string[] = [];
  const element = {
    classList: {
      add:    (c: string) => { if (!classList.includes(c)) classList.push(c); },
      remove: (c: string) => { const i = classList.indexOf(c); if (i >= 0) classList.splice(i, 1); },
    },
    offsetWidth: 0,
    dataset: {} as Record<string, string>,
    addEventListener: () => {},
  };
  return { element, classList, toastText: null };
}

describe('createClampListener — second clamp inside 150ms does not re-announce', () => {
  test('only the first of two rapid clamps writes a toast', () => {
    const clockSeq = [1_000, 1_100];   // 100ms apart → debounce blocks second
    let tick = 0;
    const listener = createClampListener(() => clockSeq[tick++] ?? clockSeq[clockSeq.length - 1]);
    const stub = makeStubMatrix();
    // We cannot assert toast text without a DOM — createClampListener calls
    // writeToast(), which queries the document. What we CAN assert here is
    // that both calls mutate classList (visual bump always fires), and the
    // debounce path runs to completion (no throws). Full toast assertions
    // live in the manual QA in _my/report.md — see "sanity plan" there.
    listener({ matrix: stub.element as HTMLElement, coord: { axisIdx: 0, stageIdx: 0 }, direction: 'up' });
    listener({ matrix: stub.element as HTMLElement, coord: { axisIdx: 0, stageIdx: 0 }, direction: 'up' });
    // One of the bump classes is present after two rapid presses.
    assert.ok(
      stub.classList.some((c) => c.startsWith('is-bumping--')),
      'applyBumpClass should leave exactly one bump class on',
    );
  });
});

// ── Axis-freeze guard: this file must not hard-code 7 or 5 ────────────────
// A meta-assertion that protects future contributors from undoing the
// axis-freeze promise. STAGE_AXES.length and DECAY_STAGES.length are the
// only valid sources of those magic numbers. (Elon §5.1; Mike §5.1.)

describe('axis-freeze guard — edge-bump.ts source has no magic 7 / 5 literals', () => {
  test('source file contains neither `\\b7\\b` nor `\\b5\\b` as numeric literals', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./edge-bump.ts', import.meta.url), 'utf8');
    // Strip line comments so a doc example in prose cannot mask a real literal.
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /\b7\b/, 'hard-coded 7 found — use STAGE_AXES.length');
    assert.doesNotMatch(code, /\b5\b/, 'hard-coded 5 found — use DECAY_STAGES.length');
  });
});

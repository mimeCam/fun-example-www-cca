// src/lib/client/arrival.test.ts
//
// v154 — unit tests for the arrival sub-system (Mike napkin §6 test plan,
// Tanya UX spec §7 done-looks-like).
//
// Strategy (mirrors ds-kbd-lit.test.ts + cell-cite.test.ts shape):
//   · No JSDOM. Pure-function probes + one structural source-grep.
//   · Fences go in code: this test IS the v154 invariant ("arrival.ts
//     never imports ds-kbd-lit"). If a well-meaning refactor re-threads
//     the chip-lit vocabulary into arrival.ts, the build fails here AND
//     in the prebuild guard. Two witnesses, one truth.
//   · Re-exported ARRIVAL_MS round-trips: cell-cite.ts still re-exports
//     the same 1200 ms beat (cell-confirm.test.ts snapshot parity).
//
// Run:  npx tsx --test src/lib/client/arrival.test.ts
//
// Contracts locked here (reject PR if any fail):
//   · isValidRef accepts the same shape as REF_RE: [A-Za-z0-9-]{8,64}.
//   · ARRIVAL_MS is a positive integer, matches the v150b beat (1200 ms).
//   · arrival.ts source contains NO reference to the chip-lit vocabulary.
//   · cell-cite.ts re-exports ARRIVAL_MS as-is (snapshot parity).
//
// Credits: Mike (napkin §6 test plan, §5.1 invariant fence as test),
//          Tanya (UX spec §7 done-looks-like checklist), Paul (test-
//          first, "the test IS the feature"), Elon (report 32 — the
//          invariant that earns the new pixels), Sid — 2026-04-22.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ARRIVAL_MS, isValidRef } from './arrival.ts';
import { ARRIVAL_MS as ARRIVAL_MS_RE_EXPORT } from './cell-cite.ts';

// ── Source-grep: invariant fence (Mike §5.1 — the feature) ───────────────
// This is the SECOND witness to the prebuild guard. If someone disables
// the guard in a hurry, this test still screams. Cheap defence in depth.

const ARRIVAL_SRC = fs.readFileSync(
  path.resolve(process.cwd(), 'src/lib/client/arrival.ts'),
  'utf-8',
);

/** Strip `//` single-line comments so the fence inspects code only, not
 *  prose documenting the rule. Mirrors the prebuild guard's logic.     */
function stripLineComments(src: string): string {
  return src.split('\n').map((l) => {
    const i = l.indexOf('//');
    return i === -1 ? l : l.slice(0, i);
  }).join('\n');
}

const ARRIVAL_CODE = stripLineComments(ARRIVAL_SRC);

describe('v154 — arrival.ts invariant fence (no chip-lit vocabulary)', () => {
  for (const forbidden of ['ds-kbd-lit', 'lightForKey', 'unlightForKey']) {
    test(`arrival.ts code must NOT reference "${forbidden}"`, () => {
      assert.equal(
        ARRIVAL_CODE.includes(forbidden), false,
        `chip-lit contract breach: arrival.ts references "${forbidden}" in code`,
      );
    });
  }
});

// ── isValidRef — truth table over the REF_RE shape ───────────────────────

describe('v154 — isValidRef (pure REF_RE gate)', () => {
  test('accepts typical crypto.randomUUID() 36-char output', () => {
    assert.equal(isValidRef('550e8400-e29b-41d4-a716-446655440000'), true);
  });
  test('accepts legacy 16-hex fallback (Math.random form)', () => {
    assert.equal(isValidRef('a1b2c3d4e5f60718'), true);
  });
  test('accepts the 8-char lower bound', () => {
    assert.equal(isValidRef('abcdefgh'), true);
  });
  test('accepts the 64-char upper bound', () => {
    assert.equal(isValidRef('a'.repeat(64)), true);
  });
});

describe('v154 — isValidRef rejects malformed nonces', () => {
  test('rejects null (absent)', () => {
    assert.equal(isValidRef(null), false);
  });
  test('rejects undefined (absent)', () => {
    assert.equal(isValidRef(undefined), false);
  });
  test('rejects the empty string', () => {
    assert.equal(isValidRef(''), false);
  });
  test('rejects 7 chars (one below the lower bound)', () => {
    assert.equal(isValidRef('1234567'), false);
  });
  test('rejects 65 chars (one above the upper bound)', () => {
    assert.equal(isValidRef('a'.repeat(65)), false);
  });
  test('rejects characters outside [A-Za-z0-9-]', () => {
    // Most common injection shapes: slashes, query strings, spaces.
    for (const bad of ['abcd/efgh', 'abc defghi', 'ref?123=x', 'ref#hash.', '<script>!']) {
      assert.equal(isValidRef(bad), false, `expected reject for ${JSON.stringify(bad)}`);
    }
  });
});

// ── ARRIVAL_MS beat — parity with cell-cite re-export ────────────────────
// cell-confirm.test.ts snapshots ARRIVAL_MS via cell-cite; arrival.ts is
// the new source of truth. A divergence here would tear the receipt
// across the two mouths (cite + arrival).

describe('v154 — ARRIVAL_MS beat (single-source)', () => {
  test('ARRIVAL_MS is a positive integer in ms', () => {
    assert.equal(Number.isInteger(ARRIVAL_MS), true);
    assert.ok(ARRIVAL_MS > 0, `expected positive beat, got ${ARRIVAL_MS}`);
  });
  test('ARRIVAL_MS equals the v150b beat (1200 ms)', () => {
    // Changing this value also requires updating cell-confirm.test.ts;
    // the snapshot there is the per-beat story. Keep them in lockstep.
    assert.equal(ARRIVAL_MS, 1200);
  });
  test('cell-cite.ts re-exports ARRIVAL_MS byte-identically', () => {
    // Two modules, one beat: the v154 extraction must NOT let the two
    // mouths drift. A reviewer who tunes one but not the other fails
    // this test before the cell-confirm snapshot even fires.
    assert.equal(ARRIVAL_MS_RE_EXPORT, ARRIVAL_MS);
  });
});

// ── Structural — arrival.ts exposes its public API ───────────────────────
// If a refactor renames one of these exports, every call site breaks at
// compile time — but renaming to a different PUBLIC contract (e.g.
// splitting markShared into two functions) should feel deliberate. A
// source-grep on the export list makes the rename loud.

describe('v154 — arrival.ts public API shape', () => {
  const EXPECTED_EXPORTS: readonly string[] = [
    'export const ARRIVAL_MS',
    'export function readRef',
    'export function isValidRef',
    'export function retireCompetingGlows',
    'export function triggerArrival',
    'export function markShared',
    'export function paintArrival',
  ];
  for (const sig of EXPECTED_EXPORTS) {
    test(`arrival.ts exports \`${sig.replace('export ', '').split(/\s/)[1] ?? sig}\``, () => {
      assert.ok(
        ARRIVAL_SRC.includes(sig),
        `public API drift: arrival.ts no longer declares "${sig}"`,
      );
    });
  }
});

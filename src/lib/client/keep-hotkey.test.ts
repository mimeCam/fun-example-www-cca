// src/lib/client/keep-hotkey.test.ts
//
// v152 — pure-function tests for the `K` keep hotkey. Zero DOM, zero
// JSDOM. Clone of cell-cite.test.ts shape — truth table over
// {key} × {modifier combos} — because the pattern is already proved
// in two sibling modules (Mike napkin §scoped-reuse, §non-goals "no
// new helper extraction before the third consumer").
//
// Contracts locked here (reject PR if any fail):
//   · `k` / `K` are keep keys; nothing else is.
//   · Cmd/Ctrl/Alt + `k` is NOT a keep key — native platform chords
//     (Ctrl+K, Cmd+K for search / find) must never be stolen.
//   · Shift+`k` still keeps (capital letter is a letter, not a chord).
//
// Run:  npx tsx --test src/lib/client/keep-hotkey.test.ts
//
// Credits: Mike (napkin §scope §2 truth-table test, §risk register row
//          on K-collision — documented here), Tanya (§6.3 "teach a
//          live key, not a planned one"), Elon (§4 predicate per
//          surface), Sid — every test is one assertion, cheap to read.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isKeepKey } from './keep-hotkey.ts';

// ── Tiny KeyboardEvent stand-in (no JSDOM needed) ─────────────────────────

type Mods = Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>>;

function keyEvt(key: string, mods: Mods = {}): KeyboardEvent {
  return {
    key,
    metaKey:  mods.metaKey  ?? false,
    ctrlKey:  mods.ctrlKey  ?? false,
    altKey:   mods.altKey   ?? false,
    shiftKey: mods.shiftKey ?? false,
  } as KeyboardEvent;
}

// ── isKeepKey — the two forms of K with no modifiers ──────────────────────

describe('isKeepKey — bare letter, no modifiers', () => {
  test('`k` (lowercase) is a keep', () => {
    assert.equal(isKeepKey(keyEvt('k')), true);
  });
  test('`K` (capital — caps-lock or shift-held) is a keep', () => {
    assert.equal(isKeepKey(keyEvt('K')), true);
  });
});

describe('isKeepKey — Shift is transparent; capital K still keeps', () => {
  test('Shift+k still keeps (native `event.key` lowers when Shift flips caps)', () => {
    assert.equal(isKeepKey(keyEvt('k', { shiftKey: true })), true);
  });
  test('Shift+K still keeps (caps-lock on + Shift held → capital)', () => {
    assert.equal(isKeepKey(keyEvt('K', { shiftKey: true })), true);
  });
});

describe('isKeepKey — Cmd / Ctrl / Alt drop the keep (native chords win)', () => {
  test('Cmd+k → false (let native Cmd+K through — browser search)', () => {
    assert.equal(isKeepKey(keyEvt('k', { metaKey: true })), false);
  });
  test('Ctrl+k → false (Ctrl+K = search/omnibox on many browsers)', () => {
    assert.equal(isKeepKey(keyEvt('k', { ctrlKey: true })), false);
  });
  test('Alt+k → false (Alt-chords own by platform)', () => {
    assert.equal(isKeepKey(keyEvt('k', { altKey: true })), false);
  });
  test('Cmd+K (capital) → false', () => {
    assert.equal(isKeepKey(keyEvt('K', { metaKey: true })), false);
  });
});

describe('isKeepKey — everything else is NOT a keep', () => {
  const NON_KEEP = ['a', 'c', 'j', 'l', 'x', 'Escape', 'Tab', 'Enter', ' ',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown', '0'];
  for (const key of NON_KEEP) {
    test(`"${key}" is not a keep`, () => {
      assert.equal(isKeepKey(keyEvt(key)), false);
    });
  }
});

// ── Exhaustive modifier-combo sweep — Cmd/Ctrl/Alt ALWAYS suppress ────────

describe('isKeepKey — any Cmd/Ctrl/Alt combo suppresses both K forms', () => {
  const KEEP_KEYS = ['k', 'K'];
  const COMBOS: Mods[] = [
    { metaKey: true },
    { ctrlKey: true },
    { altKey:  true },
    { metaKey: true, shiftKey: true },
    { ctrlKey: true, shiftKey: true },
    { altKey:  true, shiftKey: true },
    { metaKey: true, ctrlKey: true },
  ];
  test('every combo × every keep key → false', () => {
    for (const key of KEEP_KEYS) {
      for (const mods of COMBOS) {
        assert.equal(isKeepKey(keyEvt(key, mods)), false,
          `expected suppression for key="${key}" mods=${JSON.stringify(mods)}`);
      }
    }
  });
});

// ── Disjointness — K must not overlap cite or nav predicates ──────────────
// Mike §5.9 / §non-negotiables: the predicates never share a key, so the
// three listeners never race. If someone adds `k` to CITE_KEYS or NAV_KEYS
// under deadline pressure, this test fires before the build ships.

describe('isKeepKey — disjoint from cite and nav keys', () => {
  test('none of the cite keys are keep keys', () => {
    for (const key of ['c', 'Enter', ' ']) {
      assert.equal(isKeepKey(keyEvt(key)), false);
    }
  });
  test('none of the nav keys are keep keys', () => {
    const NAV = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                 'Home','End','PageUp','PageDown'];
    for (const key of NAV) {
      assert.equal(isKeepKey(keyEvt(key)), false);
    }
  });
});

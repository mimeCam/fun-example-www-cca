// src/lib/client/revive-hotkey.test.ts
//
// v175 — pure-function tests for the `R` revive hotkey. Zero DOM, zero
// JSDOM. Clone of keep-hotkey.test.ts shape — truth table over
// {key} × {modifier combos} — because the pattern is already proved in
// three sibling modules (cell-cite, keep, submit). Mike napkin §scope
// §2: "the predicate is where the entire correctness story lives — test
// it exhaustively."
//
// Contracts locked here (reject PR if any fail):
//   · `r` / `R` are revive keys; nothing else is.
//   · Cmd/Ctrl + R is NOT a revive key — native browser refresh must
//     never be stolen (Mike §6 "Modifier discipline", Tanya §4.1).
//   · Alt + R is NOT a revive key — platform chords win.
//   · Shift + R still revives (capital letter is a letter, not a chord).
//   · The revive predicate is DISJOINT from the keep predicate — `K`
//     and `R` must never both fire on the same keystroke.
//
// Run:  npx tsx --test src/lib/client/revive-hotkey.test.ts
//
// Credits: Mike Koch (napkin §scope §2 truth-table test, §7 risk register
//          row on Cmd+R collision), Tanya Donska (§4.1 trigger & guard),
//          Elon (§5.1 wedge discipline), keep-hotkey.test.ts prior art,
//          Sid — every test is one assertion, cheap to read.
//          2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isReviveKey } from './revive-hotkey.ts';
import { isKeepKey   } from './keep-hotkey.ts';

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

// ── isReviveKey — the two forms of R with no modifiers ────────────────────

describe('isReviveKey — bare letter, no modifiers', () => {
  test('`r` (lowercase) is a revive', () => {
    assert.equal(isReviveKey(keyEvt('r')), true);
  });
  test('`R` (capital — caps-lock or shift-held) is a revive', () => {
    assert.equal(isReviveKey(keyEvt('R')), true);
  });
});

describe('isReviveKey — Shift is transparent; capital R still revives', () => {
  test('Shift+r still revives (event.key lowers on some layouts)', () => {
    assert.equal(isReviveKey(keyEvt('r', { shiftKey: true })), true);
  });
  test('Shift+R still revives (caps-lock on + Shift held → capital)', () => {
    assert.equal(isReviveKey(keyEvt('R', { shiftKey: true })), true);
  });
});

describe('isReviveKey — Cmd / Ctrl / Alt drop the revive (browser chords win)', () => {
  test('Cmd+r → false (macOS reload — let native chord through)', () => {
    assert.equal(isReviveKey(keyEvt('r', { metaKey: true })), false);
  });
  test('Ctrl+r → false (Windows/Linux reload — let native chord through)', () => {
    assert.equal(isReviveKey(keyEvt('r', { ctrlKey: true })), false);
  });
  test('Alt+r → false (Alt-chords owned by platform)', () => {
    assert.equal(isReviveKey(keyEvt('r', { altKey: true })), false);
  });
  test('Cmd+R (capital) → false (browser refresh with caps-lock on)', () => {
    assert.equal(isReviveKey(keyEvt('R', { metaKey: true })), false);
  });
  test('Ctrl+R (capital) → false (same — refresh wins)', () => {
    assert.equal(isReviveKey(keyEvt('R', { ctrlKey: true })), false);
  });
});

describe('isReviveKey — everything else is NOT a revive', () => {
  const NON_REVIVE = ['a', 'c', 'k', 's', 'x', 'Escape', 'Tab', 'Enter', ' ',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown', '0', '1', '2', '3'];
  for (const key of NON_REVIVE) {
    test(`"${key}" is not a revive`, () => {
      assert.equal(isReviveKey(keyEvt(key)), false);
    });
  }
});

// ── Exhaustive modifier-combo sweep — Cmd/Ctrl/Alt ALWAYS suppress ────────

describe('isReviveKey — any Cmd/Ctrl/Alt combo suppresses both R forms', () => {
  const REVIVE_KEYS = ['r', 'R'];
  const COMBOS: Mods[] = [
    { metaKey: true },
    { ctrlKey: true },
    { altKey:  true },
    { metaKey: true, shiftKey: true },
    { ctrlKey: true, shiftKey: true },
    { altKey:  true, shiftKey: true },
    { metaKey: true, ctrlKey: true },
  ];
  test('every combo × every revive key → false', () => {
    for (const key of REVIVE_KEYS) {
      for (const mods of COMBOS) {
        assert.equal(isReviveKey(keyEvt(key, mods)), false,
          `expected suppression for key="${key}" mods=${JSON.stringify(mods)}`);
      }
    }
  });
});

// ── Disjointness — R must not overlap keep, cite, or nav predicates ──────
// Mike §5.9 / §non-negotiables: the predicates never share a key, so the
// four listeners never race. If someone adds `r` to KEEP_KEYS under
// deadline pressure, this test fires before the build ships.

describe('isReviveKey — disjoint from keep, cite, and nav keys', () => {
  test('none of the keep keys are revive keys', () => {
    for (const key of ['k', 'K']) {
      assert.equal(isReviveKey(keyEvt(key)), false);
    }
  });
  test('none of the revive keys are keep keys', () => {
    for (const key of ['r', 'R']) {
      assert.equal(isKeepKey(keyEvt(key)), false);
    }
  });
  test('none of the cite keys are revive keys', () => {
    for (const key of ['c', 'Enter', ' ']) {
      assert.equal(isReviveKey(keyEvt(key)), false);
    }
  });
  test('none of the nav keys are revive keys', () => {
    const NAV = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                 'Home','End','PageUp','PageDown'];
    for (const key of NAV) {
      assert.equal(isReviveKey(keyEvt(key)), false);
    }
  });
});

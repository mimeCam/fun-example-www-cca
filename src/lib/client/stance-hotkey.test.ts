// src/lib/client/stance-hotkey.test.ts
//
// v176 — pure-function tests for the `1` / `2` / `3` stance hotkey.
// Zero DOM, zero JSDOM. Clone of revive-hotkey.test.ts shape — truth
// table over {key} × {modifier combos} — because the pattern is already
// proved in three sibling modules (cell-cite, keep, submit, revive).
// Mike napkin §2 "the predicate is where the entire correctness story
// lives — test it exhaustively."
//
// Contracts locked here (reject PR if any fail):
//   · `1` / `2` / `3` are stance keys; nothing else is.
//   · Cmd/Ctrl + {1,2,3} is NOT a stance key — native browser
//     tab-switch shortcut must never be stolen (Mike §6.3).
//   · Alt + {1,2,3} is NOT a stance key — platform chords win.
//   · `!`, `@`, `#` (Shift+digit) are NOT stance keys — the key set
//     gates on `.key` values, not keyCode (Mike §6.3 note).
//   · keyToStance maps each digit to the right stance literal, in the
//     exact order the `.ssb-vote-btn` buttons render (agree/torn/dis).
//   · The stance predicate is DISJOINT from keep/revive predicates —
//     the keyboard mouths never race on a single keystroke.
//
// Run:  npx tsx --test src/lib/client/stance-hotkey.test.ts
//
// Credits: Mike Koch (napkin §2 truth-table test, §6 modifier discipline),
//          Tanya Donska (§3.2 target-state / §3.3 chip-lit), Elon (§5.1
//          wedge discipline), revive-hotkey.test.ts + keep-hotkey.test.ts
//          prior art, Sid — every test is one assertion, cheap to read.
//          2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isStanceKey, keyToStance, STANCE_KEY_MAP } from './stance-hotkey.ts';
import { isKeepKey   } from './keep-hotkey.ts';
import { isReviveKey } from './revive-hotkey.ts';

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

// ── isStanceKey — the three digit keys with no modifiers ──────────────────

describe('isStanceKey — bare digit, no modifiers', () => {
  test('`1` is a stance key (agree)', () => {
    assert.equal(isStanceKey(keyEvt('1')), true);
  });
  test('`2` is a stance key (torn)', () => {
    assert.equal(isStanceKey(keyEvt('2')), true);
  });
  test('`3` is a stance key (disagree)', () => {
    assert.equal(isStanceKey(keyEvt('3')), true);
  });
});

describe('isStanceKey — Cmd / Ctrl / Alt drop the stance (browser chords win)', () => {
  test('Cmd+1 → false (macOS tab switch)', () => {
    assert.equal(isStanceKey(keyEvt('1', { metaKey: true })), false);
  });
  test('Ctrl+1 → false (Windows/Linux tab switch)', () => {
    assert.equal(isStanceKey(keyEvt('1', { ctrlKey: true })), false);
  });
  test('Alt+1 → false (Alt-chords owned by platform/Firefox)', () => {
    assert.equal(isStanceKey(keyEvt('1', { altKey: true })), false);
  });
  test('Cmd+2 → false (tab 2)', () => {
    assert.equal(isStanceKey(keyEvt('2', { metaKey: true })), false);
  });
  test('Ctrl+3 → false (tab 3)', () => {
    assert.equal(isStanceKey(keyEvt('3', { ctrlKey: true })), false);
  });
});

describe('isStanceKey — Shift-variants are not stance keys', () => {
  // On most layouts Shift+1 produces `!` (the .key value). Our predicate
  // compares .key exactly — these are rejected without a modifier flag
  // read. If a layout somehow delivers `.key === '1'` with shiftKey,
  // it still casts (the reader pressed 1 — the chord is just capitalisation).
  test('`!` (Shift+1 on US layout) is not a stance key', () => {
    assert.equal(isStanceKey(keyEvt('!')), false);
  });
  test('`@` (Shift+2 on US layout) is not a stance key', () => {
    assert.equal(isStanceKey(keyEvt('@')), false);
  });
  test('`#` (Shift+3 on US layout) is not a stance key', () => {
    assert.equal(isStanceKey(keyEvt('#')), false);
  });
});

describe('isStanceKey — everything else is NOT a stance key', () => {
  const NON_STANCE = ['0', '4', '5', '9',
    'a', 'c', 'k', 'r', 'R',
    'Escape', 'Tab', 'Enter', ' ',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown'];
  for (const key of NON_STANCE) {
    test(`"${key}" is not a stance key`, () => {
      assert.equal(isStanceKey(keyEvt(key)), false);
    });
  }
});

// ── Exhaustive modifier-combo sweep — Cmd/Ctrl/Alt ALWAYS suppress ────────

describe('isStanceKey — any Cmd/Ctrl/Alt combo suppresses every digit', () => {
  const STANCE_KEYS = ['1', '2', '3'];
  const COMBOS: Mods[] = [
    { metaKey: true },
    { ctrlKey: true },
    { altKey:  true },
    { metaKey: true, shiftKey: true },
    { ctrlKey: true, shiftKey: true },
    { altKey:  true, shiftKey: true },
    { metaKey: true, ctrlKey: true },
  ];
  test('every combo × every stance key → false', () => {
    for (const key of STANCE_KEYS) {
      for (const mods of COMBOS) {
        assert.equal(isStanceKey(keyEvt(key, mods)), false,
          `expected suppression for key="${key}" mods=${JSON.stringify(mods)}`);
      }
    }
  });
});

// ── keyToStance — mapping shape and completeness ──────────────────────────

describe('keyToStance — each digit maps to the right stance literal', () => {
  test('`1` → "agree"', () => {
    assert.equal(keyToStance('1'), 'agree');
  });
  test('`2` → "torn"', () => {
    assert.equal(keyToStance('2'), 'torn');
  });
  test('`3` → "disagree"', () => {
    assert.equal(keyToStance('3'), 'disagree');
  });
  test('non-stance keys return null', () => {
    for (const k of ['0', '4', 'a', 'Enter', '!', '']) {
      assert.equal(keyToStance(k), null, `keyToStance("${k}") should be null`);
    }
  });
  test('STANCE_KEY_MAP has exactly three entries (three mouths)', () => {
    assert.equal(Object.keys(STANCE_KEY_MAP).length, 3);
  });
  test('the three stance literals are unique (no collisions)', () => {
    const values = Object.values(STANCE_KEY_MAP);
    assert.equal(new Set(values).size, values.length);
  });
});

// ── Disjointness — 1/2/3 must not overlap keep / revive predicates ────────
// Mike §6 "Gate on bar visibility" — four listeners, four keyspaces. If
// someone adds `1` to KEEP_KEYS under deadline pressure, this test fires
// before the build ships.

describe('isStanceKey — disjoint from keep and revive predicates', () => {
  test('none of the keep keys are stance keys', () => {
    for (const key of ['k', 'K']) {
      assert.equal(isStanceKey(keyEvt(key)), false);
    }
  });
  test('none of the revive keys are stance keys', () => {
    for (const key of ['r', 'R']) {
      assert.equal(isStanceKey(keyEvt(key)), false);
    }
  });
  test('none of the stance keys are keep keys', () => {
    for (const key of ['1', '2', '3']) {
      assert.equal(isKeepKey(keyEvt(key)), false);
    }
  });
  test('none of the stance keys are revive keys', () => {
    for (const key of ['1', '2', '3']) {
      assert.equal(isReviveKey(keyEvt(key)), false);
    }
  });
});

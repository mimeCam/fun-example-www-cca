// src/lib/client/submit-hotkey.test.ts
//
// v174 — pure-function tests for the `Ctrl+Enter` / `⌘↩` submit hotkey.
// Zero DOM, zero JSDOM. Truth table over {key} × {modifier combos} —
// clone of keep-hotkey.test.ts shape (the rule-of-three is now four:
// cell-cite, keep-hotkey, submit-hotkey, plus the legend surfaces).
//
// Contracts locked here (reject PR if any fail — Mike napkin §7):
//   · Bare `Enter` is NOT a publish — step-1 textarea + step-3 focus
//     ring would both break if it were.
//   · `Ctrl+Enter` AND `Meta+Enter` (⌘↩) are publishes.
//   · `Shift+Enter`, `Alt+Enter`, and any other key are NOT publishes.
//   · The two modifier paths never overlap (one of {Ctrl, Meta} must be
//     held; both held still publishes — paranoia helper, not invariant).
//   · The predicate is disjoint from `isKeepKey` and `isCiteKey` —
//     the three predicates can run in the same listener stack without
//     racing (Mike §6.10, keep-hotkey.test.ts §disjointness).
//
// Run:  npx tsx --test src/lib/client/submit-hotkey.test.ts
//
// Credits: Mike Koch (napkin v174.1 §6.4 modifier chord semantics, §7
//          acceptance, §6.10 polymorphism guard), Tanya (§6 keyboard
//          teaching contract, §3.3 chip-lights), Elon (§4 predicate per
//          surface), Sid — every test is one assertion, cheap to read.
//          2026-04-23. Motto: "code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isSubmitKey } from './submit-hotkey.ts';
import { isKeepKey   } from './keep-hotkey.ts';

// ── Tiny KeyboardEvent stand-in (no JSDOM needed) ─────────────────────────

type Mods = Partial<Pick<KeyboardEvent,
  'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>>;

function keyEvt(key: string, mods: Mods = {}): KeyboardEvent {
  return {
    key,
    metaKey:  mods.metaKey  ?? false,
    ctrlKey:  mods.ctrlKey  ?? false,
    altKey:   mods.altKey   ?? false,
    shiftKey: mods.shiftKey ?? false,
  } as KeyboardEvent;
}

// ── isSubmitKey — bare Enter must NOT publish ─────────────────────────────

describe('isSubmitKey — bare Enter is never a publish', () => {
  test('Enter alone → false (textarea-newline / focus-ring etiquette)', () => {
    assert.equal(isSubmitKey(keyEvt('Enter')), false);
  });
});

// ── isSubmitKey — the two valid chord forms ────────────────────────────────

describe('isSubmitKey — Ctrl+Enter and Meta+Enter publish', () => {
  test('Ctrl+Enter → true (Linux / Windows path)', () => {
    assert.equal(isSubmitKey(keyEvt('Enter', { ctrlKey: true })), true);
  });
  test('Meta+Enter → true (macOS ⌘↩ path)', () => {
    assert.equal(isSubmitKey(keyEvt('Enter', { metaKey: true })), true);
  });
  test('Both Ctrl+Meta+Enter → true (paranoia: still a chord)', () => {
    assert.equal(
      isSubmitKey(keyEvt('Enter', { ctrlKey: true, metaKey: true })),
      true,
    );
  });
});

// ── isSubmitKey — Shift / Alt fall through ─────────────────────────────────

describe('isSubmitKey — Shift / Alt break the chord', () => {
  test('Shift+Enter → false (newline convention; we do not steal it)', () => {
    assert.equal(isSubmitKey(keyEvt('Enter', { shiftKey: true })), false);
  });
  test('Alt+Enter → false (Alt-chords are platform territory)', () => {
    assert.equal(isSubmitKey(keyEvt('Enter', { altKey: true })), false);
  });
  test('Ctrl+Shift+Enter → false (Shift breaks the chord even with Ctrl)', () => {
    assert.equal(
      isSubmitKey(keyEvt('Enter', { ctrlKey: true, shiftKey: true })),
      false,
    );
  });
  test('Meta+Alt+Enter → false (Alt breaks the chord even with Meta)', () => {
    assert.equal(
      isSubmitKey(keyEvt('Enter', { metaKey: true, altKey: true })),
      false,
    );
  });
});

// ── isSubmitKey — every non-Enter key is NOT a publish ────────────────────

describe('isSubmitKey — non-Enter keys are never a publish', () => {
  const NON_ENTER = [
    'a', 'A', 'k', 'K', 'c', 'C', ' ', 'Space', 'Escape', 'Tab',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown', '0', '1',
  ];
  for (const key of NON_ENTER) {
    test(`"${key}" with Ctrl is not a publish`, () => {
      assert.equal(isSubmitKey(keyEvt(key, { ctrlKey: true })), false);
    });
    test(`"${key}" with Meta is not a publish`, () => {
      assert.equal(isSubmitKey(keyEvt(key, { metaKey: true })), false);
    });
  }
});

// ── Disjointness — submit ↛ keep ────────────────────────────────────────
// Mike §6.10 polymorphism guard: predicates never share a key, so the
// listeners never race. If someone adds Enter to KEEP_KEYS or k/K to
// SUBMIT chord under deadline pressure, this test fires before the
// build ships.

describe('isSubmitKey — disjoint from keep-hotkey predicate', () => {
  test('Ctrl+Enter is not a keep (keep-hotkey rejects all Ctrl chords)', () => {
    assert.equal(isKeepKey(keyEvt('Enter', { ctrlKey: true })), false);
  });
  test('Meta+Enter is not a keep (keep-hotkey rejects all Meta chords)', () => {
    assert.equal(isKeepKey(keyEvt('Enter', { metaKey: true })), false);
  });
  test('Bare `k` / `K` are not a publish (Enter-gated only)', () => {
    assert.equal(isSubmitKey(keyEvt('k')), false);
    assert.equal(isSubmitKey(keyEvt('K')), false);
  });
});

// ── Exhaustive modifier-combo sweep — only {Ctrl,Meta} alone work ─────────

describe('isSubmitKey — only the two clean Ctrl/Meta paths publish', () => {
  // Every modifier combination, paired with `Enter` as the key. Only the
  // two "Ctrl OR Meta with no Shift and no Alt" combos must return true;
  // every other combination must return false.
  const TRUTHS: ReadonlyArray<readonly [Mods, boolean]> = [
    [{},                                                     false],
    [{ ctrlKey: true },                                      true ],
    [{ metaKey: true },                                      true ],
    [{ shiftKey: true },                                     false],
    [{ altKey: true },                                       false],
    [{ ctrlKey: true,  shiftKey: true },                     false],
    [{ metaKey: true,  shiftKey: true },                     false],
    [{ ctrlKey: true,  altKey: true },                       false],
    [{ metaKey: true,  altKey: true },                       false],
    [{ shiftKey: true, altKey: true },                       false],
    [{ ctrlKey: true,  shiftKey: true, altKey: true },       false],
    [{ metaKey: true,  shiftKey: true, altKey: true },       false],
    [{ ctrlKey: true,  metaKey: true },                      true ],
  ];
  test('every combo × Enter → expected boolean', () => {
    for (const [mods, want] of TRUTHS) {
      assert.equal(isSubmitKey(keyEvt('Enter', mods)), want,
        `expected ${want} for mods=${JSON.stringify(mods)}`);
    }
  });
});

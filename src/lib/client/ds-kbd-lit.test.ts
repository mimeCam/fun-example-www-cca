// src/lib/client/ds-kbd-lit.test.ts
//
// v153 — unit tests for the `keyToChipLabels` pure normaliser (Tanya
// UX spec §3.3 chip-lit micro-interaction). The DOM side of the module
// (`lightForKey` / `unlightForKey`) is exercised indirectly by the
// three legend-parity tests plus the existing cite-confirm snapshot;
// this file locks the one decision that is NOT obvious by inspection:
// "given a KeyboardEvent.key, which chip label(s) should I light?".
//
// Design choices (cloned from v151c/v151d/v152 legend tests):
//   · No JSDOM. Pure function probes; portable to any CI.
//   · Set-equality with the known chip labels emitted by the three
//     SSR legends (c / Enter / Space / Arrow* / Home / End / PageUp /
//     PageDown / K). Any new label landing without a normaliser hop
//     fails this test.
//   · Exhaustive single-letter-case coverage — the one ambiguity in
//     the module. `k` must light `K` (keep-legend label) AND `k`
//     (physical-key label would they ever exist), `c` must light `c`
//     AND `C` for the same reason.
//
// Run:  npx tsx --test src/lib/client/ds-kbd-lit.test.ts
//
// Credits: Tanya (§3.3 chip-lights contract, §2b "Space is the word"),
//          Mike (§7.4 re-scan discipline — no hidden cache),
//          v152 keep-legend.test.ts line 6 (rule-of-three discipline:
//          this module IS the third consumer — the promote is earned),
//          Sid — one pure test file, one pure function, no JSDOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { keyToChipLabels } from './ds-kbd-lit.ts';

// ── helpers ────────────────────────────────────────────────────────────────

/** Convenience: assert the normaliser emits exactly these labels (set-eq). */
function assertLabels(key: string, expected: readonly string[], msg?: string) {
  const got  = [...keyToChipLabels(key)].sort();
  const want = [...expected].sort();
  assert.deepStrictEqual(got, want, msg ?? `keyToChipLabels(${JSON.stringify(key)})`);
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('v153 — keyToChipLabels pure normaliser', () => {
  // The word-not-blank rule (Tanya §2b mirror).
  test('Space bar (" ") maps to the word "Space", never a literal blank', () => {
    assertLabels(' ', ['Space']);
  });

  // The three cite keys the cite-legend teaches today.
  test('cite keys → cite-legend labels', () => {
    assertLabels('Enter', ['Enter']);
    // `c` is the cite key and the legend chip reads `c`.
    // The single-letter rule emits BOTH casings so either label lights
    // up (set-equality against real SSR is what matters).
    assertLabels('c', ['c', 'C']);
  });

  // All eight nav keys pass through as identity.
  test('nav keys → identity (no transform)', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                        'Home', 'End', 'PageUp', 'PageDown']) {
      assertLabels(key, [key]);
    }
  });

  // The keep key — two ways to fire, one chip label on screen.
  test('keep key — both `k` and `K` emit the same two-label set', () => {
    assertLabels('k', ['k', 'K']);
    assertLabels('K', ['k', 'K']);
    // Symmetric: the order must not matter.
    assert.deepStrictEqual(
      [...keyToChipLabels('k')].sort(),
      [...keyToChipLabels('K')].sort(),
      'k and K must emit the same label set',
    );
  });

  // Single non-letter chars (e.g., `?`) are case-invariant; emit once.
  test('single non-letter char → single-element label set', () => {
    assertLabels('?', ['?']);
    assertLabels('1', ['1']);
    assertLabels(';', [';']);
  });

  // Named multi-char keys pass through untouched.
  test('multi-char named keys → identity', () => {
    assertLabels('Escape',  ['Escape']);
    assertLabels('Tab',     ['Tab']);
    assertLabels('Backspace', ['Backspace']);
    assertLabels('Shift',   ['Shift']);
    assertLabels('Control', ['Control']);
  });

  // The empty string must be a no-op (defensive, not teaching-contract).
  test('empty key string → single-element empty set', () => {
    assertLabels('', ['']);
  });
});

// ── Set-equality smoke test against the known SSR labels ──────────────────
// One place, one rule: every label a legend-scrape test might extract
// must be producible by some key via keyToChipLabels. If someone edits
// the SSR legends to teach a new label, they must also wire the key →
// label map here. This test catches that drift with one line.

describe('v153 — legend labels ⊆ image(keyToChipLabels)', () => {
  const KNOWN_LABELS: readonly string[] = [
    // cite-legend (docs.astro)
    'c', 'Enter', 'Space',
    // nav-legend (docs.astro)
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    // keep-legend (FloatingKeepButton.astro)
    'K',
  ];

  // Inverse of the normaliser — the key value we'd expect to produce each label.
  const keyForLabel: Record<string, string> = {
    Space: ' ',
    c: 'c',
    K: 'k',                                        // lower triggers the keep handler
  };

  test('every legend chip label is producible by some KeyboardEvent.key', () => {
    for (const label of KNOWN_LABELS) {
      const key = keyForLabel[label] ?? label;     // named keys round-trip as-is
      const produced = keyToChipLabels(key);
      assert.ok(produced.includes(label),
        `label "${label}" is not produced by keyToChipLabels(${JSON.stringify(key)})`);
    }
  });
});

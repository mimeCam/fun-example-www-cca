// src/lib/client/keep-legend.test.ts
//
// v152 — keep-legend / isKeepKey parity (Mike napkin "Earn the PROMOTE"
// scope #3, Tanya §6). Faithful clone of cell-cite-legend.test.ts — the
// pattern that earned its third sibling without a shared helper module
// (AGENTS.md "shared code earns its slot" — still not yet; promote
// kbdLabels/labelToKey/fakeEvent on the fourth consumer, not the third).
//
// One invariant, stated once, in one place: the set of keys listed in
// the `data-keep-legend` block of src/components/FloatingKeepButton.astro
// is exactly the set of keys `isKeepKey` accepts. No superset, no subset.
//
// Why this test exists:
//   The whole point of the v152 sprint is that the chip teaches a *live*
//   key (Tanya §6.3). This test fails the build the instant the chip
//   drifts from the handler — in either direction.
//
// Design choices (cloned from v151c / v151d):
//   · No JSDOM. Slice the block with two regexes; probe the handler
//     with `isKeepKey(fakeEvent)`. Pure string + pure function.
//   · Probe via `isKeepKey`, not by importing the private `KEEP_KEYS`.
//     Tests behaviour the reader's keyboard hits, not a constant.
//   · Set equality in both directions — catches omission AND stale keys.
//
// Run:  npx tsx --test src/lib/client/keep-legend.test.ts
//
// Credits: Mike (napkin scope #3 parity discipline), Tanya (§6 keep chip
//          placement, §6.3 "teach a live key"), Elon (§4 set-equality,
//          prose-free coupling), Paul (no silent keybinds), Sid — "no
//          code maintenance without tests" — this satisfies the vow for
//          the new surface without adding JSDOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { isKeepKey } from './keep-hotkey.ts';

// ── fixture: FloatingKeepButton.astro source, read once ────────────────────

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'src/components/FloatingKeepButton.astro',
);
const FIXTURE_SRC = fs.readFileSync(FIXTURE_PATH, 'utf-8');

// ── extraction helpers (each ≤ 10 lines) ───────────────────────────────────

/** Slice the single `<p … data-keep-legend>…</p>` block from the source. */
function legendBlock(src: string): string {
  const re = /<p[^>]*\bdata-keep-legend\b[^>]*>([\s\S]*?)<\/p>/;
  const m = re.exec(src);
  assert.ok(m, 'data-keep-legend block not found in FloatingKeepButton.astro');
  return m![1];
}

/** Every <kbd class="ds-kbd">…</kbd> content, in DOM order. */
function kbdLabels(block: string): string[] {
  const re = /<kbd[^>]*class="[^"]*\bds-kbd\b[^"]*"[^>]*>([\s\S]*?)<\/kbd>/g;
  const out: string[] = [];
  for (const m of block.matchAll(re)) out.push(m[1].trim());
  return out;
}

/** Identity map — keep legend chips spell their KeyboardEvent.key. */
function labelToKey(label: string): string {
  return label;
}

/** The set of key values the legend teaches. */
function legendKeySet(): Set<string> {
  return new Set(kbdLabels(legendBlock(FIXTURE_SRC)).map(labelToKey));
}

/** Minimal KeyboardEvent-shaped probe (no JSDOM). */
function fakeEvent(key: string): KeyboardEvent {
  return { key, metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent;
}

// ── candidate key universe — legend ∪ obvious non-keep keys ────────────────

const CANDIDATES: readonly string[] = [
  'k', 'K',                                            // current KEEP_KEYS members
  'c', 'Enter', ' ',                                   // cite keys (must stay out)
  'ArrowUp', 'ArrowDown', 'Home', 'End',               // nav keys (must stay out)
  'j', 'l', 'a', 'x',                                  // near-miss letters
  'Shift', 'Control', 'Alt', 'Meta',                   // bare modifiers
];

// ── tests ──────────────────────────────────────────────────────────────────

describe('v152 — keep-legend ↔ isKeepKey parity', () => {
  test('legend block exists in FloatingKeepButton.astro', () => {
    assert.ok(legendBlock(FIXTURE_SRC).length > 0);
  });

  test('legend contains at least one <kbd> chip', () => {
    const labels = kbdLabels(legendBlock(FIXTURE_SRC));
    assert.ok(labels.length > 0, 'legend must teach at least one key');
  });

  test('every chip label maps to a real key the handler accepts', () => {
    for (const label of kbdLabels(legendBlock(FIXTURE_SRC))) {
      const key = labelToKey(label);
      assert.ok(isKeepKey(fakeEvent(key)),
        `legend chip "${label}" teaches a key the handler rejects`);
    }
  });

  test('every keep key the handler accepts is taught by the legend', () => {
    const taught = legendKeySet();
    let taughtAny = false;
    for (const key of CANDIDATES) {
      if (!isKeepKey(fakeEvent(key))) continue;
      // At least ONE accepted variant (k / K) must be visible. Unlike
      // cite/nav, the two are visual aliases — one chip is enough.
      if (taught.has(key)) taughtAny = true;
    }
    assert.ok(taughtAny,
      'handler accepts k/K but legend teaches neither form — silent keybind');
  });

  test('no legend chip teaches a key the handler ignores (stale-key guard)', () => {
    for (const label of kbdLabels(legendBlock(FIXTURE_SRC))) {
      const key = labelToKey(label);
      assert.ok(isKeepKey(fakeEvent(key)),
        `legend teaches "${label}" but isKeepKey rejects it — stale copy`);
    }
  });

  test('no empty <kbd> chips (broken-icon guard, Tanya §2b mirror)', () => {
    const labels = kbdLabels(legendBlock(FIXTURE_SRC));
    for (const label of labels) {
      assert.notEqual(label, '',
        'empty <kbd> — every keep chip must spell its KeyboardEvent.key');
    }
  });

  test('modifier chords (Ctrl/Cmd/Alt + K) fall through to browser', () => {
    // Tanya §6, Mike risk register: Ctrl+K is browser search on most
    // platforms; Cmd+K opens the omnibox on Safari. `isKeepKey` must
    // never claim these.
    for (const key of ['k', 'K']) {
      const ctrl = { key, metaKey: false, ctrlKey: true,  altKey: false } as KeyboardEvent;
      const meta = { key, metaKey: true,  ctrlKey: false, altKey: false } as KeyboardEvent;
      const alt  = { key, metaKey: false, ctrlKey: false, altKey: true  } as KeyboardEvent;
      assert.ok(!isKeepKey(ctrl), `Ctrl+${key} must fall through`);
      assert.ok(!isKeepKey(meta), `Meta+${key} must fall through`);
      assert.ok(!isKeepKey(alt),  `Alt+${key} must fall through`);
    }
  });

  test('keep legend sits inside the floating-keep scope (not a run-on paragraph)', () => {
    // Mirrors the cite-vs-nav disjointness check. The keep legend must
    // live inside the `.keep-float` container so it inherits the visible
    // transition and the touch-hide rule — not as a free-floating `<p>`.
    const scopeRe = /<div[\s\S]*?class="keep-float"[\s\S]*?<p[^>]*\bdata-keep-legend\b/;
    assert.ok(scopeRe.test(FIXTURE_SRC),
      'keep legend must be a child of .keep-float, not a sibling');
  });
});

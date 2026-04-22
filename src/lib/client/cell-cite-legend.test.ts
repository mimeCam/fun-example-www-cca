// src/lib/client/cell-cite-legend.test.ts
//
// v151c — legend/keys parity (Mike napkin §7, Tanya §9c, Elon §4).
//
// One invariant, stated once, in one place: the set of keys listed in
// the `data-cite-legend` block of src/pages/api/docs.astro is exactly
// the set of keys `isCiteKey` accepts. No superset, no subset.
//
// Why this test exists:
//   Before v151c the legend taught `c` but the handler accepted
//   `c` / Enter / Space (33 % → 100 % teaching gap). This test fails
//   the build whenever legend and handler drift again — in either
//   direction.
//
// Design choices (Mike §4, §7):
//   · No JSDOM. The legend is scraped with two regexes; the handler is
//     probed with `isCiteKey(fakeEvent)`. Both are pure string / pure
//     function work — portable to any CI.
//   · Probe via `isCiteKey`, not by importing the private `CITE_KEYS`.
//     Keeps `cell-cite.ts` byte-unchanged and tests the *behaviour* a
//     reader's keyboard actually hits.
//   · Set equality in both directions — catches omission *and* stale keys.
//   · Copy-edit free: the test couples to `<kbd>` contents only; the
//     surrounding prose can be re-edited without breaking the test.
//
// Run:  npx tsx --test src/lib/client/cell-cite-legend.test.ts
//
// Credits: Mike (§napkin §6, §7 probe-via-isCiteKey, §11 exit criteria),
//          Tanya (§9c DOM-side parity test, §2b "Space" word-in-chip),
//          Elon (§4 set-equality, §4.2 prose-free coupling), Paul
//          (§priority — the ONE feature this cycle), Sid ("no code
//          maintenance without tests" — this satisfies the vow without
//          adding JSDOM).
//
// ── imports ────────────────────────────────────────────────────────────────

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { isCiteKey } from './cell-cite.ts';

// ── fixture: docs.astro source, read once ──────────────────────────────────

const DOCS_PATH = path.resolve(process.cwd(), 'src/pages/api/docs.astro');
const DOCS_SRC  = fs.readFileSync(DOCS_PATH, 'utf-8');

// ── extraction helpers (each ≤ 10 lines) ───────────────────────────────────

/** Slice the single `<p … data-cite-legend>…</p>` block from the source. */
function legendBlock(src: string): string {
  const re = /<p[^>]*\bdata-cite-legend\b[^>]*>([\s\S]*?)<\/p>/;
  const m = re.exec(src);
  assert.ok(m, 'data-cite-legend block not found in docs.astro');
  return m![1];
}

/** Every <kbd class="api-docs__kbd">…</kbd> content, in DOM order. */
function kbdLabels(block: string): string[] {
  const re = /<kbd[^>]*class="[^"]*\bapi-docs__kbd\b[^"]*"[^>]*>([\s\S]*?)<\/kbd>/g;
  const out: string[] = [];
  for (const m of block.matchAll(re)) out.push(m[1].trim());
  return out;
}

/** Map legend labels ("Space") back to real key values (" "). */
function labelToKey(label: string): string {
  return label === 'Space' ? ' ' : label;
}

/** The set of key values the legend teaches. */
function legendKeySet(): Set<string> {
  return new Set(kbdLabels(legendBlock(DOCS_SRC)).map(labelToKey));
}

/** Minimal KeyboardEvent-shaped probe (no JSDOM). */
function fakeEvent(key: string): KeyboardEvent {
  return { key, metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent;
}

// ── candidate key universe — legend ∪ obvious non-cite keys ────────────────

const CANDIDATES: readonly string[] = [
  'c', 'Enter', ' ',                       // current CITE_KEYS members
  'a', 'x', 'C', 'Tab', 'Escape',          // near-miss letters + chords
  'ArrowDown', 'ArrowUp', 'Home', 'End',   // matrix-keynav keys (Mike §5.9)
  'Shift', 'Control', 'Alt', 'Meta',       // bare modifiers
];

// ── tests ──────────────────────────────────────────────────────────────────

describe('v151c — cite-legend ↔ isCiteKey parity', () => {
  test('legend block exists in docs.astro', () => {
    assert.ok(legendBlock(DOCS_SRC).length > 0);
  });

  test('legend contains at least one <kbd> chip', () => {
    const labels = kbdLabels(legendBlock(DOCS_SRC));
    assert.ok(labels.length > 0, 'legend must teach at least one key');
  });

  test('every chip label maps to a real key the handler accepts', () => {
    for (const label of kbdLabels(legendBlock(DOCS_SRC))) {
      const key = labelToKey(label);
      assert.ok(isCiteKey(fakeEvent(key)),
        `legend chip "${label}" teaches a key the handler rejects`);
    }
  });

  test('every cite key the handler accepts is taught by the legend', () => {
    const taught = legendKeySet();
    for (const key of CANDIDATES) {
      if (!isCiteKey(fakeEvent(key))) continue;
      assert.ok(taught.has(key),
        `handler accepts "${key}" but legend does not teach it`);
    }
  });

  test('no legend chip teaches a key the handler ignores (stale-key guard)', () => {
    for (const label of kbdLabels(legendBlock(DOCS_SRC))) {
      const key = labelToKey(label);
      assert.ok(isCiteKey(fakeEvent(key)),
        `legend teaches "${label}" but isCiteKey rejects it — stale copy`);
    }
  });

  test('"Space" is the word, never a literal blank inside <kbd>', () => {
    // Tanya §2b — an empty chip reads as a broken icon.
    const labels = kbdLabels(legendBlock(DOCS_SRC));
    for (const label of labels) {
      assert.notEqual(label, '',
        'empty <kbd> — use the word "Space", not a literal space');
    }
  });

  test('modifier chords (Ctrl/Cmd/Alt + key) are never cites', () => {
    // Tanya §10 — native Cmd/Ctrl+C must fall through to the browser.
    for (const key of ['c', 'Enter', ' ']) {
      const ctrl = { key, metaKey: false, ctrlKey: true,  altKey: false } as KeyboardEvent;
      const meta = { key, metaKey: true,  ctrlKey: false, altKey: false } as KeyboardEvent;
      const alt  = { key, metaKey: false, ctrlKey: false, altKey: true  } as KeyboardEvent;
      assert.ok(!isCiteKey(ctrl), `Ctrl+${key} must fall through`);
      assert.ok(!isCiteKey(meta), `Meta+${key} must fall through`);
      assert.ok(!isCiteKey(alt),  `Alt+${key} must fall through`);
    }
  });
});

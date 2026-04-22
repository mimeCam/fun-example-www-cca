// src/lib/client/nav-legend.test.ts
//
// v151d — nav-legend / isNavKey parity (Mike napkin §4, Tanya §6,
// Elon §4). Faithful clone of cell-cite-legend.test.ts.
//
// One invariant, stated once, in one place: the set of keys listed in
// the `data-nav-legend` block of src/pages/api/docs.astro is exactly
// the set of keys `isNavKey` accepts. No superset, no subset.
//
// Why this test exists:
//   matrix-keynav.ts has accepted the eight nav keys since v151. The
//   legend above the matrix taught zero of them. v151d adds the legend
//   AND this test so the next time the handler grows (or the legend
//   loses a chip), the build fails instead of silently de-teaching.
//
// Design choices (Mike §4, §6):
//   · No JSDOM. Slice the block with two regexes; probe the handler
//     with `isNavKey(fakeEvent)`. Pure string + pure fn — portable to
//     any CI.
//   · Probe via `isNavKey`, not by importing the private `NAV_KEYS`.
//     Tests behaviour the reader's keyboard hits, not a constant.
//   · Set equality in both directions — catches omission AND stale keys.
//   · Modifier chords (Ctrl/Cmd/Alt + any nav key) must fall through
//     to the browser so native word-jumps and history back/forward
//     keep working (Tanya §4 hidden contract; Mike §6.4).
//   · Rule of three — the two `*-legend.test.ts` files now share
//     ~40 LOC of scrape helpers. They do NOT extract to a shared
//     module yet (AGENTS.md "shared code earns its slot"). v152+.
//
// Run:  npx tsx --test src/lib/client/nav-legend.test.ts
//
// Credits: Mike (napkin §4 predicate+test shape, §6 parity discipline),
//          Tanya (§6 sibling contract, §4.1 chip inventory, §5.2 chips
//          are inert), Elon (§4 set-equality, prose-free coupling),
//          Paul (keyboard-loop P0), Sid — "no code maintenance without
//          tests". Clone of v151c cell-cite-legend.test.ts by faithful
//          substitution.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { isNavKey } from './matrix-keynav.ts';

// ── fixture: docs.astro source, read once ──────────────────────────────────

const DOCS_PATH = path.resolve(process.cwd(), 'src/pages/api/docs.astro');
const DOCS_SRC  = fs.readFileSync(DOCS_PATH, 'utf-8');

// ── extraction helpers (each ≤ 10 lines) ───────────────────────────────────

/** Slice the single `<p class="api-docs__legend" … data-nav-legend>…</p>`
 *  block from the source. Requiring the class attribute prevents the
 *  regex from mistakenly latching onto prose inside an Astro `{/* … *\/}`
 *  comment that might reference `<p data-nav-legend>` as documentation. */
function legendBlock(src: string): string {
  const re = /<p\s[^>]*\bclass="[^"]*\bapi-docs__legend\b[^"]*"[^>]*\bdata-nav-legend\b[^>]*>([\s\S]*?)<\/p>/;
  const m = re.exec(src);
  assert.ok(m, 'data-nav-legend block not found in docs.astro');
  return m![1];
}

/** Every <kbd class="ds-kbd">…</kbd> content, in DOM order.
 *  v152 — the chip class promoted to the design-system name on the
 *  second real consumer (FloatingKeepButton). The regex follows the
 *  rename; `check:ds-kbd` guards against stragglers. */
function kbdLabels(block: string): string[] {
  const re = /<kbd[^>]*class="[^"]*\bds-kbd\b[^"]*"[^>]*>([\s\S]*?)<\/kbd>/g;
  const out: string[] = [];
  for (const m of block.matchAll(re)) out.push(m[1].trim());
  return out;
}

/** Map legend labels back to real key values (identity for nav keys). */
function labelToKey(label: string): string {
  return label;
}

/** The set of key values the legend teaches. */
function legendKeySet(): Set<string> {
  return new Set(kbdLabels(legendBlock(DOCS_SRC)).map(labelToKey));
}

/** Minimal KeyboardEvent-shaped probe (no JSDOM). */
function fakeEvent(key: string): KeyboardEvent {
  return { key, metaKey: false, ctrlKey: false, altKey: false } as KeyboardEvent;
}

// ── candidate key universe — legend ∪ obvious non-nav keys ─────────────────

const CANDIDATES: readonly string[] = [
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',   // current NAV_KEYS members
  'Home', 'End', 'PageUp', 'PageDown',                 // current NAV_KEYS members
  'c', 'Enter', ' ', 'a', 'x',                         // cite + near-miss letters
  'Tab', 'Escape', 'Backspace',                        // other navigation-ish keys
  'Shift', 'Control', 'Alt', 'Meta',                   // bare modifiers
];

// ── tests ──────────────────────────────────────────────────────────────────

describe('v151d — nav-legend ↔ isNavKey parity', () => {
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
      assert.ok(isNavKey(fakeEvent(key)),
        `legend chip "${label}" teaches a key the handler rejects`);
    }
  });

  test('every nav key the handler accepts is taught by the legend', () => {
    const taught = legendKeySet();
    for (const key of CANDIDATES) {
      if (!isNavKey(fakeEvent(key))) continue;
      assert.ok(taught.has(key),
        `handler accepts "${key}" but legend does not teach it`);
    }
  });

  test('no legend chip teaches a key the handler ignores (stale-key guard)', () => {
    for (const label of kbdLabels(legendBlock(DOCS_SRC))) {
      const key = labelToKey(label);
      assert.ok(isNavKey(fakeEvent(key)),
        `legend teaches "${label}" but isNavKey rejects it — stale copy`);
    }
  });

  test('no empty <kbd> chips (broken-icon guard, Tanya §2b mirror)', () => {
    const labels = kbdLabels(legendBlock(DOCS_SRC));
    for (const label of labels) {
      assert.notEqual(label, '',
        'empty <kbd> — every nav chip must spell its KeyboardEvent.key');
    }
  });

  test('modifier chords (Ctrl/Cmd/Alt + nav key) fall through to browser', () => {
    // Mike §6.4, Tanya §4 — Cmd+ArrowLeft is "back", Ctrl+ArrowLeft is
    // word-jump on many platforms. `isNavKey` must never claim these.
    const NAV = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                 'Home','End','PageUp','PageDown'];
    for (const key of NAV) {
      const ctrl = { key, metaKey: false, ctrlKey: true,  altKey: false } as KeyboardEvent;
      const meta = { key, metaKey: true,  ctrlKey: false, altKey: false } as KeyboardEvent;
      const alt  = { key, metaKey: false, ctrlKey: false, altKey: true  } as KeyboardEvent;
      assert.ok(!isNavKey(ctrl), `Ctrl+${key} must fall through`);
      assert.ok(!isNavKey(meta), `Meta+${key} must fall through`);
      assert.ok(!isNavKey(alt),  `Alt+${key} must fall through`);
    }
  });

  test('the two legends live in separate <p> blocks (no run-on merge)', () => {
    // Tanya §3.1: "Do not merge into a single run-on `<p>`." Two owners,
    // two sentences, one visual register.
    const citeRe = /<p[^>]*\bdata-cite-legend\b/;
    const navRe  = /<p[^>]*\bdata-nav-legend\b/;
    assert.ok(citeRe.test(DOCS_SRC), 'cite legend <p> must remain present');
    assert.ok(navRe.test(DOCS_SRC),  'nav  legend <p> must remain present');
  });

  test('cite legend and nav legend are disjoint (no chip shared)', () => {
    // Mike §6.9 / cell-cite.ts inline comment: CITE_KEYS and NAV_KEYS
    // are deliberately disjoint so the two listeners never race. If
    // a chip appears in both blocks, someone is about to collide them.
    const citeBlockRe = /<p\s[^>]*\bclass="[^"]*\bapi-docs__legend\b[^"]*"[^>]*\bdata-cite-legend\b[^>]*>([\s\S]*?)<\/p>/;
    const citeBlock = citeBlockRe.exec(DOCS_SRC)?.[1] ?? '';
    const citeSet = new Set(kbdLabels(citeBlock));
    const navSet  = legendKeySet();
    for (const chip of citeSet) {
      assert.ok(!navSet.has(chip),
        `chip "${chip}" appears in BOTH legends — modules will race`);
    }
  });
});

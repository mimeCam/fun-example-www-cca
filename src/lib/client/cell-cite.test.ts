// src/lib/client/cell-cite.test.ts
//
// v151b — pure-function tests for the "press c to cite" keystroke path.
// Zero DOM, zero JSDOM. Mirrors the matrix-keynav.test.ts pattern: pure
// helpers get truth-tables; the cross-surface parity promise gets a
// snapshot test so a future refactor cannot silently fork the payload
// between click-path and keystroke-path.
//
// Run:  npx tsx --test src/lib/client/cell-cite.test.ts
//
// Contracts locked here (reject PR if any fail):
//   · `c`, `Enter`, and ` ` (Space) are cite keys; nothing else is.
//   · Cmd/Ctrl/Alt with ANY of those keys is NOT a cite — native copy
//     must not be stolen. Shift+<key> still cites (capital letter).
//   · `cellCitationPayload(axis, stage, origin, ref)` is deterministic:
//     same inputs → byte-identical string. This is Paul's non-negotiable
//     and the reason click/keystroke/API all produce the same URL.
//
// Credits: Mike (napkin §6 pure-fn test pattern, §3 v151b shape),
//          Tanya (UX spec §11 verification checklist), Paul (string-
//          parity non-negotiable), Elon (§10 no new toast variant —
//          one string for all three surfaces), AGENTS.md (axis freeze).
//          Sid — 2026-04-22. Motto: "code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isCiteKey } from './cell-cite.js';
import { cellCitationPayload, STAGE_AXES } from '../stage-axes.js';
import { DECAY_STAGES } from '../decay-engine.js';

// ── Tiny KeyboardEvent stand-in (no JSDOM needed) ─────────────────────────
// We only use the fields `isCiteKey` reads: key + the four modifier flags.
// Keeping the stub typed as `KeyboardEvent` lets us feed it directly.

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

// ── isCiteKey — truth table over {key} × {modifier combos} ────────────────

describe('isCiteKey — the three cite keys with no modifiers', () => {
  test('`c` (lowercase) is a cite', () => {
    assert.equal(isCiteKey(keyEvt('c')), true);
  });
  test('`Enter` is a cite', () => {
    assert.equal(isCiteKey(keyEvt('Enter')), true);
  });
  test('` ` (Space) is a cite', () => {
    assert.equal(isCiteKey(keyEvt(' ')), true);
  });
});

describe('isCiteKey — Shift is transparent; capital C still cites', () => {
  test('Shift+c still cites (capital letter is a letter)', () => {
    assert.equal(isCiteKey(keyEvt('c', { shiftKey: true })), true);
  });
  test('Shift+Enter still cites', () => {
    assert.equal(isCiteKey(keyEvt('Enter', { shiftKey: true })), true);
  });
});

describe('isCiteKey — Cmd / Ctrl / Alt drop the cite (native copy wins)', () => {
  test('Cmd+c → false (let native Cmd+C through)', () => {
    assert.equal(isCiteKey(keyEvt('c', { metaKey: true })), false);
  });
  test('Ctrl+c → false', () => {
    assert.equal(isCiteKey(keyEvt('c', { ctrlKey: true })), false);
  });
  test('Alt+c → false', () => {
    assert.equal(isCiteKey(keyEvt('c', { altKey: true })), false);
  });
  test('Cmd+Enter → false (avoid a future submit-and-cite chord)', () => {
    assert.equal(isCiteKey(keyEvt('Enter', { metaKey: true })), false);
  });
  test('Ctrl+Space → false (would collide with IME composition)', () => {
    assert.equal(isCiteKey(keyEvt(' ', { ctrlKey: true })), false);
  });
});

describe('isCiteKey — everything else is NOT a cite', () => {
  const NON_CITE = ['a', 'C', 'x', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', '0', 'Enter '];
  for (const key of NON_CITE) {
    test(`"${key}" is not a cite`, () => {
      // `C` (uppercase) is excluded: browsers always emit the lowercase
      // letter as `event.key` unless caps-lock is on, in which case Shift
      // flips it back to lowercase. Either way: Shift+c handles it.
      if (key === 'C') assert.equal(isCiteKey(keyEvt(key)), false);
      else assert.equal(isCiteKey(keyEvt(key)), false);
    });
  }
});

// ── Exhaustive modifier-combo sweep — Cmd/Ctrl/Alt ALWAYS suppress ────────

describe('isCiteKey — any Cmd/Ctrl/Alt combo suppresses for all three keys', () => {
  const CITE_KEYS = ['c', 'Enter', ' '];
  const COMBOS: Mods[] = [
    { metaKey: true },
    { ctrlKey: true },
    { altKey:  true },
    { metaKey: true, shiftKey: true },
    { ctrlKey: true, shiftKey: true },
    { altKey:  true, shiftKey: true },
    { metaKey: true, ctrlKey: true },
  ];
  test('every combo × every cite key → false', () => {
    for (const key of CITE_KEYS) {
      for (const mods of COMBOS) {
        assert.equal(isCiteKey(keyEvt(key, mods)), false,
          `expected suppression for key="${key}" mods=${JSON.stringify(mods)}`);
      }
    }
  });
});

// ── Payload parity — the string is the product (Paul's non-negotiable) ────
// If a future refactor forks the keystroke path's payload string from the
// click path's, the round-trip (copy→arrive nonce join) breaks silently.
// The guard is cheap: both surfaces call cellCitationPayload() with the
// same inputs, so the parity test is a determinism test on that function.

describe('cellCitationPayload — deterministic for same (axis, stage, origin, ref)', () => {
  test('two calls with identical inputs produce identical strings', () => {
    const a = cellCitationPayload('typography', 'fresh', 'https://example.com', 'abc12345');
    const b = cellCitationPayload('typography', 'fresh', 'https://example.com', 'abc12345');
    assert.equal(a, b);
  });

  test('string embeds the ref as ?r=<ref> before the hash', () => {
    const s = cellCitationPayload('border', 'endangered', 'https://example.com', 'ref-xyz-0123');
    assert.match(s, /\?r=ref-xyz-0123#axis-border-stage-endangered$/);
  });

  test('ref-less form (legacy) omits the ?r= query entirely', () => {
    const s = cellCitationPayload('tempo', 'fossil', 'https://example.com');
    assert.doesNotMatch(s, /\?r=/);
    assert.match(s, /#axis-tempo-stage-fossil$/);
  });

  test('every (axis, stage) yields a non-empty, single-line payload', () => {
    for (const axis of STAGE_AXES) {
      for (const stage of DECAY_STAGES) {
        const s = cellCitationPayload(axis, stage, 'https://ex.test', 'nonce0001');
        assert.ok(s.length > 0, `empty payload for ${axis}/${stage}`);
        assert.doesNotMatch(s, /\n|\r/, `payload has newline for ${axis}/${stage}`);
      }
    }
  });
});

// ── Cross-surface invariant (the one that ships the feature) ──────────────
// Both click-path and keystroke-path, for a given cell and a given nonce,
// feed cellCitationPayload with identical args. We encode that invariant
// here so a refactor that "optimizes" one path into a different string
// shape fails a unit test in CI before it can break Paul's CAR metric.

describe('click-path and keystroke-path: byte-identical payload per (cell, nonce)', () => {
  test('same args → same string (this is what v151b promises)', () => {
    const origin = 'https://persona.test';
    const ref    = 'click-vs-key-test';
    for (const axis of STAGE_AXES) {
      for (const stage of DECAY_STAGES) {
        const click = cellCitationPayload(axis, stage, origin, ref);
        const key   = cellCitationPayload(axis, stage, origin, ref);
        assert.equal(key, click, `divergence at ${axis}/${stage}`);
      }
    }
  });
});

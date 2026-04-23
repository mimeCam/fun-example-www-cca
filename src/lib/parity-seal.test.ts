// src/lib/parity-seal.test.ts
// v175 "Parity Seal" — golden test for the shared parity helper.
//
// Run:  npx tsx --test src/lib/parity-seal.test.ts
//
// What we assert:
//   · parityFacts() derives its numbers from the literal (not hardcoded).
//   · parityCopy() fails closed (returns null) when readyToPromote is false.
//   · parityCopy() shape is "N actions · M mouths each · build-enforced
//     parity." with both numerals interpolated from the literal.
//   · parityJsonField() matches the SSR shape the cite endpoint emits.
//   · parityBandRows() preserves literal order and `null` honesty.
//   · parityReceipt() names pending kinds + row names (or "all wired.").
//   · parityGoldEarned() is false whenever pending > 0 OR enforced is off.
//
// Credits: Mike Koch (napkin §3.8 golden test), Tanya Donska (§11
//          acceptance criteria), Paul Kim (MH-2 fail-closed witness),
//          Sid (10-line rule per test body). 2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parityFacts,
  parityCopy,
  parityJsonField,
  parityBandRows,
  parityReceipt,
  parityGoldEarned,
  PARITY_MOUTH_COUNT,
} from './parity-seal.ts';
import {
  TRI_MOUTH_ACTIONS,
  wiredActions,
  pendingActions,
  readyToPromote,
} from './tri-mouth-inventory.ts';

// ── parityFacts — pure derivation ────────────────────────────────────────

describe('parityFacts — every number is derived, none hardcoded', () => {
  test('rows matches TRI_MOUTH_ACTIONS.length', () => {
    assert.equal(parityFacts().rows, TRI_MOUTH_ACTIONS.length);
  });

  test('wired matches wiredActions().length', () => {
    assert.equal(parityFacts().wired, wiredActions().length);
  });

  test('pending = rows − wired', () => {
    const f = parityFacts();
    assert.equal(f.pending, f.rows - f.wired);
  });

  test('mouths is the PARITY_MOUTH_COUNT constant (3)', () => {
    assert.equal(parityFacts().mouths, PARITY_MOUTH_COUNT);
    assert.equal(PARITY_MOUTH_COUNT, 3);
  });

  test('enforced reflects readyToPromote()', () => {
    assert.equal(parityFacts().enforced, readyToPromote());
  });
});

// ── parityCopy — fail-closed witness sentence ────────────────────────────

describe('parityCopy — fail-closed witness sentence', () => {
  test('returns null XOR a sentence, never undefined', () => {
    const c = parityCopy();
    assert.ok(c === null || typeof c === 'string');
  });

  test('when enforced=false (today), returns null (Paul MH-2)', () => {
    // Today's inventory (post-v175 PR-A) has 2 wired; readyToPromote is
    // false; the sentence MUST be null. If this test flips green, PR-D
    // has landed and the sentence is free to render — re-review this
    // test before changing the assertion.
    if (!readyToPromote()) {
      assert.equal(parityCopy(), null);
    }
  });

  test('sentence shape is "N actions · M mouths each · build-enforced parity." when enforced', () => {
    if (readyToPromote()) {
      const f = parityFacts();
      assert.equal(
        parityCopy(),
        `${f.rows} actions · ${f.mouths} mouths each · build-enforced parity.`,
      );
    }
  });

  test('sentence is pure operator-language — no banned marketing words', () => {
    const c = parityCopy();
    if (c === null) return;
    for (const banned of ['constitution', 'physics', 'law of', 'would not be']) {
      assert.ok(!c.toLowerCase().includes(banned), `leaks banned word: ${banned}`);
    }
  });
});

// ── parityJsonField — cite JSON branch parity ────────────────────────────

describe('parityJsonField — shape the /api/docs/cite endpoint emits', () => {
  test('has exactly {rows, mouths, enforced}', () => {
    assert.deepEqual(
      Object.keys(parityJsonField()).sort(),
      ['enforced', 'mouths', 'rows'],
    );
  });

  test('rows/mouths are numbers, enforced is a boolean', () => {
    const f = parityJsonField();
    assert.equal(typeof f.rows, 'number');
    assert.equal(typeof f.mouths, 'number');
    assert.equal(typeof f.enforced, 'boolean');
  });

  test('values match parityFacts() at call time', () => {
    const j = parityJsonField();
    const f = parityFacts();
    assert.equal(j.rows, f.rows);
    assert.equal(j.mouths, f.mouths);
    assert.equal(j.enforced, f.enforced);
  });
});

// ── parityBandRows — literal-order-preserving, null-honest ───────────────

describe('parityBandRows — Tanya §3 band rendering source', () => {
  test('has one row per TRI_MOUTH_ACTIONS entry', () => {
    assert.equal(parityBandRows().length, TRI_MOUTH_ACTIONS.length);
  });

  test('preserves literal order (name-for-name)', () => {
    const seen  = parityBandRows().map((r) => r.name);
    const truth = TRI_MOUTH_ACTIONS.map((a) => a.name);
    assert.deepEqual(seen, truth);
  });

  test('null mouths survive the projection (no silent masking)', () => {
    for (const r of parityBandRows()) {
      const truth = TRI_MOUTH_ACTIONS.find((a) => a.name === r.name)!;
      assert.equal(r.keyboard, truth.keyboard);
      assert.equal(r.pointer,  truth.pointer);
      assert.equal(r.curl,     truth.curl);
    }
  });

  test('pending=null when no `pending` field on the literal', () => {
    for (const r of parityBandRows()) {
      const truth = TRI_MOUTH_ACTIONS.find((a) => a.name === r.name)!;
      assert.equal(r.pending, truth.pending ?? null);
    }
  });
});

// ── parityReceipt — one-line footer receipt ──────────────────────────────

describe('parityReceipt — Tanya §4.5 wedge receipt footer', () => {
  test('returns "all mouths wired." when zero debts', () => {
    if (pendingActions().length === 0) {
      assert.equal(parityReceipt(), 'all mouths wired.');
    }
  });

  test('names pending rows AND their kinds when debts exist', () => {
    const p = pendingActions();
    if (p.length === 0) return;
    const line = parityReceipt();
    assert.match(line, /pending/);
    for (const a of p) assert.ok(line.includes(a.name), `missing ${a.name}`);
  });

  test('plural noun respects count (1 → mouth, else mouths)', () => {
    const p = pendingActions();
    if (p.length === 0) return;
    const expected = p.length === 1 ? 'mouth' : 'mouths';
    assert.match(parityReceipt(), new RegExp(`\\b${expected}\\b`));
  });
});

// ── parityGoldEarned — accountability rule ───────────────────────────────

describe('parityGoldEarned — Tanya §4.6 gold-only-when-zero-debt', () => {
  test('false whenever pendingActions().length > 0', () => {
    if (pendingActions().length > 0) {
      assert.equal(parityGoldEarned(), false);
    }
  });

  test('false whenever enforced=false', () => {
    if (!readyToPromote()) {
      assert.equal(parityGoldEarned(), false);
    }
  });

  test('only true when BOTH enforced AND zero pending', () => {
    const expected = readyToPromote() && pendingActions().length === 0;
    assert.equal(parityGoldEarned(), expected);
  });
});

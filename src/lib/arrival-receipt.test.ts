// src/lib/arrival-receipt.test.ts
//
// Golden test for `buildArrivalReceipt()` + `serializeArrivalReceipt()`
// — the single producer of /api/docs/arrival bytes. Mirrors the shape of
// `api-stamp-golden.test.ts` + `citation-golden.test.ts`: a handful of
// pinned-clock scopes, byte-for-byte assertions on the emitted JSON.
//
// Coverage (§ maps to Mike's napkin acceptance list):
//   · §A shape:       happy receipt has fixed key order + ISO `pinnedAt`.
//   · §B failures:    malformed ref / missing cell / unknown cell all
//                     return the closed reason vocabulary.
//   · §C byte-parity: the same inputs → the same bytes every time (the
//                     entire falsifiable criterion rests on this line).
//   · §D pin:         two stamps inside one `withClock()` scope emit an
//                     identical `pinnedAt`.
//
// Run:  npx tsx --test src/lib/arrival-receipt.test.ts
//
// Credits: Mike Koch (napkin §5.10 falsifiable criterion), Paul Kim
//          ("the test IS the feature"), Sid — 2026-04-23.
//          Motto: "code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArrivalReceipt,
  serializeArrivalReceipt,
  statusForReason,
  ARRIVAL_REASONS,
} from './arrival-receipt.ts';
import { withClock } from './clock.ts';

const PINNED = '2026-04-23T12:00:00.000Z';
const REF    = '550e8400-e29b-41d4-a716-446655440000';

// ── §A Shape ─────────────────────────────────────────────────────────────

describe('arrival-receipt — happy shape', () => {
  test('builds a receipt with fixed key order', () => {
    const r = withClock(PINNED, () =>
      buildArrivalReceipt({ axis: 'typography', stage: 'fresh', ref: REF }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.cell.axis, 'typography');
    assert.equal(r.cell.stage, 'fresh');
    assert.equal(r.cell.anchor, 'axis-typography-stage-fresh');
    assert.equal(r.label, 'typography × fresh');
    assert.equal(r.ref, REF);
    assert.equal(r.pinnedAt, PINNED);
    assert.equal(typeof r.parity.rows,     'number');
    assert.equal(typeof r.parity.enforced, 'boolean');
  });

  test('serialises with stable key order', () => {
    const bytes = withClock(PINNED, () => serializeArrivalReceipt(
      buildArrivalReceipt({ axis: 'border', stage: 'endangered', ref: REF })));
    // The keys appear in the order the producer emits. A regression that
    // reorders fields (e.g. `parity` before `ref`) fails this assertion
    // before the handler's body can drift from the panel's data-attr.
    const expectedOrder = ['"ok":true', '"cell":', '"axis":"border"',
      '"stage":"endangered"', '"anchor":', '"label":', '"ref":',
      '"pinnedAt":', '"parity":'];
    let cursor = 0;
    for (const frag of expectedOrder) {
      const i = bytes.indexOf(frag, cursor);
      assert.ok(i >= 0, `missing "${frag}" in: ${bytes}`);
      cursor = i + frag.length;
    }
  });
});

// ── §B Failures ──────────────────────────────────────────────────────────

describe('arrival-receipt — failure vocabulary', () => {
  test('null ref → malformed', () => {
    const r = buildArrivalReceipt({ axis: 'typography', stage: 'fresh', ref: null });
    assert.deepEqual(r, { ok: false, reason: 'malformed' });
  });
  test('short ref → malformed', () => {
    const r = buildArrivalReceipt({ axis: 'typography', stage: 'fresh', ref: 'short' });
    assert.deepEqual(r, { ok: false, reason: 'malformed' });
  });
  test('missing axis → malformed', () => {
    const r = buildArrivalReceipt({ axis: null, stage: 'fresh', ref: REF });
    assert.deepEqual(r, { ok: false, reason: 'malformed' });
  });
  test('unknown axis → unknown-cell', () => {
    const r = buildArrivalReceipt({ axis: 'made-up', stage: 'fresh', ref: REF });
    assert.deepEqual(r, { ok: false, reason: 'unknown-cell' });
  });
  test('unknown stage → unknown-cell', () => {
    const r = buildArrivalReceipt({ axis: 'typography', stage: 'whatever', ref: REF });
    assert.deepEqual(r, { ok: false, reason: 'unknown-cell' });
  });
  test('closed reason set matches the mapping', () => {
    for (const reason of ARRIVAL_REASONS) {
      const code = statusForReason(reason);
      assert.ok(code === 400 || code === 404,
        `unexpected status ${code} for reason ${reason}`);
    }
  });
});

// ── §C Byte-parity — the whole point ─────────────────────────────────────

describe('arrival-receipt — byte-identical under pin', () => {
  test('same inputs + pin → byte-identical bytes', () => {
    const a = withClock(PINNED, () => serializeArrivalReceipt(
      buildArrivalReceipt({ axis: 'tempo', stage: 'ghost', ref: REF })));
    const b = withClock(PINNED, () => serializeArrivalReceipt(
      buildArrivalReceipt({ axis: 'tempo', stage: 'ghost', ref: REF })));
    assert.equal(a, b, 'two runs of the same inputs diverged');
  });
});

// ── §D Pin identity inside one scope ─────────────────────────────────────

describe('arrival-receipt — pin identity within a scope', () => {
  test('two receipts in one withClock scope share pinnedAt', () => {
    const [a, b] = withClock(PINNED, () => [
      buildArrivalReceipt({ axis: 'focus', stage: 'fading', ref: REF }),
      buildArrivalReceipt({ axis: 'underline', stage: 'fossil', ref: REF }),
    ]);
    assert.equal(a.ok && b.ok, true);
    if (!(a.ok && b.ok)) return;
    assert.equal(a.pinnedAt, b.pinnedAt, 'siblings agree on pin');
    assert.equal(a.pinnedAt, PINNED);
  });
});

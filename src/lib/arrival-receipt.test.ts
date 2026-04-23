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
//   · §E cross-mouth: the FALSIFIABLE criterion. For N pinned vectors,
//                     producer bytes ≡ route-body bytes ≡ painter bytes.
//                     When this block fails, the third mouth has drifted
//                     — prebuild goes red so no PR ships the regression.
//
// Run:  npx tsx --test src/lib/arrival-receipt.test.ts
//
// Credits: Mike Koch (napkin §5.10 falsifiable criterion; v177.1 §E
//          cross-mouth golden wall), Paul Kim ("close the third mouth
//          — lock it with a golden wall"), Elon (§5 "ship tri-mouth
//          byte parity, enforce in CI"), Tanya Donska (UX §4.2 "the
//          receipt is the reward" — its bytes are the contract), Sid
//          — 2026-04-23. Motto: "code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArrivalReceipt,
  serializeArrivalReceipt,
  statusForReason,
  ARRIVAL_REASONS,
} from './arrival-receipt.ts';
import { withClock } from './clock.ts';
import { GET as arrivalGET } from '../pages/api/docs/arrival.ts';
import { receiptBytesForPanel } from './client/arrival-acknowledge.ts';

const PINNED = '2026-04-23T12:00:00.000Z';
const REF    = '550e8400-e29b-41d4-a716-446655440000';
const REF_B  = 'ab12-cd34-ef56-7890-abcdef012345';    // §E second valid ref

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

// ── §E Cross-mouth byte-parity golden (THE falsifiable criterion) ────────
//
// Three mouths must emit byte-identical JSON when given the same inputs
// under the same pin. If any one drifts, this block goes red before the
// build starts — that's the whole point of promoting it to the prebuild
// wall (Mike napkin §1 / §6). The three observation paths:
//
//     A) producer     : serializeArrivalReceipt(buildArrivalReceipt(…))
//     B) route body   : GET /api/docs/arrival?axis=…&stage=…&r=…
//     C) painter bytes: receiptBytesForPanel(buildArrivalReceipt(…))
//
// C is a pure re-export of B from the client painter's POV — extracting
// the one JSON-serialisation callsite into a helper means the boot path
// and the test agree on the bytes without pulling a DOM library into CI
// (Mike §6.1 "zero new deps").
//
// Coverage: three happy vectors spanning axes + stages, plus one failure
// vector (`unknown-cell`). Each vector asserts producer ≡ route ≡ painter,
// no-trailing-newline, no-pretty-print, and a single-line shape.

/** Assemble a fully-qualified URL for the arrival route. Sentinel host
 *  mirrors `citation-golden`'s `https://a.test` — RFC-6761 unroutable,
 *  so a regression can never leak a prod origin into the bytes. */
function buildArrivalUrl(axis: string, stage: string, ref: string): string {
  const u = new URL('https://a.test/api/docs/arrival');
  u.searchParams.set('axis',  axis);
  u.searchParams.set('stage', stage);
  u.searchParams.set('r',     ref);
  return u.toString();
}

/** Invoke an Astro `APIRoute.GET` with a minimal context. Inline until
 *  a second caller (cite / revive golden) justifies promotion to
 *  `src/lib/__fixtures__/invoke-route.ts` — Mike napkin §6.5 rule-of-
 *  three. The arrival handler only consumes `{ url }`, so the `request`
 *  field is belt-and-braces for future handlers that read headers. */
async function invokeRoute(url: string): Promise<Response> {
  const u = new URL(url);
  const ctx = { url: u, request: new Request(u) };
  type CtxFn = (c: typeof ctx) => Response | Promise<Response>;
  return await (arrivalGET as unknown as CtxFn)(ctx);
}

/** Read all three mouths for one vector under ONE pin scope. Pure;
 *  no DOM, no fs, no network — the route handler runs in-process. */
async function observeThreeMouths(
  axis: string, stage: string, ref: string,
): Promise<{ producer: string; route: string; painter: string; status: number }> {
  return await withClock(PINNED, async () => {
    const producer = serializeArrivalReceipt(
      buildArrivalReceipt({ axis, stage, ref }));
    const res      = await invokeRoute(buildArrivalUrl(axis, stage, ref));
    const route    = await res.text();
    const painter  = receiptBytesForPanel(
      buildArrivalReceipt({ axis, stage, ref }));
    return { producer, route, painter, status: res.status };
  });
}

/** Shared byte-identity assertion — every §E vector funnels through it
 *  so a TAP failure names one line, not three. */
function assertTriMouthParity(
  m: { producer: string; route: string; painter: string },
  label: string,
): void {
  assert.equal(m.producer, m.route,   `[${label}] producer vs route diverged`);
  assert.equal(m.producer, m.painter, `[${label}] producer vs painter diverged`);
  assert.equal(m.producer.endsWith('\n'), false, `[${label}] trailing newline`);
  assert.equal(m.producer.endsWith('\r'), false, `[${label}] trailing CR`);
  assert.doesNotMatch(m.producer, /[\n\r]/,      `[${label}] multi-line body`);
  assert.equal(m.producer, JSON.stringify(JSON.parse(m.producer)),
    `[${label}] pretty-printed or reordered output`);
}

interface TriVector {
  readonly name:   string;
  readonly axis:   string;
  readonly stage:  string;
  readonly ref:    string;
  readonly status: number;
}

/** Four vectors: three happy (cover typography/tempo/drag-highlight) +
 *  one failure (unknown-cell). Exceeds Mike §8 floor of three distinct
 *  vectors including one fail — the fourth is cheap insurance. */
const VECTORS: readonly TriVector[] = [
  { name: 'happy · typography × fresh',      axis: 'typography',     stage: 'fresh',      ref: REF,   status: 200 },
  { name: 'happy · tempo × endangered',      axis: 'tempo',          stage: 'endangered', ref: REF_B, status: 200 },
  { name: 'happy · drag-highlight × fossil', axis: 'drag-highlight', stage: 'fossil',     ref: REF,   status: 200 },
  { name: 'fail  · unknown-cell',            axis: 'not-an-axis',    stage: 'fresh',      ref: REF,   status: 404 },
];

describe('arrival-receipt §E — cross-mouth byte-parity golden', () => {
  for (const v of VECTORS) {
    test(`${v.name} — producer ≡ route ≡ painter`, async () => {
      const m = await observeThreeMouths(v.axis, v.stage, v.ref);
      assertTriMouthParity(m, v.name);
      assert.equal(m.status, v.status, `[${v.name}] unexpected HTTP status`);
    });
  }

  test('happy vector carries pinned ISO, anchor, and parity witness', async () => {
    const m = await observeThreeMouths('typography', 'fresh', REF);
    const obj = JSON.parse(m.producer) as Record<string, unknown>;
    assert.equal(obj.ok, true);
    assert.equal(obj.ref, REF);
    assert.equal(obj.pinnedAt, PINNED);
    assert.equal(obj.label,    'typography × fresh');
    const cell = obj.cell as Record<string, string>;
    assert.equal(cell.anchor, 'axis-typography-stage-fresh');
    const parity = obj.parity as Record<string, unknown>;
    assert.equal(typeof parity.rows,     'number');
    assert.equal(typeof parity.mouths,   'number');
    assert.equal(typeof parity.enforced, 'boolean');
  });

  test('fail vector carries closed reason (unknown-cell, no leak)', async () => {
    const m = await observeThreeMouths('not-an-axis', 'fresh', REF);
    const obj = JSON.parse(m.producer) as Record<string, unknown>;
    assert.deepEqual(obj, { ok: false, reason: 'unknown-cell' });
    assert.equal(m.status, 404);
  });

  test('route returns JSON content-type and Cache-Control: no-store', async () => {
    const url = buildArrivalUrl('typography', 'fresh', REF);
    const res = await withClock(PINNED, async () => invokeRoute(url));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  test('route still pins `no-store` on failure (stale-pin regression guard)', async () => {
    // A future cache-layer mistake is cheapest to catch here: if a fail
    // response ever drops `no-store`, a reverse proxy could pin a stale
    // `pinnedAt` on a subsequent happy response. One assertion, one line.
    const url = buildArrivalUrl('not-an-axis', 'fresh', REF);
    const res = await withClock(PINNED, async () => invokeRoute(url));
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});

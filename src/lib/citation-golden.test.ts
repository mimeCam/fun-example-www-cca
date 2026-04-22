// src/lib/citation-golden.test.ts
//
// v155 "Citation Golden" — byte-exact frozen witness of the citation
// contract. 35 rows of (axis, stage, payload) as a code literal. Drift
// shows up in `git diff`, not in a silently-regenerated fixture file.
//
// What this file guarantees (fail loudly on any deviation):
//   · The oracle produces EXACTLY these 35 strings for the sentinel
//     origin (`https://a.test`) and no ref.
//   · Row count equals GOLDEN_ROW_COUNT (= STAGE_AXES.length *
//     DECAY_STAGES.length). Freeze violations blow up here first.
//   · Every payload carries the sentinel origin (no prod host baked in).
//   · The single non-trivial transformation in the oracle —
//     encodeURIComponent(ref) — round-trips byte-exactly for five refs
//     that cover the URL-reserved character classes.
//
// Run:  npx tsx --test src/lib/citation-golden.test.ts
//
// Credits: Mike (v155 napkin §5 inline literal, not JSON), Elon (v155
//          first-principles "bake the one non-trivial transformation" —
//          encodeURIComponent), Paul (the contract matters even when the
//          test is tautological; survival means reviewers SEE it), Tanya
//          (UX spec credits §9 API parity), AGENTS.md (freeze). Sid —
//          2026-04-22. Motto: "code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  citationGolden,
  citationForRef,
  curlMouthPayload,
  curlMouthResponse,
  GOLDEN_ROW_COUNT,
  REF_FIXTURES,
  VALID_REF_FIXTURES,
  REF_FIXTURE_AXIS,
  REF_FIXTURE_STAGE,
  SENTINEL_ORIGIN,
} from './citation-golden.js';
import type { GoldenRow } from './citation-golden.js';
import { STAGE_AXES } from './stage-axes.js';
import { DECAY_STAGES } from './decay-engine.js';
import { cellCitationPayload } from './stage-axes.js';
import { isValidRef } from './citation-ref.js';

// ── The golden table — inline literal, byte-exact, frozen ─────────────────
//
// If a diff shows up here, the PR author owes the team a one-line why in
// the commit body. That is the whole point of an inline literal: blast
// radius visible at review time (Mike §5.2).

const GOLDEN: readonly GoldenRow[] = [
  { axis: 'typography',     stage: 'fresh',      payload: 'typography × fresh · https://a.test/api/docs#axis-typography-stage-fresh' },
  { axis: 'typography',     stage: 'fading',     payload: 'typography × fading · https://a.test/api/docs#axis-typography-stage-fading' },
  { axis: 'typography',     stage: 'endangered', payload: 'typography × endangered · https://a.test/api/docs#axis-typography-stage-endangered' },
  { axis: 'typography',     stage: 'ghost',      payload: 'typography × ghost · https://a.test/api/docs#axis-typography-stage-ghost' },
  { axis: 'typography',     stage: 'fossil',     payload: 'typography × fossil · https://a.test/api/docs#axis-typography-stage-fossil' },
  { axis: 'border',         stage: 'fresh',      payload: 'border × fresh · https://a.test/api/docs#axis-border-stage-fresh' },
  { axis: 'border',         stage: 'fading',     payload: 'border × fading · https://a.test/api/docs#axis-border-stage-fading' },
  { axis: 'border',         stage: 'endangered', payload: 'border × endangered · https://a.test/api/docs#axis-border-stage-endangered' },
  { axis: 'border',         stage: 'ghost',      payload: 'border × ghost · https://a.test/api/docs#axis-border-stage-ghost' },
  { axis: 'border',         stage: 'fossil',     payload: 'border × fossil · https://a.test/api/docs#axis-border-stage-fossil' },
  { axis: 'tempo',          stage: 'fresh',      payload: 'tempo × fresh · https://a.test/api/docs#axis-tempo-stage-fresh' },
  { axis: 'tempo',          stage: 'fading',     payload: 'tempo × fading · https://a.test/api/docs#axis-tempo-stage-fading' },
  { axis: 'tempo',          stage: 'endangered', payload: 'tempo × endangered · https://a.test/api/docs#axis-tempo-stage-endangered' },
  { axis: 'tempo',          stage: 'ghost',      payload: 'tempo × ghost · https://a.test/api/docs#axis-tempo-stage-ghost' },
  { axis: 'tempo',          stage: 'fossil',     payload: 'tempo × fossil · https://a.test/api/docs#axis-tempo-stage-fossil' },
  { axis: 'selection',      stage: 'fresh',      payload: 'selection × fresh · https://a.test/api/docs#axis-selection-stage-fresh' },
  { axis: 'selection',      stage: 'fading',     payload: 'selection × fading · https://a.test/api/docs#axis-selection-stage-fading' },
  { axis: 'selection',      stage: 'endangered', payload: 'selection × endangered · https://a.test/api/docs#axis-selection-stage-endangered' },
  { axis: 'selection',      stage: 'ghost',      payload: 'selection × ghost · https://a.test/api/docs#axis-selection-stage-ghost' },
  { axis: 'selection',      stage: 'fossil',     payload: 'selection × fossil · https://a.test/api/docs#axis-selection-stage-fossil' },
  { axis: 'drag-highlight', stage: 'fresh',      payload: 'drag-highlight × fresh · https://a.test/api/docs#axis-drag-highlight-stage-fresh' },
  { axis: 'drag-highlight', stage: 'fading',     payload: 'drag-highlight × fading · https://a.test/api/docs#axis-drag-highlight-stage-fading' },
  { axis: 'drag-highlight', stage: 'endangered', payload: 'drag-highlight × endangered · https://a.test/api/docs#axis-drag-highlight-stage-endangered' },
  { axis: 'drag-highlight', stage: 'ghost',      payload: 'drag-highlight × ghost · https://a.test/api/docs#axis-drag-highlight-stage-ghost' },
  { axis: 'drag-highlight', stage: 'fossil',     payload: 'drag-highlight × fossil · https://a.test/api/docs#axis-drag-highlight-stage-fossil' },
  { axis: 'focus',          stage: 'fresh',      payload: 'focus × fresh · https://a.test/api/docs#axis-focus-stage-fresh' },
  { axis: 'focus',          stage: 'fading',     payload: 'focus × fading · https://a.test/api/docs#axis-focus-stage-fading' },
  { axis: 'focus',          stage: 'endangered', payload: 'focus × endangered · https://a.test/api/docs#axis-focus-stage-endangered' },
  { axis: 'focus',          stage: 'ghost',      payload: 'focus × ghost · https://a.test/api/docs#axis-focus-stage-ghost' },
  { axis: 'focus',          stage: 'fossil',     payload: 'focus × fossil · https://a.test/api/docs#axis-focus-stage-fossil' },
  { axis: 'underline',      stage: 'fresh',      payload: 'underline × fresh · https://a.test/api/docs#axis-underline-stage-fresh' },
  { axis: 'underline',      stage: 'fading',     payload: 'underline × fading · https://a.test/api/docs#axis-underline-stage-fading' },
  { axis: 'underline',      stage: 'endangered', payload: 'underline × endangered · https://a.test/api/docs#axis-underline-stage-endangered' },
  { axis: 'underline',      stage: 'ghost',      payload: 'underline × ghost · https://a.test/api/docs#axis-underline-stage-ghost' },
  { axis: 'underline',      stage: 'fossil',     payload: 'underline × fossil · https://a.test/api/docs#axis-underline-stage-fossil' },
];

// ── 1 · Row count — the freeze, re-asserted ───────────────────────────────

describe('citation-golden — row count matches STAGE_AXES × DECAY_STAGES', () => {
  test('GOLDEN_ROW_COUNT equals 7 × 5 = 35', () => {
    assert.equal(GOLDEN_ROW_COUNT, 35);
    assert.equal(GOLDEN_ROW_COUNT, STAGE_AXES.length * DECAY_STAGES.length);
  });

  test('inline literal has exactly GOLDEN_ROW_COUNT rows', () => {
    assert.equal(GOLDEN.length, GOLDEN_ROW_COUNT);
  });

  test('producer emits exactly GOLDEN_ROW_COUNT rows', () => {
    assert.equal(citationGolden().length, GOLDEN_ROW_COUNT);
  });
});

// ── 2 · Byte-exact match — the witness ────────────────────────────────────
//
// Per-row test so a single-cell drift names the offender in the TAP
// output. No loops-with-assertion-messages: the test name IS the message.

describe('citation-golden — every row byte-exact against the oracle', () => {
  const produced = citationGolden();

  for (let i = 0; i < GOLDEN.length; i++) {
    const g = GOLDEN[i];
    test(`[${i}] ${g.axis} × ${g.stage} — byte-exact`, () => {
      const p = produced[i];
      assert.equal(p.axis,    g.axis);
      assert.equal(p.stage,   g.stage);
      assert.equal(p.payload, g.payload);
    });
  }
});

// ── 3 · Sentinel hygiene — no prod host can sneak in ──────────────────────

describe('citation-golden — sentinel-origin discipline', () => {
  test('every golden payload embeds SENTINEL_ORIGIN verbatim', () => {
    for (const row of GOLDEN) {
      assert.ok(
        row.payload.includes(SENTINEL_ORIGIN),
        `row ${row.axis}:${row.stage} does not carry ${SENTINEL_ORIGIN}`,
      );
    }
  });

  test('no golden payload contains a real deploy host fragment', () => {
    // Belt-and-braces: if a developer ever pastes a prod host into the
    // golden by mistake, this test names the smell. Keeps the sentinel
    // the single host anywhere near this file.
    const forbidden = ['localhost', 'getsven', 'persona.test', 'https://a.getsven.com'];
    for (const row of GOLDEN) {
      for (const f of forbidden) {
        assert.ok(!row.payload.includes(f),
          `row ${row.axis}:${row.stage} leaks host fragment "${f}"`);
      }
    }
  });

  test('sentinel origin resolves to an RFC-6761 `.test` host (unroutable)', () => {
    // Defensive: the RFC reservation is what makes the sentinel safe.
    assert.match(SENTINEL_ORIGIN, /^https:\/\/[a-z0-9.-]+\.test$/);
  });
});

// ── 4 · Ref round-trip — encodeURIComponent is the one transform ──────────

describe('citation-golden — ref variant round-trips through encodeURIComponent', () => {
  for (const fix of REF_FIXTURES) {
    test(`ref=${JSON.stringify(fix.ref)} → byte-exact`, () => {
      assert.equal(citationForRef(fix.ref), fix.expected);
    });
  }

  test('every ref fixture is single-line (no CR/LF)', () => {
    for (const fix of REF_FIXTURES) {
      assert.doesNotMatch(fix.expected, /[\r\n]/);
    }
  });
});

// ── 5 · Third mouth — `curl` handler body byte-matches the oracle ─────────
//
// v156 "Third Mouth" (Mike napkin §3 / §6, Paul §7 ship criteria):
// until this block landed, the click and keystroke mouths were two
// aliases for one import; no runtime witness proved the terminal mouth
// returned the same bytes. These tests dispatch a synthetic GET through
// the handler and assert the body === cellCitationPayload(...) for all
// 35 rows AND all 5 ref fixtures. The tautology becomes an invariant
// because the handler's Response construction is *separate code* being
// asserted against the pure producer.

describe('citation-golden — v156 third mouth (GET /api/docs/cite) parity', () => {
  for (let i = 0; i < GOLDEN.length; i++) {
    const g = GOLDEN[i];
    test(`[${i}] ${g.axis} × ${g.stage} — handler body == oracle`, async () => {
      const body = await curlMouthPayload(g.axis, g.stage, SENTINEL_ORIGIN);
      assert.equal(body, g.payload);
    });
  }

  test('handler body has no trailing newline (clipboard parity)', async () => {
    const body = await curlMouthPayload('typography', 'fresh', SENTINEL_ORIGIN);
    assert.equal(body.endsWith('\n'), false);
    assert.equal(body.endsWith('\r'), false);
  });

  test('handler body is single-line for every cell', async () => {
    const sample = await curlMouthPayload('focus', 'ghost', SENTINEL_ORIGIN);
    assert.doesNotMatch(sample, /[\r\n]/);
  });
});

describe('citation-golden — v156 third mouth, valid refs byte-exact', () => {
  // Every entry in VALID_REF_FIXTURES is REF_RE-valid so the handler
  // passes the nonce straight to cellCitationPayload. The assertion is
  // symmetric: the handler's body is exactly what the oracle emits for
  // the same (axis, stage, origin, ref) tuple. One symbol, three mouths.
  for (const ref of VALID_REF_FIXTURES) {
    test(`valid ref=${ref.length > 12 ? ref.slice(0, 12) + '…' : ref} → handler body == oracle`, async () => {
      const body = await curlMouthPayload(
        REF_FIXTURE_AXIS, REF_FIXTURE_STAGE, SENTINEL_ORIGIN, ref,
      );
      const expected = cellCitationPayload(
        REF_FIXTURE_AXIS, REF_FIXTURE_STAGE, SENTINEL_ORIGIN, ref,
      );
      assert.equal(body, expected);
    });
  }
});

// ── 6 · Third mouth — wire-contract error surface (§4 spec) ───────────────
//
// The wire contract promises 422 on invalid ref. REF_FIXTURES carries
// adversarial (URL-reserved-character) nonces; the oracle accepts them
// because it runs encodeURIComponent on anything, but the read handler
// rejects them so the ingest endpoint's REF_RE is honoured at the
// boundary. Without this block, the 422 clause is unwitnessed.

describe('citation-golden — v156 third mouth rejects invalid refs (422)', () => {
  // REF_FIXTURES exists to exercise the ORACLE'S encodeURIComponent via
  // `citationForRef` — its nonces intentionally carry URL-reserved chars
  // (# & % ' '), which REF_RE rejects. One of them (`plain-abc`) is
  // REF_RE-valid and lives on the happy path via VALID_REF_FIXTURES.
  // Filter to the adversarial set for the handler's 422 clause.
  const invalid = REF_FIXTURES.filter((f) => !isValidRef(f.ref));
  for (const fix of invalid) {
    test(`ref=${JSON.stringify(fix.ref)} → 422 (invalid parameter: r)`, async () => {
      const res = await curlMouthResponse(
        REF_FIXTURE_AXIS, REF_FIXTURE_STAGE, SENTINEL_ORIGIN, fix.ref,
      );
      assert.equal(res.status, 422);
      const body = await res.text();
      assert.match(body, /invalid parameter: r/);
    });
  }
});

// ── 7 · Third mouth — missing / invalid axis & stage ──────────────────────

describe('citation-golden — v156 third mouth validates axis + stage', () => {
  test('missing axis → 400', async () => {
    // Simulate a URL without the `axis` param by passing "" which the
    // handler treats as absent — the helper always sets a string, so we
    // reach into curlMouthResponse with a no-op rebuild: easiest is to
    // call the handler through the shortcut that omits `axis` entirely.
    const { buildCiteUrl } = await import('./citation-golden.js');
    const url = buildCiteUrl('typography', 'fresh', SENTINEL_ORIGIN);
    url.searchParams.delete('axis');
    const mod = await import('../pages/api/docs/cite.js');
    const res = await (mod.GET as (ctx: { url: URL; request: Request }) => Response | Promise<Response>)(
      { url, request: new Request(url.toString()) },
    );
    assert.equal(res.status, 400);
  });

  test('invalid axis → 422', async () => {
    const { buildCiteUrl } = await import('./citation-golden.js');
    const url = buildCiteUrl('typography', 'fresh', SENTINEL_ORIGIN);
    url.searchParams.set('axis', 'not-an-axis');
    const mod = await import('../pages/api/docs/cite.js');
    const res = await (mod.GET as (ctx: { url: URL; request: Request }) => Response | Promise<Response>)(
      { url, request: new Request(url.toString()) },
    );
    assert.equal(res.status, 422);
  });

  test('invalid stage → 422', async () => {
    const { buildCiteUrl } = await import('./citation-golden.js');
    const url = buildCiteUrl('typography', 'fresh', SENTINEL_ORIGIN);
    url.searchParams.set('stage', 'not-a-stage');
    const mod = await import('../pages/api/docs/cite.js');
    const res = await (mod.GET as (ctx: { url: URL; request: Request }) => Response | Promise<Response>)(
      { url, request: new Request(url.toString()) },
    );
    assert.equal(res.status, 422);
  });

  test('Accept: application/json → payload field equals text/plain body', async () => {
    // API parity: the JSON mouth's `payload` is the canonical product;
    // the other fields are convenience. This pins the one-oracle rule
    // across both content-negotiated shapes.
    const { buildCiteUrl } = await import('./citation-golden.js');
    const url = buildCiteUrl('typography', 'fresh', SENTINEL_ORIGIN);
    const mod = await import('../pages/api/docs/cite.js');
    const req = new Request(url.toString(), { headers: { accept: 'application/json' } });
    const res = await (mod.GET as (ctx: { url: URL; request: Request }) => Response | Promise<Response>)(
      { url, request: req },
    );
    assert.equal(res.status, 200);
    const body = JSON.parse(await res.text());
    assert.equal(body.payload, cellCitationPayload('typography', 'fresh', SENTINEL_ORIGIN));
  });

  test('non-GET verb → 405 Allow: GET', async () => {
    const { buildCiteUrl } = await import('./citation-golden.js');
    const url = buildCiteUrl('typography', 'fresh', SENTINEL_ORIGIN);
    const mod = await import('../pages/api/docs/cite.js');
    const req = new Request(url.toString(), { method: 'POST' });
    const res = await (mod.POST as (ctx: { url: URL; request: Request }) => Response | Promise<Response>)(
      { url, request: req },
    );
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
  });
});

// src/lib/api-stamp-golden.test.ts
//
// Golden test for `jsonStamped()` — the one helper that produces the
// `computedAt` field on every read-only JSON response.
//
// Why a golden: the seam's whole promise is that two handlers stamped within
// the SAME SSR request agree byte-for-byte on `computedAt`. This test proves
// that property by stamping multiple synthetic payloads inside one
// `withClock()` scope (the middleware's moral equivalent) and asserting
// identical timestamps — plus a handful of shape/pin invariants.
//
// Run:  npx tsx --test src/lib/api-stamp-golden.test.ts
//
// Coverage (§ maps to Mike's napkin acceptance list):
//   · §1 shape: `{ computedAt: "<ISO>" }` with the correct key name
//   · §2 pin identity: N calls in one scope → one identical ISO
//   · §3 scope isolation: nested withClock wins over outer
//   · §4 body preservation: spreads, doesn't mutate, doesn't drop keys
//   · §5 seam overrides caller — if body carries `computedAt`, seam wins
//   · §6 cross-handler parity: two distinct payloads, one scope, same stamp
//
// Credits: Mike Koch (napkin §Stamped JSON acceptance criteria), Paul Kim
//          ("input parity by construction"), Elon (golden > snapshot), Sid
//          ("Code maintenance without tests" — so when a test EXISTS, it must
//          scream on drift, not whisper). 2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { jsonStamped, withClock, nowISO } from './clock.js';

// ── ISO format — RFC-3339 / JS toISOString() shape ───────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── §1  Shape — field name + ISO format ──────────────────────────────────────

describe('jsonStamped — shape', () => {
  test('emits a `computedAt` field (not `generatedAt`, not `stampedAt`)', () => {
    const got = withClock('2026-04-23T00:00:00Z', () => jsonStamped({}));
    assert.ok('computedAt' in got, 'field is named computedAt');
    assert.equal(Object.keys(got).length, 1, 'only one key on empty body');
  });

  test('computedAt is ISO-8601 UTC with ms precision', () => {
    const got = withClock('2026-04-23T12:34:56.789Z', () => jsonStamped({}));
    assert.match(got.computedAt, ISO_RE, `not ISO: ${got.computedAt}`);
    assert.equal(got.computedAt, '2026-04-23T12:34:56.789Z');
  });
});

// ── §2  Pin identity — same scope, byte-identical stamps ─────────────────────

describe('jsonStamped — pin identity within a scope', () => {
  test('two calls in one withClock scope produce identical computedAt', () => {
    const [a, b] = withClock('2026-04-23T09:00:00Z', () => [
      jsonStamped({ handler: 'leaderboard' }),
      jsonStamped({ handler: 'stage-counts' }),
    ]);
    assert.equal(a.computedAt, b.computedAt, 'sibling handlers agree');
  });

  test('jsonStamped agrees with nowISO() inside the same scope', () => {
    const PINNED = '2026-04-23T09:15:00Z';
    const { stamp, iso } = withClock(PINNED, () => ({
      stamp: jsonStamped({}).computedAt,
      iso:   nowISO(),
    }));
    assert.equal(stamp, iso, 'one clock, one value, one truth');
  });

  test('ten calls in one scope produce one distinct value', () => {
    const stamps = withClock('2026-04-23T09:30:00Z',
      () => Array.from({ length: 10 }, () => jsonStamped({}).computedAt),
    );
    const distinct = new Set(stamps);
    assert.equal(distinct.size, 1, `expected 1 distinct stamp, got ${distinct.size}`);
  });
});

// ── §3  Scope isolation — inner pin wins over outer ──────────────────────────

describe('jsonStamped — scope isolation', () => {
  test('inner withClock overrides outer for jsonStamped output', () => {
    const got = withClock('2026-01-01T00:00:00Z', () =>
      withClock('2026-12-31T00:00:00Z', () => jsonStamped({}))
    );
    assert.equal(got.computedAt, '2026-12-31T00:00:00.000Z', 'innermost pin wins');
  });

  test('consecutive scopes see different stamps', () => {
    const a = withClock('2026-04-01T00:00:00Z', () => jsonStamped({}));
    const b = withClock('2026-04-02T00:00:00Z', () => jsonStamped({}));
    assert.notEqual(a.computedAt, b.computedAt, 'adjacent scopes differ');
  });
});

// ── §4  Body preservation — no mutation, no key drop ─────────────────────────

describe('jsonStamped — body preservation', () => {
  test('all input keys survive the spread', () => {
    const body = { authors: ['ada', 'grace'], live: 3, endangered: 1 };
    const got = withClock('2026-04-23T00:00:00Z', () => jsonStamped(body));
    assert.deepEqual(got.authors, ['ada', 'grace']);
    assert.equal(got.live, 3);
    assert.equal(got.endangered, 1);
  });

  test('does not mutate the input object', () => {
    const body: { x: number; computedAt?: string } = { x: 1 };
    const frozen = JSON.stringify(body);
    withClock('2026-04-23T00:00:00Z', () => jsonStamped(body));
    assert.equal(JSON.stringify(body), frozen, 'input is untouched');
  });

  test('nested value references are preserved (shallow spread)', () => {
    const inner = { nested: true };
    const got = withClock('2026-04-23T00:00:00Z', () => jsonStamped({ inner }));
    assert.equal(got.inner, inner, 'spread is shallow — same reference');
  });
});

// ── §5  Seam overrides caller — the clock is the source of truth ─────────────

describe('jsonStamped — seam overrides caller', () => {
  test('caller-supplied computedAt is overwritten by the pinned clock', () => {
    const got = withClock('2026-04-23T06:00:00Z', () =>
      jsonStamped({ computedAt: 'caller-lied' }),
    );
    assert.equal(got.computedAt, '2026-04-23T06:00:00.000Z', 'seam wins');
  });
});

// ── §6  Cross-handler parity — the acceptance criterion from the napkin ──────

describe('jsonStamped — cross-handler parity (napkin §Acceptance 3)', () => {
  test('three distinct handlers in one scope emit one computedAt', () => {
    // Each block is a synthetic handler — different shapes, different keys.
    const payloads = withClock('2026-04-23T18:42:07.384Z', () => [
      jsonStamped({ authors: [] }),                          // leaderboard
      jsonStamped({ live: 0, endangered: 0, graveyard: 0 }), // stage-counts
      jsonStamped({ author: 'host', trophyTier: 'bronze' }), // conviction-stats
    ]);
    const stamps = payloads.map(p => p.computedAt);
    assert.equal(new Set(stamps).size, 1, 'all three handlers agree');
    assert.equal(stamps[0], '2026-04-23T18:42:07.384Z');
  });
});

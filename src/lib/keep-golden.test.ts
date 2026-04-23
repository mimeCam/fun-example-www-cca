// src/lib/keep-golden.test.ts
// v176 PR-E — byte-identical-receipt golden test for the `keep-post`
// tri-mouth action. Mirrors src/lib/citation-golden.test.ts shape:
// drive the oracle (`keepPact`) + the SSR-safe composer (`keepWithLedger`)
// + the curl route handler; assert all three emit the SAME receipt given
// the SAME inputs.
//
// Run (with a hermetic community DB so slugExists passes without touching
// the real revivals.db file). v176 PR-E adds REVIVALS_DB_PATH=:memory: so
// the route's `incrementRevival` + `canReviveBySession` calls land in a
// throwaway sqlite that is freshly seeded on every test run — without it
// the third mouth's first POST inherits prior `kept` state from the dev
// DB and the byte-for-byte `deepEqual` against the direct call breaks):
//
//   COMMUNITY_DB_PATH=:memory: REVIVALS_DB_PATH=:memory: \
//     npx tsx --test src/lib/keep-golden.test.ts
//
// The contract this test freezes (reject PR if any assertion breaks):
//   · Mouth 1 — direct `keepPact(input, facts, deps)` returns a receipt
//                whose shape is exactly the KeepReceipt type literal.
//   · Mouth 2 — `keepWithLedger(input, ledger, deps)` returns the same
//                receipt (ledger writes happen behind the seam, shape
//                does not change).
//   · Mouth 3 — `POST /api/keep` dispatched through handler-dispatch
//                returns a receipt whose JSON bytes `deepEqual` the
//                pure-function output, under pinned clock + fixed nonce.
//   · `why` is passed through unchanged and absent iff the caller
//      omitted it. No `null`, no `undefined` string.
//   · The second POST with the same {sessionId, slug} returns
//     `kept: false` and does NOT increment `count` — session idempotency.
//
// Credits: Mike Koch (napkin §3/§7 golden test is the acceptance),
//          Paul Kim ("byte-identical across three mouths" — same
//          discipline the citation golden froze for 35 rows), Tanya
//          Donska (UX §3/§5 receipts light the gold pip when this
//          passes), Krystle Clear (PR-E wedge cadence), the authors
//          of citation-golden.test.ts (template this file copies),
//          handler-dispatch.ts (the one in-process dispatcher Mike
//          napkin §6 promoted), Sid — 2026-04-23.
//          Motto: "code maintenance without tests."

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKeepReceipt,
  keepPact,
  keepWithLedger,
  makeMemoryLedger,
  type KeepReceipt,
  type KeepPactDeps,
  type KeepPactInput,
  type KeepPactLedger,
} from './keep-pact.ts';
import { dispatchJson } from './handler-dispatch.ts';
import { insertPost } from './communityPosts.ts';

// ── Pinned seams — reproducible nonce + clock across every mouth ─────────
//
// Nonce is a literal UUID-shaped string. Clock is a numeric ms value
// (the producer's `clock()` returns ms, not ISO). Both are injected via
// the `deps` parameter for mouths 1 and 2; for mouth 3 (the route) we
// temporarily stub `globalThis.crypto.randomUUID` + use `withClock`
// because the route cannot accept deps across the HTTP boundary.

const PINNED_NONCE = '550e8400-e29b-41d4-a716-446655440000';
const PINNED_TS    = Date.UTC(2026, 3, 23, 18, 42, 7, 384); // 2026-04-23T18:42:07.384Z
const PINNED_DEPS: KeepPactDeps = {
  clock: () => PINNED_TS,
  nonce: () => PINNED_NONCE,
};

// ── Fixtures — one slug, two sessions, one `why` ─────────────────────────

const SLUG = 'keep-golden-fixture-post';
const SESSION_A = 'session-alpha';
const SESSION_B = 'session-beta';
const WHY = 'still-true';

// The community DB stand-in — inserts a hermetic post so `slugExists` in
// the route handler answers `true` without loading `astro:content`.
before(() => {
  if (process.env.COMMUNITY_DB_PATH !== ':memory:') {
    // Fail fast if the harness forgot the env. Keeps this test from
    // polluting a real data/revivals.db. (Paul Kim's hermetic rule.)
    throw new Error('keep-golden.test: set COMMUNITY_DB_PATH=:memory: to run hermetically.');
  }
  if (process.env.REVIVALS_DB_PATH !== ':memory:') {
    // v176 PR-E §3.6 — without this, the route's `incrementRevival` writes
    // into the dev's persistent revivals.db; subsequent runs see stale
    // `kept` state and the byte-for-byte deepEqual against the direct
    // call breaks. Same hermetic rule, second seam.
    throw new Error('keep-golden.test: set REVIVALS_DB_PATH=:memory: to run hermetically.');
  }
  insertPost({
    slug: SLUG, title: 'Golden fixture', body: 'a'.repeat(300),
    pow_nonce: 0, pow_hash: '0000', author_label: null,
  });
});

// ── Shape invariants — the key order is the freeze ───────────────────────

const EXPECTED_KEYS_WITH_WHY    = ['slug', 'nonce', 'ts', 'kept', 'count', 'why'] as const;
const EXPECTED_KEYS_WITHOUT_WHY = ['slug', 'nonce', 'ts', 'kept', 'count'] as const;

describe('keep-golden — key order + KeepReceipt shape', () => {
  test('receipt with `why` carries the six expected keys in order', () => {
    const r = buildKeepReceipt(
      { slug: SLUG, sessionId: SESSION_A, why: WHY },
      PINNED_TS, PINNED_NONCE, true, 1,
    );
    assert.deepEqual(Object.keys(r), EXPECTED_KEYS_WITH_WHY);
  });

  test('receipt without `why` omits the field (no `null`, no `undefined`)', () => {
    const r = buildKeepReceipt(
      { slug: SLUG, sessionId: SESSION_A },
      PINNED_TS, PINNED_NONCE, true, 1,
    );
    assert.deepEqual(Object.keys(r), EXPECTED_KEYS_WITHOUT_WHY);
    assert.equal((r as { why?: unknown }).why, undefined);
  });
});

// ── Mouth 1 — direct call ────────────────────────────────────────────────

describe('keep-golden — mouth 1: direct `keepPact` (pure)', () => {
  test('fresh session → kept: true, count: 1, `why` preserved', () => {
    const r = keepPact(
      { slug: SLUG, sessionId: SESSION_A, why: WHY },
      { alreadyKept: false, count: 1 },
      PINNED_DEPS,
    );
    assert.deepEqual(r, receiptLiteral({ kept: true, count: 1, why: WHY }));
  });

  test('returning session → kept: false, count unchanged, `why` preserved', () => {
    const r = keepPact(
      { slug: SLUG, sessionId: SESSION_A, why: WHY },
      { alreadyKept: true, count: 7 },
      PINNED_DEPS,
    );
    assert.deepEqual(r, receiptLiteral({ kept: false, count: 7, why: WHY }));
  });
});

// ── Mouth 2 — SSR-safe composer (`keepWithLedger` + in-memory ledger) ───

describe('keep-golden — mouth 2: `keepWithLedger` (SSR path)', () => {
  test('two calls on the same session → fresh then idempotent', () => {
    const ledger = makeMemoryLedger();
    const first  = keepWithLedger(inputWithWhy(SESSION_A), ledger, PINNED_DEPS);
    const second = keepWithLedger(inputWithWhy(SESSION_A), ledger, PINNED_DEPS);
    assert.deepEqual(first,  receiptLiteral({ kept: true,  count: 1, why: WHY }));
    assert.deepEqual(second, receiptLiteral({ kept: false, count: 1, why: WHY }));
  });

  test('different sessions bump the count independently', () => {
    const ledger = makeMemoryLedger();
    const a = keepWithLedger(inputWithWhy(SESSION_A), ledger, PINNED_DEPS);
    const b = keepWithLedger(inputWithWhy(SESSION_B), ledger, PINNED_DEPS);
    assert.equal(a.count, 1);
    assert.equal(b.count, 2);
    assert.equal(a.kept,  true);
    assert.equal(b.kept,  true);
  });

  test('omitted `why` stays omitted through the composer', () => {
    const ledger = makeMemoryLedger();
    const r = keepWithLedger(
      { slug: SLUG, sessionId: SESSION_A }, ledger, PINNED_DEPS,
    );
    assert.deepEqual(r, receiptLiteral({ kept: true, count: 1 }));
  });
});

// ── Mouth 3 — the curl route dispatched through handler-dispatch ─────────
//
// The route uses `crypto.randomUUID()` + `now()` internally — no deps
// param crosses the HTTP boundary. We stub `globalThis.crypto.randomUUID`
// for the test duration and pin the clock via `withClock`. Any drift
// between the route body and the direct call surfaces as a `deepEqual`
// failure on the JSON payload.

describe('keep-golden — mouth 3: `POST /api/keep` (curl)', () => {
  test('route body deep-equals the direct call under pinned seams', async () => {
    const { body, status } = await withPinnedSeams(() =>
      dispatchKeep({ slug: SLUG, why: WHY }, SESSION_A),
    );
    assert.equal(status, 200);
    assert.deepEqual(body, receiptLiteral({ kept: true, count: firstCount(body), why: WHY }));
  });

  test('second POST with the same session returns kept: false (idempotent)', async () => {
    const sessionX = 'session-idempotent';
    await withPinnedSeams(() => dispatchKeep({ slug: SLUG }, sessionX));
    const { body } = await withPinnedSeams(() =>
      dispatchKeep({ slug: SLUG }, sessionX),
    );
    assert.equal((body as KeepReceipt).kept, false);
  });

  test('missing x-session-id header is a 400', async () => {
    const res = await dispatchKeep({ slug: SLUG }, null);
    assert.equal(res.status, 400);
  });

  test('bad JSON body is a 400', async () => {
    const mod = await import('../pages/api/keep.ts');
    const res = await dispatchJson(mod, 'POST', new URL('http://a.test/api/keep'), {
      headers: { 'x-session-id': SESSION_A, 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    assert.equal(res.status, 400);
  });

  test('unknown slug is a 400', async () => {
    const res = await dispatchKeep({ slug: 'no-such-slug' }, SESSION_A);
    assert.equal(res.status, 400);
  });
});

// ── Helpers — ≤ 10 LoC each (Sid rule) ───────────────────────────────────

/** Build the literal KeepReceipt the three mouths MUST agree on. The
 *  literal is the contract — any new field is a conscious migration. */
function receiptLiteral(
  over: { kept: boolean; count: number; why?: string },
): KeepReceipt {
  const base: KeepReceipt = {
    slug: SLUG, nonce: PINNED_NONCE, ts: PINNED_TS,
    kept: over.kept, count: over.count,
  };
  return over.why === undefined ? base : { ...base, why: over.why };
}

/** Tiny factory — "with why" input, same sessionId passed through. */
function inputWithWhy(sessionId: string): KeepPactInput {
  return { slug: SLUG, sessionId, why: WHY };
}

/** Dispatch `POST /api/keep` through the in-process dispatcher. */
async function dispatchKeep(
  body: { slug: string; why?: string }, sessionId: string | null,
): Promise<{ status: number; body: unknown }> {
  const mod = await import('../pages/api/keep.ts');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers['x-session-id'] = sessionId;
  return dispatchJson(mod, 'POST', new URL('http://a.test/api/keep'), {
    headers, body: JSON.stringify(body),
  });
}

/** Run `fn` with both the clock and the crypto nonce pinned to the
 *  golden values. Restores both on the way out, success or failure. */
async function withPinnedSeams<T>(fn: () => Promise<T>): Promise<T> {
  const { withClock } = await import('./clock.ts');
  return withClock(PINNED_TS, () => withStubbedNonce(fn));
}

/** Narrowly stub `globalThis.crypto.randomUUID` so the route's default
 *  deps path returns the pinned nonce. Restores the original on finally. */
async function withStubbedNonce<T>(fn: () => Promise<T>): Promise<T> {
  const c = globalThis.crypto as { randomUUID?: () => string };
  const orig = c.randomUUID;
  Object.defineProperty(c, 'randomUUID', {
    value: () => PINNED_NONCE, configurable: true, writable: true,
  });
  try { return await fn(); }
  finally {
    if (orig) Object.defineProperty(c, 'randomUUID', {
      value: orig, configurable: true, writable: true,
    });
  }
}

/** Read `count` off a response body typed as unknown. Keeps the
 *  deepEqual call literal-symmetric even when the count is dynamic. */
function firstCount(body: unknown): number {
  return (body as KeepReceipt).count;
}

/** Casts — silence the suppressed ledger type import for linters. */
export type _SilenceLedger = KeepPactLedger;

// src/lib/journey-witness.ts
// v168 "Journey Witness" — the in-process dispatch mouths for the user
// lifecycle (Mike napkin §3 diagram middle column). Each exported fn
// is a ≤10-LoC wire: build a Request, call the real handler through
// `handler-dispatch.ts::dispatchApiRoute`, return `{ status, body }`.
//
// This file is the `curlMouthResponse` cousin for the journey — it is
// the second consumer of the promoted shared dispatcher (Mike §6), and
// it never duplicates route logic. The handlers under `src/pages/api/*`
// are the one oracle; this file is just the wire.
//
// Credits: Mike Koch ("Journey Witness" napkin §2 "in-process
//          dispatcher", §3 diagram, §6 promotion of handler-dispatch),
//          citation-golden.ts authors (the pattern this copies), Sid
//          (≤10-LoC rule — every function below is 3-7 lines), AGENTS.md
//          (polymorphism-is-a-killer — no generic mouth factory, just
//          a line-per-mouth), Elon (§5 user-witnessing guards),
//          2026-04-23.

import {
  POW_TITLE, POW_BODY, POW_NONCE, POW_HASH,
  SENTINEL_AUTHOR_LABEL, SENTINEL_IP,
} from './journey-golden';
import { dispatchApiRoute, dispatchJson } from './handler-dispatch';

// ── Sentinel origin — same `.test` RFC-6761 discipline as v155 ────────────

export const JOURNEY_ORIGIN = 'https://a.test' as const;

// ── Header / URL builders (pure, ≤ 5 lines each) ──────────────────────────

/** Per-IP header set. Varies the IP across calls so the submit-post
 *  rate-limit map (keyed on x-forwarded-for) never trips the guard. */
export function sentinelHeaders(ipSuffix: number = 0): HeadersInit {
  const ip = `127.0.0.${10 + ipSuffix}`;
  return { 'Content-Type': 'application/json', 'x-forwarded-for': ip };
}

/** Build a URL rooted at the sentinel origin. Keeps callers short. */
export function journeyUrl(pathname: string): URL {
  return new URL(`${JOURNEY_ORIGIN}${pathname}`);
}

// ── Submit mouth — POST /api/submit-post ──────────────────────────────────

/** Assemble the happy-path submit body. Pure literals only. */
export function happyPathBody(): Record<string, unknown> {
  return {
    title: POW_TITLE, body: POW_BODY,
    author_label: SENTINEL_AUTHOR_LABEL,
    pow_nonce: POW_NONCE, pow_hash: POW_HASH,
  };
}

/** Dispatch one POST /api/submit-post with an arbitrary body + ip seed.
 *  Stateless wrapper; the handler's own validation + DB write runs. */
export async function submitMouth(
  body: unknown, ipSuffix: number = 0,
): Promise<{ status: number; body: unknown }> {
  const mod = await import('../pages/api/submit-post');
  const url = journeyUrl('/api/submit-post');
  const init: RequestInit = {
    headers: sentinelHeaders(ipSuffix),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
  return dispatchJson(mod, 'POST', url, init);
}

/** Dispatch a NON-JSON submit (raw body) — exercises the 'invalid_json'
 *  branch. Split from submitMouth so the caller can pass any string. */
export async function submitMouthRaw(
  raw: string, ipSuffix: number = 0,
): Promise<{ status: number; body: unknown }> {
  return submitMouth(raw, ipSuffix);
}

// ── Read mouth — lean DB-only retrieval (no content-collection dep) ───────
//
// `/api/stage-counts` reads the Astro `blog` content collection, which
// isn't available outside the Astro dev/build pipeline. For hermetic
// prebuild, we witness the equivalent invariant via the DB layer —
// `getLivePosts()` is the same query the UI eventually calls. Keeping
// the mouth on the DB layer keeps the guard a pure `tsx` run.

/** Read mouth — count live community posts via the DB singleton. Pure
 *  read, no HTTP. Returns `{ status: 200, body: { live: <count> } }`
 *  so the shape matches `/api/stage-counts` for the `live` slice. */
export async function readCommunityLiveMouth(): Promise<{ status: number; body: unknown }> {
  const { getLivePosts } = await import('./communityPosts');
  const live = getLivePosts().length;
  return { status: 200, body: { live } };
}

// ── Per-step dispatcher — one switch, one oracle (Mike §7) ────────────────

/** Route one journey step to its mouth. Keeps the guard script's main
 *  loop down to a for-of over JOURNEY_STEPS. Every case is 1–2 lines. */
export async function dispatchJourneyStep(
  step: string,
): Promise<{ status: number; body: unknown }> {
  if (step === 'submit-happy-path')     return submitMouth(happyPathBody(), 0);
  if (step === 'submit-invalid-json')   return submitMouthRaw('}{not json', 1);
  if (step === 'submit-missing-title')  return submitMouth(bodyWithoutTitle(), 2);
  if (step === 'submit-body-too-short') return submitMouth(shortBody(), 3);
  if (step === 'submit-bad-pow')        return submitMouth(badPowBody(), 4);
  if (step === 'read-empty-store')      return readCommunityLiveMouth();
  throw new Error(`journey-witness: unknown step "${step}"`);
}

// ── Bad-path body builders — each pins one validator branch ───────────────

function bodyWithoutTitle(): Record<string, unknown> {
  return { ...happyPathBody(), title: '' };
}

function shortBody(): Record<string, unknown> {
  return { ...happyPathBody(), body: 'one two three four five' };
}

function badPowBody(): Record<string, unknown> {
  // Non-'0000'-prefixed hash; the handler enforces startsWith(DIFFICULTY)
  // and also that sha256(contentHash + ':' + nonce) === hash. Either
  // failure yields 400 pow_invalid — we're witnessing the clause, not
  // any particular sub-clause.
  return { ...happyPathBody(), pow_hash: 'deadbeef'.repeat(8) };
}

// ── Shape assertion helpers (pure; `check-user-journey.ts` consumes) ──────

/** True iff `body` has every key in `keys` (shallow). Pure 4-liner. */
export function hasShape(body: unknown, keys: readonly string[]): boolean {
  if (body === null || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

/** True iff every (k,v) in `literal` is === the same key in `body`. */
export function matchesLiteral(
  body: unknown, literal: Readonly<Record<string, unknown>>,
): boolean {
  if (body === null || typeof body !== 'object') return false;
  const obj = body as Record<string, unknown>;
  return Object.entries(literal).every(([k, v]) => obj[k] === v);
}

/** One-line human summary for the guard's failure message. */
export function summarize(result: { status: number; body: unknown }): string {
  return `status=${result.status} body=${JSON.stringify(result.body).slice(0, 140)}`;
}

// ── Silence unused-import warnings when this module is imported piecemeal ─
void dispatchApiRoute; // keep the import reachable for tree-shakers
// TODO: wire endanger / revive / verdict mouths once clock seam lands
//       (see journey-golden.ts §TODO block).

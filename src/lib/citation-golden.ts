// src/lib/citation-golden.ts
// v155 "Citation Golden" — static, frozen 35-row witness of the citation
// contract. The sentence this module makes executable:
//
//   For every (axis, stage) in STAGE_AXES × DECAY_STAGES, the string
//   cellCitationPayload(axis, stage, SENTINEL_ORIGIN) is byte-stable
//   across time — the oracle (stage-axes.ts::cellCitationPayload) is the
//   single source every mouth routes through.
//
// Replaces Mike's v48 postbuild harness idea (spawn `astro preview`, curl
// three endpoints, diff three strings). That harness tested a tautology
// because all three mouths already import the same symbol. This module
// encodes the contract *statically* as a code literal so any drift shows
// up in `git diff` — the reviewer sees the 35-row blast radius at a glance.
//
// Discipline (Sid §every-fn-≤-10-LOC, Mike §5 no polymorphism):
//   · Pure producer. No DOM, no network, no fs, no time. SSR/test-safe.
//   · Sentinel origin — never the production host. Bakes the *shape*, not
//     a deploy target. Runtime callers supply their own origin.
//   · One array, one type. The `GoldenRow` type is not a contract; it's
//     a shape for the test's diff output.
//
// Credits: Mike (v155 napkin §1 static witness, §5.1 sentinel origin,
//          §5.2 inline-literal-not-fixture), Elon (v155 first-principles
//          read — "tautology postbuild" replaced by static proof), Paul
//          (the 105/105 framing survives in campaign copy; the invariant
//          survives in this file), Tanya (UX spec §9 — the chip backed
//          by this number is descoped this sprint), AGENTS.md (axis
//          freeze, "polish what we have — AAA"), Sid — 2026-04-22.
//          Motto: "code maintenance without tests."

import { cellCitationPayload, STAGE_AXES, cellAnchorId } from './stage-axes';
import type { Axis } from './stage-axes';
import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';

// ── Sentinel origin (the one Elon §3 calls "the shape, not the host") ─────
//
// RFC 6761 reserves `.test` for testing; no real deploy can collide. Using
// a real host (persona.test, localhost, a.getsven.com) in a frozen golden
// invites "regenerate on deploy" scripts that silently rewrite the
// contract. `.test` makes any such rewrite obvious on review.
export const SENTINEL_ORIGIN = 'https://a.test' as const;

// ── Row shape — the unit of drift-detection ───────────────────────────────

/**
 * One row of the golden table — (axis, stage) coordinates plus the frozen
 * payload the oracle produced for the sentinel origin at freeze-time.
 * Shape-only: the real contract is the `payload` strings in the test.
 */
export interface GoldenRow {
  readonly axis: Axis;
  readonly stage: DecayStage;
  readonly payload: string;
}

// ── Producer — 35 rows, row-major order matching stageAxisGrid() ──────────

/**
 * Produce the full 35-row table for the sentinel origin. Order is
 * axis-outer, stage-inner (matches `stageAxisGrid()` in stage-axes.ts and
 * the visual order of the /api/docs matrix). Ref is always omitted: the
 * ref variant is exercised separately in the golden test below.
 */
export function citationGolden(): readonly GoldenRow[] {
  const out: GoldenRow[] = [];
  for (const axis of STAGE_AXES) {
    for (const stage of DECAY_STAGES) {
      out.push({ axis, stage, payload: cellCitationPayload(axis, stage, SENTINEL_ORIGIN) });
    }
  }
  return out;
}

/**
 * The expected row count — a second check on top of the byte-exact table.
 * If the freeze ever moves (AGENTS.md tombstone), this number moves in the
 * same PR. Callers should assert both: byte-exact table AND this count.
 */
export const GOLDEN_ROW_COUNT: number = STAGE_AXES.length * DECAY_STAGES.length;

// ── Ref-variant fixtures — the one non-trivial transformation ─────────────
//
// Elon §4 (v155): "the three-mouth parity is a tautology; the one
// non-trivial transformation in the oracle is `encodeURIComponent(ref)`."
// Five refs below exercise every URL-reserved character class the ritual
// can meet in the wild: plain, hash, ampersand, literal percent, and
// space. The expected strings are asserted byte-for-byte in the test.
//
// The keys are kept short so the test output diff reads cleanly on drift.

export interface RefFixture {
  readonly ref: string;
  readonly expected: string;
}

/** Fixed (axis, stage) for the ref variants — one cell, five refs. The
 *  cell choice is arbitrary; `typography × fresh` is the grid's origin
 *  and its label has no dashes, so the ref becomes the only moving part. */
export const REF_FIXTURE_AXIS:  Axis       = 'typography';
export const REF_FIXTURE_STAGE: DecayStage = 'fresh';

/** Expected anchor for the ref fixtures (keeps the test literal short). */
export const REF_FIXTURE_ANCHOR: string = cellAnchorId(REF_FIXTURE_AXIS, REF_FIXTURE_STAGE);

/** Round-trip table — the only thing the oracle does that is NOT a bare
 *  string concat. If encodeURIComponent ever stops being WHATWG-spec,
 *  one or more of these fixtures trips the byte-exact assertion.         */
export const REF_FIXTURES: readonly RefFixture[] = [
  // plain ASCII (identity under encodeURIComponent)
  { ref: 'plain-abc',
    expected: `typography × fresh · ${SENTINEL_ORIGIN}/api/docs?r=plain-abc#${REF_FIXTURE_ANCHOR}` },
  // `#` must be encoded (fragment start)
  { ref: 'hash#frag',
    expected: `typography × fresh · ${SENTINEL_ORIGIN}/api/docs?r=hash%23frag#${REF_FIXTURE_ANCHOR}` },
  // `&` must be encoded (query separator)
  { ref: 'amp&ersand',
    expected: `typography × fresh · ${SENTINEL_ORIGIN}/api/docs?r=amp%26ersand#${REF_FIXTURE_ANCHOR}` },
  // literal percent must double-encode (%25 → %2525)
  { ref: 'pct%25',
    expected: `typography × fresh · ${SENTINEL_ORIGIN}/api/docs?r=pct%2525#${REF_FIXTURE_ANCHOR}` },
  // space must become %20 (not '+', that's form-encoding)
  { ref: 'space bar',
    expected: `typography × fresh · ${SENTINEL_ORIGIN}/api/docs?r=space%20bar#${REF_FIXTURE_ANCHOR}` },
];

/**
 * Render the oracle's payload for one ref fixture — the producer under
 * test. Kept separate from `citationGolden()` so the row-table and the
 * ref-round-trip live in two disjoint assertions (one axis of drift per
 * test block; Sid §10-line rule).
 */
export function citationForRef(ref: string): string {
  return cellCitationPayload(REF_FIXTURE_AXIS, REF_FIXTURE_STAGE, SENTINEL_ORIGIN, ref);
}

// ── Third-mouth fixture (v156, Mike napkin §3 / §6) ───────────────────────
//
// The click mouth (cell-cite.ts) and the keystroke mouth (cell-cite.ts)
// route clipboard bytes through `cellCitationPayload()`. The terminal
// mouth (src/pages/api/docs/cite.ts) routes HTTP body through the same
// function. The golden test now asserts the THIRD body-production path —
// separate code, same string — byte-for-byte against the oracle.
//
// `curlMouthPayload()` invokes the handler's APIRoute directly (no HTTP
// server, no socket). It is pure-fetch-API in, pure-fetch-API out:
//   URL → handler.GET({ url, request, … }) → Response → await .text()
//
// Keeping it async lets the test await the body without a runner spawn.

/** Assemble the request shape the handler's GET expects. Pure + small. */
export function buildCiteUrl(
  axis: Axis, stage: DecayStage, origin: string, ref?: string,
): URL {
  const u = new URL(`${origin}/api/docs/cite`);
  u.searchParams.set('axis', axis);
  u.searchParams.set('stage', stage);
  if (ref !== undefined) u.searchParams.set('r', ref);
  return u;
}

/**
 * Dispatch a synthetic GET through the handler and return the Response.
 *
 * The handler signature is `APIRoute` — `{ url, request, … }`. We pass
 * only `url` and `request`; the Astro typing is permissive here because
 * the handler never reaches for cookies, params, etc. This IS the tautol-
 * ogy-breaker (Elon §4): three mouths, one oracle, asserted at runtime.
 */
export async function curlMouthResponse(
  axis: Axis, stage: DecayStage, origin: string, ref?: string,
): Promise<Response> {
  const mod = await import('../pages/api/docs/cite');
  const url = buildCiteUrl(axis, stage, origin, ref);
  const request = new Request(url.toString(), { method: 'GET' });
  const handler = mod.GET as (ctx: { url: URL; request: Request }) => Response | Promise<Response>;
  return handler({ url, request });
}

/** Convenience: fetch the handler's body string only. Happy-path shape. */
export async function curlMouthPayload(
  axis: Axis, stage: DecayStage, origin: string, ref?: string,
): Promise<string> {
  const res = await curlMouthResponse(axis, stage, origin, ref);
  return res.text();
}

// ── Valid-ref fixtures — third-mouth happy path ───────────────────────────
//
// These exercise the handler's pass-through behaviour across the full REF_RE
// shape: both length bounds (8, 64), a UUID, and an internal-hyphen nonce.
// The test asserts handler body === cellCitationPayload(..., ref) for each.
// Every entry is REF_RE-valid; adversarial refs (URL-reserved chars) live
// in REF_FIXTURES and exercise the oracle's encodeURIComponent directly.

export const VALID_REF_FIXTURES: readonly string[] = [
  'abcdefgh',                                          // 8-char lower bound
  'a'.repeat(64),                                      // 64-char upper bound
  '550e8400-e29b-41d4-a716-446655440000',             // crypto.randomUUID shape
  'plain-abc-123',                                     // internal hyphens
] as const;

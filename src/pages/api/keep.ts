// src/pages/api/keep.ts
// v176 PR-E — POST /api/keep — the CURL mouth of the `keep-post` action.
//
// Third sibling of the pointer (.keep-float-btn .keep-btn) and keyboard
// (`K`) mouths; all three route their bytes through the SAME producer:
//   src/lib/keep-pact.ts :: keepPact()
//
// Wire contract (frozen; additive-forever):
//
//   POST /api/keep
//     body:    { slug: string, why?: string }
//     header:  x-session-id: <opaque session token>
//
//   200 application/json
//     { slug, nonce, ts, kept, count, why? }
//
//   400 text/plain   invalid JSON / missing slug / unknown slug /
//                    bad `why` type / missing x-session-id
//
// Invariants (Mike napkin §5 + Tri-Mouth Inventory):
//   · §5.1/§5.5 — this route imports `keepPact` from `../../lib/keep-pact`.
//     The prebuild guard (scripts/check-tri-mouth.ts) rejects a drift.
//   · Session idempotency — a second POST with the same {x-session-id,
//     slug} returns `kept: false` and does NOT increment the count.
//     Same semantics the `/api/revive` session rate-limit enforces.
//   · `why` is passed through unmodified; absent iff the client omitted
//     it. The receipt's `why` field is omitted in that case (no `null`).
//
// Hygienic choices (Sid §every-function-≤-10-LOC):
//   · No new DB table. Reuses `incrementRevival` + `canReviveBySession`
//     + `recordRevivalBySession` from src/lib/collectiveMemory.ts — the
//     existing keep-pact writer path.
//   · `prerender = false` — reads `url.origin` + a live DB row.
//   · No `broadcastNamed` SSE yet. The keep-post row's pointer mouth
//     already owns SSE via `/api/revive`; duplicating it here would
//     fire two events for one action. Deferred as // TODO below.
//
// Credits: Mike Koch (napkin §3 "new curl mouth", §5 points-of-interest
//          1–4, §8 sequencing), Paul Kim (PR-E wedge spec), Krystle Clear
//          (cap 1→0 + --warn→--error cadence), Tanya Donska (UX §3 band
//          receipts — "all mouths wired" switches to gold when this
//          route lands), the existing author of src/pages/api/stance.ts
//          (template this route copies — guard layout, jsonOk / badRequest
//          helpers), Sid — 2026-04-23. Motto: "code maintenance without tests."

import type { APIRoute } from 'astro';
import { getPostBySlug as getCommunityPost } from '../../lib/communityPosts';
import {
  canReviveBySession,
  recordRevivalBySession,
  incrementRevival,
  getRevivalCounts,
} from '../../lib/collectiveMemory';
// v176 PR-E §5.5 — route imports its named producer. Tri-Mouth guard
// fails the build if this line regresses (import-regex scanner).
import { keepPact, type KeepReceipt } from '../../lib/keep-pact';

export const prerender = false;

// ── Guards (each ≤ 10 LoC, Sid rule) ─────────────────────────────────────

/** Narrow an unknown value to a non-empty string. Shared guard shape. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** `why` is optional; when present it must be a non-empty string <= 64 chars.
 *  Upper bound matches the chip labels in PactPanel.astro (`still-true`,
 *  `surprising`, etc.) — a longer string is almost certainly a client bug. */
function isValidWhy(v: unknown): v is string | undefined {
  if (v === undefined) return true;
  return isNonEmptyString(v) && (v as string).length <= 64;
}

/** Resolve whether a slug exists — blog collection first (dynamic import
 *  so the module can be loaded from node --test without pulling in the
 *  astro:content virtual loader), community DB fallback. Same two-source
 *  lookup `/api/revive` uses, but without the module-scope import that
 *  would block handler-dispatch from the golden test. */
async function slugExists(slug: string): Promise<boolean> {
  if (getCommunityPost(slug) !== null) return true;
  return hasBlogSlug(slug);
}

/** Dynamic-import helper — isolated so the astro:content loader is
 *  touched only on a real request, never at module-scope. In node-test
 *  without the Astro runtime the import throws; we treat that as "no
 *  blog-slug match" (the caller will fall through to `Unknown slug`). */
async function hasBlogSlug(slug: string): Promise<boolean> {
  try {
    const { getCollection } = await import('astro:content');
    const posts = await getCollection('blog');
    return posts.some((p) => p.slug === slug);
  } catch {
    return false;
  }
}

// ── Route ────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('Invalid JSON');

  const { slug, why } = body;
  if (!isNonEmptyString(slug)) return badRequest('Missing slug');
  if (!isValidWhy(why))        return badRequest('Invalid why — must be a short string');

  const sessionId = request.headers.get('x-session-id');
  if (!isNonEmptyString(sessionId)) return badRequest('Missing x-session-id header');

  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  const receipt = resolveAndProduceReceipt({ slug, sessionId, why });
  return jsonOk(receipt);
};

// ── Non-POST verbs — one shared rejector (Allow: POST) ───────────────────

const rejectNonPost: APIRoute = () =>
  new Response('method not allowed', {
    status: 405,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'POST' },
  });

export const GET:    APIRoute = rejectNonPost;
export const PUT:    APIRoute = rejectNonPost;
export const DELETE: APIRoute = rejectNonPost;
export const PATCH:  APIRoute = rejectNonPost;

// ── Helpers — route composition, each ≤ 10 LoC ───────────────────────────

/** Narrow body input. `why` is optional by the contract. */
interface KeepBody { slug?: unknown; why?: unknown }

/** Parse a JSON body into a shape-constrained record, or `null` on
 *  malformed input. Mirrors the helper in src/pages/api/stance.ts. */
async function parseBody(req: Request): Promise<KeepBody | null> {
  try {
    const parsed = await req.json();
    return (parsed && typeof parsed === 'object') ? (parsed as KeepBody) : null;
  } catch { return null; }
}

/** Resolve session-idempotency + ledger count, then hand off to the
 *  producer. This is the full "three-mouth writer path" the golden
 *  test replays under a pinned clock + stubbed nonce. */
function resolveAndProduceReceipt(
  input: { slug: string; sessionId: string; why?: string },
): KeepReceipt {
  const alreadyKept = !canReviveBySession(input.sessionId, input.slug);
  const count = alreadyKept
    ? readCount(input.slug)
    : bumpCount(input.sessionId, input.slug);
  return keepPact(input, { alreadyKept, count });
}

/** Count-read helper — one lookup, never throws. */
function readCount(slug: string): number {
  try { return getRevivalCounts().get(slug) ?? 0; }
  catch { return 0; }
}

/** Count-bump helper — writes both the revival count and the session
 *  rate-limit stamp in a single logical step (two DB hits, one decision). */
function bumpCount(sessionId: string, slug: string): number {
  const count = incrementRevival(slug);
  recordRevivalBySession(sessionId, slug);
  return count;
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

function jsonOk(body: KeepReceipt): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// TODO(follow-up sprint): broadcast a `keep:confirmed` SSE once the
// pointer/keyboard mouth paths also stop emitting `/api/revive`'s
// `revival` event for the same user action. Duplicating SSE today
// would fire two events for one logical keep; the producer already
// guarantees byte-identical receipts, so SSE parity is the NEXT wedge.

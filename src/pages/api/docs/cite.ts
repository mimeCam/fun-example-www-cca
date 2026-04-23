// src/pages/api/docs/cite.ts
// v156 "Third Mouth" — terminal/`curl` mouth of the citation trilogy.
//
// Click and keystroke both route `cellCitationPayload()` → clipboard.
// This route routes `cellCitationPayload()` → HTTP body. Same symbol,
// three mouths. No polymorphism, no second producer.
//
// Wire contract (frozen at ship; additive-forever):
//
//   GET /api/docs/cite?axis=<axis>&stage=<stage>[&r=<nonce>]
//
//   200 text/plain; charset=utf-8
//     <axis> × <stage> · <origin>/api/docs?r=<nonce>#axis-<axis>-stage-<stage>
//
//   200 application/json   (when Accept: application/json)
//     { axis, stage, label, anchor, ref, url, payload }
//
//   400 text/plain   missing axis or stage
//   422 text/plain   invalid axis / stage / ref
//   405 text/plain   Allow: GET   any other verb
//
// Invariants (enforced by scripts/check-citation-delegation.ts):
//   · This file imports `cellCitationPayload` from ../../../lib/stage-axes.
//   · This file does NOT spell out the payload template — no `× `, ` · `,
//     `#axis-` triplet in code. The grep runs every prebuild.
//
// Hygienic choices (Mike §7, Tanya §9, Elon §5):
//   · Origin = `url.origin` — trusted scheme+host server-side, never
//     `request.headers.get('host')` (spoofable) and never
//     `import.meta.env.SITE` (undefined in preview).
//   · No trailing newline on the text/plain body. `curl -s | wc -c`
//     equals `Buffer.byteLength(payload, 'utf8')` exactly.
//   · Ref is optional, client-supplied. Missing → legacy ref-less
//     format (byte-identical to the click and keystroke mouths when
//     the user doesn't cite round-trip). Invalid → 422.
//   · Read-only. No ledger writes, no cookies, no rate-limit touch —
//     `POST /api/ingest/cell-event` remains the one writer.
//   · No DB import (`better-sqlite3` bundle graph unchanged here).
//
// Credits: Mike Koch (napkin §3 scope, §4 wire contract, §7 points-of-
//          interest — origin discipline, newline discipline, §10
//          deletion clause), Elon (§4 "prove polish by subtraction"),
//          Paul Kim (§7 ship criteria — byte-identical across three
//          mouths), Tanya Donska (§9 API parity, §6 "the ceremony is
//          in the motion, not in the copy"), AGENTS.md (freeze),
//          prior-sprint authors of stage-axes.ts (single oracle),
//          citation-golden.ts (the static witness). Sid — 2026-04-22.
//          Motto: "code maintenance without tests."

import type { APIRoute } from 'astro';
import {
  cellCitationPayload,
  cellCitationLabel,
  cellAnchorId,
  STAGE_AXES,
} from '../../../lib/stage-axes';
import type { Axis } from '../../../lib/stage-axes';
import { DECAY_STAGES } from '../../../lib/decay-engine';
import type { DecayStage } from '../../../lib/decay-engine';
import { isValidRef } from '../../../lib/citation-ref';
// v175 — add one JSON-branch field that witnesses the tri-mouth parity.
// text/plain branch untouched (Mike napkin §2 byte-identical guarantee;
// Paul MH-3 curl-parity preserved). The field reads from the same shared
// helper the /api/docs page and the prebuild guard consume.
import { parityJsonField } from '../../../lib/parity-seal';

// SSR — this route must read `url.origin` at request time so a
// preview deploy and a production deploy both serve honest payloads.
export const prerender = false;

// ── Validation sets — derived once from the frozen literals ──────────────

const AXIS_SET:  ReadonlySet<string> = new Set(STAGE_AXES);
const STAGE_SET: ReadonlySet<string> = new Set(DECAY_STAGES);

const ALLOW_HEADER   = 'GET';
const TEXT_MIME      = 'text/plain; charset=utf-8';
const JSON_MIME      = 'application/json; charset=utf-8';
const CACHE_CONTROL  = 'public, max-age=60';

// ── GET — the terminal mouth ─────────────────────────────────────────────

export const GET: APIRoute = ({ url, request }) => {
  const axis  = url.searchParams.get('axis');
  const stage = url.searchParams.get('stage');
  const ref   = url.searchParams.get('r');
  const missing = missingParam(axis, stage);
  if (missing) return textResponse(400, `missing parameter: ${missing}`);
  const invalid = invalidParam(axis as string, stage as string, ref);
  if (invalid) return textResponse(422, `invalid parameter: ${invalid}`);
  return renderResponse(url, request, axis as Axis, stage as DecayStage, ref);
};

// ── Non-GET verbs — one shared rejector (Allow: GET) ─────────────────────
//
// The list is explicit so a misrouted POST (e.g. someone confused this
// route with the ingest beacon) returns 405 with a literal Allow header,
// not a 404 that would mask the misconfiguration.

const rejectNonGet: APIRoute = () =>
  new Response('method not allowed', {
    status: 405,
    headers: { 'Content-Type': TEXT_MIME, Allow: ALLOW_HEADER },
  });

export const POST:    APIRoute = rejectNonGet;
export const PUT:     APIRoute = rejectNonGet;
export const DELETE:  APIRoute = rejectNonGet;
export const PATCH:   APIRoute = rejectNonGet;
export const OPTIONS: APIRoute = rejectNonGet;

// ── Helpers — each ≤ 10 LOC, Sid rule ────────────────────────────────────

/** Name the first required parameter that's absent, or null if both set. */
function missingParam(axis: string | null, stage: string | null): string | null {
  if (!axis)  return 'axis';
  if (!stage) return 'stage';
  return null;
}

/** Name the first invalid parameter, or null if the row is well-formed. */
function invalidParam(axis: string, stage: string, ref: string | null): string | null {
  if (!AXIS_SET.has(axis))   return 'axis';
  if (!STAGE_SET.has(stage)) return 'stage';
  if (ref !== null && !isValidRef(ref)) return 'r';
  return null;
}

/** Pick the response shape — JSON wins on Accept or .json pathname. */
function wantsJson(url: URL, request: Request): boolean {
  if (url.pathname.endsWith('.json')) return true;
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json');
}

/** Build both media shapes from a single payload string — one oracle call. */
function renderResponse(
  url: URL, request: Request,
  axis: Axis, stage: DecayStage, ref: string | null,
): Response {
  const refArg = ref ?? undefined;
  const payload = cellCitationPayload(axis, stage, url.origin, refArg);
  if (wantsJson(url, request)) return jsonResponse(axis, stage, url.origin, refArg, payload);
  return plainResponse(payload);
}

/** 200 text/plain — payload-only body, no trailing newline. */
function plainResponse(payload: string): Response {
  return new Response(payload, {
    status: 200,
    headers: { 'Content-Type': TEXT_MIME, 'Cache-Control': CACHE_CONTROL },
  });
}

/** 200 application/json — additive shape; `payload` is the product. */
function jsonResponse(
  axis: Axis, stage: DecayStage,
  origin: string, ref: string | undefined, payload: string,
): Response {
  return new Response(JSON.stringify(jsonBody(axis, stage, origin, ref, payload)), {
    status: 200,
    headers: { 'Content-Type': JSON_MIME, 'Cache-Control': CACHE_CONTROL },
  });
}

/** JSON body — every field derives from the oracle helpers. v175 adds
 *  the `parity` witness: curl-parity mouth sees the same `{rows,mouths,
 *  enforced}` the page renders. Additive-forever; the text/plain body
 *  is unchanged so `curl -s | wc -c` still matches Buffer.byteLength. */
function jsonBody(
  axis: Axis, stage: DecayStage,
  origin: string, ref: string | undefined, payload: string,
): Record<string, unknown> {
  const anchor = cellAnchorId(axis, stage);
  const query  = ref ? `?r=${encodeURIComponent(ref)}` : '';
  return {
    axis, stage,
    label:  cellCitationLabel(axis, stage),
    anchor,
    ref:    ref ?? null,
    url:    `${origin}/api/docs${query}#${anchor}`,
    payload,
    parity: parityJsonField(),
  };
}

/** Small error body; same MIME as the happy path. */
function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': TEXT_MIME },
  });
}

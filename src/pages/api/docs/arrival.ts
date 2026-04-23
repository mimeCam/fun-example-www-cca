// src/pages/api/docs/arrival.ts
// v177 "Arrival Receipt" — the curl-side mouth of the copy→arrive→verify
// handshake. Sibling route of ./cite.ts; same discipline, same shape.
//
// Wire contract (frozen at ship; additive-forever):
//
//   GET /api/docs/arrival?axis=<axis>&stage=<stage>&r=<nonce>
//
//   200 application/json
//     { ok:true, cell:{axis,stage,anchor}, label, ref, pinnedAt, parity }
//
//   400 application/json   { ok:false, reason:'malformed'     }
//   404 application/json   { ok:false, reason:'unknown-cell'  }
//   405 text/plain          Allow: GET   (any other verb)
//
// Invariants:
//   · The body is whatever `serializeArrivalReceipt()` returns — this
//     route does NOT hand-roll JSON.stringify. One producer, three mouths
//     (Mike napkin §3, "polymorphism is a killer").
//   · No DB import, no ledger write, no rate-limit touch. This is a
//     read-only witness; the arrival beacon is the writer.
//   · `Cache-Control: no-store` — the receipt embeds the SSR-pinned
//     clock and a caller-supplied nonce; caching is a shape bug.
//
// Credits: Mike Koch (napkin §4 wire contract), Paul Kim (§7 ship
//          criteria — byte-identical bytes across the three mouths),
//          Tanya Donska (§4.6 quiet error — no stack traces on the
//          wire), Elon (§4 "prove polish by subtraction"), prior
//          authors of src/pages/api/docs/cite.ts (sibling shape),
//          AGENTS.md (freeze). Sid — 2026-04-23.
//          Motto: "code maintenance without tests."

import type { APIRoute } from 'astro';
import {
  buildArrivalReceipt,
  serializeArrivalReceipt,
  statusForReason,
} from '../../../lib/arrival-receipt';

// SSR on demand — the receipt body embeds the per-request pinned clock,
// so caching the response would freeze a stale `pinnedAt` on disk.
export const prerender = false;

const ALLOW       = 'GET';
const JSON_MIME   = 'application/json; charset=utf-8';
const TEXT_MIME   = 'text/plain; charset=utf-8';
const NO_STORE    = 'no-store';

// ── GET — the arrival mouth ─────────────────────────────────────────────

export const GET: APIRoute = ({ url }) => {
  const axis  = url.searchParams.get('axis');
  const stage = url.searchParams.get('stage');
  const ref   = url.searchParams.get('r');
  const receipt = buildArrivalReceipt({ axis, stage, ref });
  const body    = serializeArrivalReceipt(receipt);
  const status  = receipt.ok ? 200 : statusForReason(receipt.reason);
  return new Response(body, {
    status,
    headers: { 'Content-Type': JSON_MIME, 'Cache-Control': NO_STORE },
  });
};

// ── Non-GET verbs — one shared rejector (Allow: GET) ────────────────────

const rejectNonGet: APIRoute = () =>
  new Response('method not allowed', {
    status: 405,
    headers: { 'Content-Type': TEXT_MIME, Allow: ALLOW },
  });

export const POST:    APIRoute = rejectNonGet;
export const PUT:     APIRoute = rejectNonGet;
export const DELETE:  APIRoute = rejectNonGet;
export const PATCH:   APIRoute = rejectNonGet;
export const OPTIONS: APIRoute = rejectNonGet;

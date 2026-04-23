// src/lib/cite-flash.ts
// v179 "CiteFlash" — the pure timing + nonce lifecycle for the copy→arrive
// receipt flash. One pure function, three mouths (same law as arrival-receipt
// and stage-axes): the Astro component renders it, the client IIFE runs it,
// and the test pins it via `withClock()`.
//
// Scope (Mike napkin §4 — "Create · cite-flash.ts"):
//   · Shape the flash descriptor given {axis, stage, origin, ref}.
//   · Mint a nonce when the caller omits one (browser needs one per copy).
//   · Produce the `curl` one-liner the ApiAlso chip reveals.
//   · Expose dwell/fade milliseconds read from the existing `--motion-cite-
//     ack-duration` token (no new tokens) so the component can schedule the
//     flash-to-lit transition without hand-typing numbers.
//
// Non-duties (Mike §4 explicit vetoes, Tanya §3.2 motion gate):
//   · No DOM. No fetch. No window. SSR + browser-safe.
//   · No payload re-assembly: delegates to `cellCitationPayload()`. The
//     tri-mouth byte-identity contract is sacred (check-tri-mouth.ts).
//   · No new tokens. The ms literals here are READER hints for the Astro
//     component; the CSS reads the token directly, never these constants.
//   · Browser pulls `now()` from clock.ts (respects the SSR pin via ALS).
//
// Credits: Mike Koch (napkin §4 "Create", §6 POI-1 clock routing, §6 POI-2
//          frozen wire), Tanya Donska (§3 motion gate, §3.3 receipt moment
//          choreography), Paul Kim (byte-identical three-mouth), Elon
//          (§3.3 no backend-state-named tokens — the `durationMs` here is
//          a scheduling scalar, not a CSS var; Elon's ruling preserved).
//          Sid — 2026-04-23. Motto: "code maintenance without tests."

import { cellCitationPayload, STAGE_AXES } from './stage-axes';
import type { Axis } from './stage-axes';
import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';
import { isValidRef } from './citation-ref';
import { now } from './clock';

// ── Public shapes ────────────────────────────────────────────────────────

/** Inputs a caller passes — `ref` optional; if omitted we mint one. */
export interface CiteFlashInputs {
  readonly axis:   string;
  readonly stage:  string;
  readonly origin: string;
  readonly ref?:   string;
}

/** What the Astro component + client IIFE both consume. `classes` is the
 *  idle class list; `litClass` is added once `/api/docs/arrival` returns
 *  200. `durationMs` is the scheduling beat (reads --motion-cite-ack
 *  client-side; this scalar is the SSR-side mirror for tests). */
export interface CiteFlashDescriptor {
  readonly classes:    readonly string[];
  readonly litClass:   string;
  readonly durationMs: number;
  readonly nonce:      string;
  readonly curl:       string;
  readonly payload:    string;
  readonly arrivalUrl: string;
  readonly pinnedAtMs: number;
}

// ── Frozen constants (one source, grep-friendly) ─────────────────────────

/** Idle flash classes — the BEM root + an axis-flavoured modifier so a
 *  reduced-motion fallback can pick the same pair without hand-typing. */
const BASE_CLASS: string  = 'cite-flash';
/** Lit modifier — added on arrival 200. Single source; the CSS module
 *  and the component script both read this constant. */
export const LIT_CLASS: string = 'cite-flash--lit';
/** The one scheduling beat. Mirrors --motion-cite-ack-duration (200ms)
 *  without hand-typing; the component reads the token, this scalar backs
 *  the pure test. Mike napkin §6 POI-3: zero new sibling tokens. */
export const CITE_FLASH_DURATION_MS: number = 200;

const AXIS_SET:  ReadonlySet<string> = new Set(STAGE_AXES);
const STAGE_SET: ReadonlySet<string> = new Set(DECAY_STAGES);

// ── The single producer ──────────────────────────────────────────────────

/**
 * Build a CiteFlash descriptor. Pure; same inputs → same bytes (modulo
 * caller-supplied ref / now).
 *
 * Validation is shape-only — an invalid axis/stage falls through to a
 * still-renderable descriptor (the flash plays even if the cell is
 * unknown; the arrival fetch will 404 and we fade cleanly). This matches
 * Mike napkin §6 PoI-7: "no user action goes un-acknowledged".
 */
export function describeCiteFlash(inputs: CiteFlashInputs): CiteFlashDescriptor {
  const nonce   = inputs.ref && isValidRef(inputs.ref) ? inputs.ref : mintNonce();
  const axis    = axisOrNull(inputs.axis);
  const stage   = stageOrNull(inputs.stage);
  const payload = axis && stage ? cellCitationPayload(axis, stage, inputs.origin, nonce) : '';
  const curl    = axis && stage ? buildCurl(axis, stage, inputs.origin, nonce) : '';
  const arrival = axis && stage ? buildArrivalUrl(axis, stage, inputs.origin, nonce) : '';
  return freeze(nonce, payload, curl, arrival);
}

// ── Helpers (each ≤ 10 LOC, Sid rule) ────────────────────────────────────

function axisOrNull(raw: string): Axis | null {
  return AXIS_SET.has(raw) ? (raw as Axis) : null;
}

function stageOrNull(raw: string): DecayStage | null {
  return STAGE_SET.has(raw) ? (raw as DecayStage) : null;
}

function freeze(nonce: string, payload: string, curl: string, arrivalUrl: string): CiteFlashDescriptor {
  return {
    classes:    [BASE_CLASS],
    litClass:   LIT_CLASS,
    durationMs: CITE_FLASH_DURATION_MS,
    nonce,
    curl,
    payload,
    arrivalUrl,
    pinnedAtMs: now(),
  };
}

/** Mint a URL-safe nonce. Prefers `crypto.randomUUID` (browser + Node 20);
 *  falls back to Math.random pairs (legacy engines in test harnesses).
 *  The shape matches REF_RE in citation-ref.ts — all three mouths agree. */
export function mintNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** One-line `curl` the ApiAlso chip reveals. Uses --get + --data-urlencode
 *  so the pasted command works in bash, zsh, and Windows cmd (%-escaping
 *  is pushed onto curl, not the shell). */
function buildCurl(axis: Axis, stage: DecayStage, origin: string, ref: string): string {
  const q = `axis=${encodeURIComponent(axis)}&stage=${encodeURIComponent(stage)}&r=${encodeURIComponent(ref)}`;
  return `curl -s "${origin}/api/docs/cite?${q}"`;
}

/** Arrival URL the client fetches to light up the flash. Same shape the
 *  server validates in arrival-receipt.ts. */
function buildArrivalUrl(axis: Axis, stage: DecayStage, origin: string, ref: string): string {
  const q = `axis=${encodeURIComponent(axis)}&stage=${encodeURIComponent(stage)}&r=${encodeURIComponent(ref)}`;
  return `${origin}/api/docs/arrival?${q}`;
}

// ── Isolated-run sanity check (openloop/inplace-testing-howto.md) ─────────

export function _testCiteFlash(): void {
  const d = describeCiteFlash({ axis: 'typography', stage: 'fresh', origin: 'http://x.test', ref: 'abcd1234efgh5678' });
  console.assert(d.classes[0] === 'cite-flash', 'base class');
  console.assert(d.litClass === 'cite-flash--lit', 'lit class');
  console.assert(d.durationMs === 200, 'duration mirror');
  console.assert(d.nonce === 'abcd1234efgh5678', 'ref preserved');
  console.assert(d.curl.includes('/api/docs/cite?'), 'curl shape');
  console.assert(d.arrivalUrl.includes('/api/docs/arrival?'), 'arrival shape');
  console.assert(d.payload.includes('typography × fresh'), 'payload via oracle');
  console.assert(d.pinnedAtMs > 0, 'clock read');
  // Invalid axis: descriptor still renders but payload/curl degrade cleanly.
  const bad = describeCiteFlash({ axis: 'nope', stage: 'fresh', origin: 'http://x', ref: 'ref12345678' });
  console.assert(bad.payload === '', 'invalid axis degrades payload');
  console.assert(bad.curl === '', 'invalid axis degrades curl');
  // Minting: a missing ref produces a REF_RE-valid nonce.
  const minted = describeCiteFlash({ axis: 'border', stage: 'ghost', origin: 'http://x' });
  console.assert(isValidRef(minted.nonce), 'minted nonce passes shared validator');
  console.log('[cite-flash] OK — describeCiteFlash verified');
}

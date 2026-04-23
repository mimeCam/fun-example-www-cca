// src/lib/parity-proof.ts
// v178 "Parity Console" — SSR helper for the Three-Mouths-One-Byte on-page
// demonstrator. One producer, three mouths, one diff line.
//
// What this module owns (Mike napkin §4 "New files"):
//   · buildProof(axis, stage, origin, ref?) — assembles the three mouth
//     payloads and the byte-drift count. Pure-async (one await through the
//     shared handler-dispatch oracle); no fs, no net, no DOM, no clock.
//   · byteDrift(...strings) — pure pairwise byte-length-equality witness.
//     driftBytes === 0 iff every string is byte-identical to the first.
//   · PARITY_PROOF_ORIGIN, defaultProofCell — small re-exports so the SSR
//     caller and the CI guard share the same "default cell" literal.
//
// Rules of the module (Sid §≤10-LOC-per-fn, Mike §3 "zero new deps"):
//   · Pure producer. No new tokens. No new animations. No new endpoints.
//   · `pointer` and `keyboard` BOTH route through cellCitationPayload()
//     — they are not separately computed; the oracle is the single source.
//     The split exists in the UI only (the two mouths invoke the same pure
//     function, so they can never drift).
//   · `curl` routes through curlMouthPayload() in citation-golden.ts, the
//     only path that dispatches a synthetic Response through the handler.
//   · driftBytes is ALWAYS 0 on the happy path — that is the invariant the
//     prebuild guard (check-parity-proof.ts) witnesses for all 35 cells
//     and all VALID_REF_FIXTURES. A non-zero value is a bug.
//
// Credits: Mike Koch (napkin §2 shape, §4 file table, §5 points-of-interest,
//          §8 shipping criteria), Tanya Donska (UX spec §7 tri-mouth proof
//          strip "bring it on-page", §10 zero-new-animations), Elon
//          (§5 "prebuild guards are the moat" — this file is the moat's
//          pure producer), Paul (§7 make-or-break test), AGENTS.md
//          (freeze, one-oracle). Sid — 2026-04-23.
//          Motto: "code maintenance without tests."

import {
  cellCitationPayload,
  cellCitationLabel,
  cellAnchorId,
  STAGE_AXES,
} from './stage-axes';
import type { Axis } from './stage-axes';
import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';
import { curlMouthPayload, SENTINEL_ORIGIN } from './citation-golden';

// ── Default cell (Mike §5.6 — first cell the visitor sees) ───────────────

/** The console's rest-state cell — `typography × fresh`, the grid's
 *  origin. Shared between SSR default, prebuild guard, and tests. */
export const DEFAULT_PROOF_AXIS:  Axis       = 'typography';
export const DEFAULT_PROOF_STAGE: DecayStage = 'fresh';

/** The origin used when the SSR caller has no request-time origin (tests,
 *  prebuild guard). RFC-6761 `.test` host — same discipline as
 *  citation-golden. Runtime callers supply `Astro.url.origin` instead. */
export const PARITY_PROOF_ORIGIN: string = SENTINEL_ORIGIN;

// ── Shape (the unit the <ParityConsole /> renders) ───────────────────────

/** One proof packet — three mouth payloads + the byte-drift witness.
 *  Shape-only: the invariant is `driftBytes === 0` on the happy path. */
export interface ParityProof {
  readonly axis:       Axis;
  readonly stage:      DecayStage;
  readonly ref:        string | null;
  readonly label:      string;
  readonly anchor:     string;
  readonly pointer:    string;
  readonly keyboard:   string;
  readonly curl:       string;
  readonly driftBytes: number;
}

// ── Pure diff — the single non-trivial transformation on this module ─────

/** Byte-drift witness. Returns 0 iff every string is byte-identical to
 *  the first; otherwise returns `max(|len-base|, 1)` for each differing
 *  string, summed. Pure, ≤10 LoC, unit-tested. */
export function byteDrift(...strings: readonly string[]): number {
  if (strings.length < 2) return 0;
  const base = strings[0];
  const baseLen = utf8ByteLength(base);
  let drift = 0;
  for (let i = 1; i < strings.length; i++) {
    if (strings[i] === base) continue;
    drift += Math.max(Math.abs(utf8ByteLength(strings[i]) - baseLen), 1);
  }
  return drift;
}

/** UTF-8 byte length — TextEncoder is the WHATWG standard. Isolated
 *  so `byteDrift` stays ≤10 LoC. */
function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

// ── Producer — the one oracle, three mouths, one proof ───────────────────

/**
 * Assemble the three mouth payloads for a single cell.
 *
 * `pointer` and `keyboard` BOTH route through cellCitationPayload(); they
 * are the two client-side mouths and intentionally share the same symbol
 * (the UI split is for the reader — the bytes are one oracle). `curl`
 * dispatches through the handler via curlMouthPayload().
 *
 * Async because curlMouthPayload awaits a Response body; the pointer +
 * keyboard legs are synchronous. `driftBytes` is computed from all three.
 */
export async function buildProof(
  axis: Axis, stage: DecayStage, origin: string, ref?: string,
): Promise<ParityProof> {
  const refArg = ref ?? undefined;
  const pointer  = cellCitationPayload(axis, stage, origin, refArg);
  const keyboard = cellCitationPayload(axis, stage, origin, refArg);
  const curl     = await curlMouthPayload(axis, stage, origin, refArg);
  return assembleProof(axis, stage, refArg, pointer, keyboard, curl);
}

/** Pure assembler — keeps buildProof ≤10 LoC. No I/O; every argument is
 *  a string already realised by the caller. */
export function assembleProof(
  axis: Axis, stage: DecayStage, ref: string | undefined,
  pointer: string, keyboard: string, curl: string,
): ParityProof {
  return {
    axis, stage,
    ref:        ref ?? null,
    label:      cellCitationLabel(axis, stage),
    anchor:     cellAnchorId(axis, stage),
    pointer, keyboard, curl,
    driftBytes: byteDrift(pointer, keyboard, curl),
  };
}

/** The 35-cell sweep the prebuild guard exercises — same shape as
 *  citationGolden() but yields the full proof per row. Pure async. */
export async function proofSweep(origin: string): Promise<readonly ParityProof[]> {
  const out: ParityProof[] = [];
  for (const axis of STAGE_AXES) {
    for (const stage of DECAY_STAGES) {
      out.push(await buildProof(axis, stage, origin));
    }
  }
  return out;
}

// ── SSR convenience ──────────────────────────────────────────────────────

/** The default proof for the docs page — `typography × fresh`, no ref.
 *  Runtime callers pass `Astro.url.origin`; tests pass SENTINEL_ORIGIN. */
export function defaultProof(origin: string): Promise<ParityProof> {
  return buildProof(DEFAULT_PROOF_AXIS, DEFAULT_PROOF_STAGE, origin);
}

/** Human-readable diff line — `0 bytes · pointer ≡ keyboard ≡ curl` at
 *  rest, else `<N> bytes drift`. Tanya §10 / Mike §5.5 — motion narrates
 *  drift only; at rest the sentence IS the signal. */
export function diffSentence(p: ParityProof): string {
  if (p.driftBytes === 0) return '0 bytes · pointer ≡ keyboard ≡ curl';
  return `${p.driftBytes} bytes drift`;
}

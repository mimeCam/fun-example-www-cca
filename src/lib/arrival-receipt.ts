// src/lib/arrival-receipt.ts
// v177 "Arrival Receipt" — single producer for the /api/docs arrival handshake.
//
// One pure function, three mouths (same design law as stage-axes.ts,
// parity-seal.ts, tri-mouth-inventory.ts):
//   · Mouth A — SSR HTML on /api/docs?r=<nonce>   (ArrivalReceipt.astro).
//   · Mouth B — JSON at GET /api/docs/arrival     (thin route handler).
//   · Mouth C — client pulse trigger              (arrival-acknowledge.ts).
//
// Invariants (Mike napkin §3 / §5):
//   · Pure. No fs, no DOM, no network, no side effects. SSR + browser-safe.
//   · `now` is NEVER raw here — imported from src/lib/clock.ts so the
//     middleware pin wins at request time (advances the 80→0 scoreboard).
//   · One producer, three mouths — any caller that assembles the receipt
//     shape by hand is a bug (check-citation-delegation style rule).
//   · Stateless. No nonce table, no DB round-trip. Validation is shape
//     only (REF_RE via citation-ref.ts); a valid nonce with an unknown
//     cell degrades to `{ ok:false, reason:'unknown-cell' }` — not 500.
//
// Anti-scope (Sid §10-line rule, Mike §5.9):
//   · No new tokens. The receipt's visual dock uses existing motion.css
//     + tokens.css; this module ships no CSS.
//   · No staleness check yet. The current nonce grammar (REF_RE) is
//     opaque — refs don't carry their own timestamp. A future rev can
//     add a `stale` reason when the grammar gains an epoch suffix.
//     // TODO: once ref grammar grows an epoch suffix, return 'stale'
//     //       for refs older than 30 days. See Mike napkin §5.3.
//   · No arrival counter. Ledger writes stay with /api/ingest/cell-event.
//
// Credits: Mike Koch (napkin "Arrival Receipt" — one producer, three
//          mouths, stateless nonce, pinned clock), Tanya Donska (UX §4.2
//          "the receipt is the reward", §7 motion roster), Paul Kim
//          (copy→arrive→verify handshake must be observable end-to-end),
//          Elon (§5.10 falsifiable criterion — byte-identical panel data-
//          attr vs curl body), prior authors of stage-axes.ts + parity-
//          seal.ts (the shape this module mirrors), AGENTS.md freeze.
//          Sid — 2026-04-23. Motto: "code maintenance without tests."

import { STAGE_AXES, cellAnchorId, cellCitationLabel } from './stage-axes';
import type { Axis } from './stage-axes';
import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';
import { isValidRef } from './citation-ref';
import { parityJsonField } from './parity-seal';
import type { ParityJsonField } from './parity-seal';
import { now } from './clock';

// ── Reason vocabulary (closed, grep-friendly) ───────────────────────────

/** Why an arrival receipt failed to build. Closed set — callers do not
 *  invent new reasons. The HTTP route maps each to a status code. */
export const ARRIVAL_REASONS = ['malformed', 'unknown-cell'] as const;
export type ArrivalReason = typeof ARRIVAL_REASONS[number];

// ── Shapes ──────────────────────────────────────────────────────────────

/** The one-cell coordinate pair carried on a happy receipt. `anchor`
 *  is denormalised from `(axis, stage)` so every mouth can paint the
 *  `#axis-…-stage-…` hash without re-deriving it. */
export interface ArrivalCell {
  readonly axis:   Axis;
  readonly stage:  DecayStage;
  readonly anchor: string;
}

/** Happy receipt — the cite that arrived is on this (cell, ref), pinned
 *  at the SSR clock. `parity` is the same tri-mouth witness the cite
 *  endpoint emits; curl observers can tell at-a-glance whether the
 *  inventory was green at the moment the arrival was acknowledged. */
export interface ArrivalReceiptOk {
  readonly ok:       true;
  readonly cell:     ArrivalCell;
  readonly label:    string;
  readonly ref:      string;
  readonly pinnedAt: string;
  readonly parity:   ParityJsonField;
}

/** Closed-reason failure. No stack trace, no user-visible `error` field. */
export interface ArrivalReceiptFail {
  readonly ok:     false;
  readonly reason: ArrivalReason;
}

/** Discriminated union — callers switch on `ok` to fork. */
export type ArrivalReceipt = ArrivalReceiptOk | ArrivalReceiptFail;

/** Inputs accepted by `buildArrivalReceipt`. All three nullable so a
 *  URL parser can pass `searchParams.get(...)` output verbatim. */
export interface ArrivalInputs {
  readonly axis:   string | null;
  readonly stage:  string | null;
  readonly ref:    string | null;
  /** Optional clock override for tests. Defaults to `now()`. */
  readonly nowMs?: number;
}

// ── Frozen validation sets (derived once) ───────────────────────────────

const AXIS_SET:  ReadonlySet<string> = new Set(STAGE_AXES);
const STAGE_SET: ReadonlySet<string> = new Set(DECAY_STAGES);

// ── HTTP status mapping (closed, testable) ──────────────────────────────

/** HTTP status code for a given failure reason. Kept beside the shape so
 *  the route handler never hand-rolls a number for a known reason. */
export function statusForReason(r: ArrivalReason): number {
  if (r === 'malformed')    return 400;
  if (r === 'unknown-cell') return 404;
  // Exhaustiveness — any new reason that forgets a status lands here.
  return 500;
}

// ── The single producer ─────────────────────────────────────────────────

/** Build an arrival receipt. Pure, stateless; same inputs → same bytes.
 *  Validation order matches Mike napkin §5.8 (malformed first, then
 *  unknown-cell): a bad ref is shape-wrong regardless of axis/stage. */
export function buildArrivalReceipt(inputs: ArrivalInputs): ArrivalReceipt {
  if (!isValidRef(inputs.ref)) return fail('malformed');
  if (inputs.axis === null || inputs.stage === null) return fail('malformed');
  if (!AXIS_SET.has(inputs.axis) || !STAGE_SET.has(inputs.stage)) {
    return fail('unknown-cell');
  }
  const at = inputs.nowMs ?? now();
  return ok(inputs.axis as Axis, inputs.stage as DecayStage, inputs.ref as string, at);
}

// ── Serialisation — stable key order across mouths ──────────────────────

/** Serialise a receipt to bytes. Stable key order: node + browser both
 *  preserve insertion order, and this helper builds a fresh object with
 *  a fixed order so the cite mouth (curl) and the panel mouth (data-
 *  attr) can be compared byte-for-byte by the golden test. */
export function serializeArrivalReceipt(r: ArrivalReceipt): string {
  return r.ok ? JSON.stringify(orderedOk(r)) : JSON.stringify(orderedFail(r));
}

// ── Helpers (each ≤ 10 LoC, Sid rule) ───────────────────────────────────

function fail(reason: ArrivalReason): ArrivalReceiptFail {
  return { ok: false, reason };
}

function ok(axis: Axis, stage: DecayStage, ref: string, nowMs: number): ArrivalReceiptOk {
  return {
    ok: true,
    cell: { axis, stage, anchor: cellAnchorId(axis, stage) },
    label: cellCitationLabel(axis, stage),
    ref,
    pinnedAt: new Date(nowMs).toISOString(),
    parity: parityJsonField(),
  };
}

/** Fresh object with fixed key order — stability anchor for the bytes. */
function orderedOk(r: ArrivalReceiptOk): Record<string, unknown> {
  return {
    ok: true,
    cell: { axis: r.cell.axis, stage: r.cell.stage, anchor: r.cell.anchor },
    label: r.label,
    ref: r.ref,
    pinnedAt: r.pinnedAt,
    parity: r.parity,
  };
}

/** Fail shape is two fields — still ordered so bytes match the test. */
function orderedFail(r: ArrivalReceiptFail): Record<string, unknown> {
  return { ok: false, reason: r.reason };
}

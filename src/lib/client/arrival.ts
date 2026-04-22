// src/lib/client/arrival.ts
// v154 — arrival sub-system for the 7×5 grammar matrix. Extracted from
// cell-cite.ts so the "curl mouth" of the citation trilogy has its own
// module — no more temptation to reach into the keystroke vocabulary.
//
// Scope (Mike napkin §2, Tanya UX spec §2):
//   · `paintArrival()`    orchestrator — called on DOMContentLoaded and
//                         `hashchange`. Pure DOM wiring; zero state.
//   · `readRef()`         URL → validated nonce | null.
//   · `markShared()`      when `readRef() !== null`, add `.cell--arrived-
//                         -shared` for the ARRIVAL_MS beat. The CSS paints
//                         a stage-colored `↙` glyph top-left — a
//                         cell-local affordance that says "this came TO
//                         you" without recycling the keyboard legend.
//   · `retireCompetingGlows(cell)` / `triggerArrival(cell)` /
//     `reportArrival(cell)` — private helpers, kept here because they
//     are the single-responsibility nucleus of an arrival beat.
//
// Invariant fence (v154, AGENTS.md amendment):
//   ─────────────────────────────────────────────────────────────────
//   arrival.ts does NOT import ds-kbd-lit. Ever.
//   · The chip-lit contract (v153) stays sacred: chip ⇔ taught-key
//     gesture by *this* user.
//   · The shared-arrival contract (v154) lives on the cell, not the
//     legend: `.cell--arrived-shared` ⇔ valid `?r=<nonce>` round-trip.
//   · `scripts/check-no-chip-lit-in-arrival.ts` greps this file every
//     prebuild; a reference to `ds-kbd-lit` / `lightForKey` /
//     `unlightForKey` fails the build.
//
// Non-duties (deliberate):
//   · NO new tokens, durations, curves. `--motion-snap-duration` +
//     `--cell-arrival-ring` already teach the visual language.
//   · NO listener registration of its own (the callers — cell-cite.ts
//     boot path and test harnesses — own that). `paintArrival()` is
//     pure-DOM and idempotent.
//   · NO new endpoints. `beacon('arrive', axis, stage, ref)` is the
//     ledger signal that already exists.
//
// Credits: Mike (napkin §2 extraction shape, §5.3 markShared one-shot
//          pattern, §5.6 ledger untouched, §0 "polymorphism is a
//          killer"), Tanya (UX spec §2.1 anatomy — top-left `↙`, §2.2
//          motion parasitic on the bloom, §2.3 toast reuse, §4 outline/
//          shadow channel audit), Elon (report 32 — "new meaning earns
//          new pixels"), Paul Kim (the gap framing — silent arrival =
//          broken invite loop), v152/v153 authors (discipline they
//          installed). Sid — 2026-04-22. Motto: "code maintenance
//          without tests."

// ── Selectors & class names ──────────────────────────────────────────────

const CELL_SEL      = '.api-docs__matrix-cell';
const ARRIVED       = 'cell--arrived';
const ARRIVED_SHARED = 'cell--arrived-shared';     // v154 — Tanya §2.1
const CONFIRMING    = 'cell--confirming';          // v152
const HASH_RE       = /^#axis-[a-z-]+-stage-[a-z-]+$/;

// ── Ref (nonce) grammar — promoted to src/lib/citation-ref.ts in v156 ────
// arrival.ts no longer owns the regex literal; the shared module is the
// single source every mouth (click, keystroke, curl, ingest) validates
// against. Re-exporting `isValidRef` keeps arrival.test.ts's existing
// imports byte-stable (Mike §10 "delete without breaking callers").

import { REF_PARAM, isValidRef } from '../citation-ref';
export { isValidRef };

// ── Beat — owned here; cell-cite.ts re-exports for snapshot tests ───────

/** Stage-keyed bloom hold (incl. fossil). The shared-arrival badge
 *  is parasitic on this beat — one source of truth, one removal timer. */
export const ARRIVAL_MS = 1200;

// ── Ingest beacon (moved intact from cell-cite.ts so the arrival voice
//    owns its own ledger wire). `beacon('arrive', …)` fires from here. */

const INGEST_URL = '/api/ingest/cell-event';

// ── Pure helpers (each ≤ 10 lines, one responsibility) ──────────────────

/** Parse `?r=<ref>` off location.search; null if malformed or absent.
 *  Delegates shape validation to `isValidRef` (src/lib/citation-ref.ts)
 *  so the browser parser and the server validator can never drift.   */
export function readRef(): string | null {
  try {
    const ref = new URL(window.location.href).searchParams.get(REF_PARAM);
    return isValidRef(ref) ? ref : null;
  } catch {
    return null;
  }
}

/** Extract (axis, stage) from a cell element's dataset. */
function readCellCoord(cell: HTMLElement): { axis: string; stage: string } | null {
  const axis  = cell.dataset.axis       ?? '';
  const stage = cell.dataset.decayStage ?? '';
  if (!axis || !stage) return null;
  return { axis, stage };
}

/** Prefer sendBeacon (survives page-unload); fall back to fetch keepalive. */
function sendIngest(body: string): void {
  const type = 'application/json';
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    navigator.sendBeacon(INGEST_URL, new Blob([body], { type }));
    return;
  }
  void fetch(INGEST_URL, { method: 'POST', body, headers: { 'Content-Type': type }, keepalive: true });
}

/** Fire-and-forget POST to the ingest endpoint. Must never throw. */
function beaconArrive(axis: string, stage: string, ref: string): void {
  if (!axis || !stage || !ref) return;
  try {
    sendIngest(JSON.stringify({ event: 'arrive', axis, stage, ref, ts: Date.now() }));
  } catch {
    // Intentional no-op: analytics must never block the arrival beat.
  }
}

// ── DOM painters (each ≤ 10 lines) ──────────────────────────────────────

/** Clear `.cell--arrived` from every cell except `keep`. */
function retireOtherArrived(keep: HTMLElement): void {
  document
    .querySelectorAll<HTMLElement>(`.${ARRIVED}`)
    .forEach((el) => { if (el !== keep) el.classList.remove(ARRIVED); });
}

/** Clear `.cell--confirming` from every cell except `keep`. v152 Mike §B. */
function retireOtherConfirming(keep: HTMLElement): void {
  document
    .querySelectorAll<HTMLElement>(`.${CONFIRMING}`)
    .forEach((el) => { if (el !== keep) el.classList.remove(CONFIRMING); });
}

/** Clear `.cell--arrived-shared` from every cell except `keep`. v154. */
function retireOtherShared(keep: HTMLElement): void {
  document
    .querySelectorAll<HTMLElement>(`.${ARRIVED_SHARED}`)
    .forEach((el) => { if (el !== keep) el.classList.remove(ARRIVED_SHARED); });
}

/** v152 Mike §B — retire every competing glow so rapid-fire arrivals coalesce. */
export function retireCompetingGlows(keep: HTMLElement): void {
  retireOtherArrived(keep);
  retireOtherConfirming(keep);
  retireOtherShared(keep);
}

/** Restart the arrival bloom cleanly: remove, reflow, re-add, schedule off. */
export function triggerArrival(cell: HTMLElement): void {
  cell.classList.remove(ARRIVED);
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void cell.offsetWidth;                           // reflow — restart animation
  cell.classList.add(ARRIVED);
  scheduleClassRemoval(cell, ARRIVED, 'arrivedTimer');
}

/** v154 — one-shot shared-arrival badge. Symmetric with triggerArrival:
 *  rapid-fire on the same cell resets the timer; competing cells lapse. */
export function markShared(cell: HTMLElement): void {
  cell.classList.add(ARRIVED_SHARED);
  scheduleClassRemoval(cell, ARRIVED_SHARED, 'sharedTimer');
}

/** Per-cell timer discipline — cancel any prior id, then schedule removal.
 *  Symmetric with scheduleConfirmRemoval in cell-cite.ts (Mike §5.3). */
function scheduleClassRemoval(cell: HTMLElement, cls: string, key: string): void {
  const prev = Number(cell.dataset[key] ?? '0');
  if (prev) window.clearTimeout(prev);
  const id = window.setTimeout(() => cell.classList.remove(cls), ARRIVAL_MS);
  cell.dataset[key] = String(id);
}

// ── Arrival toast (Tanya UX spec §2.3) ──────────────────────────────────

const TOAST_SEL = '[data-cell-toast]';
const TOAST_VIS = 'is-visible';
const ARRIVAL_TOAST_MS = 1800;                     // matches TOAST_MS

/** Announce the shared-arrival receipt via the existing aria-live toast.
 *  Grammar mirrors the copy-toast: "copied: X at Y" → "shared citation
 *  received: X at Y". Reuses the same DOM node; no extra region. */
function announceShared(axis: string, stage: string): void {
  const toast = document.querySelector<HTMLElement>(TOAST_SEL);
  if (!toast) return;
  toast.textContent = `shared citation received: ${axis} at ${stage}`;
  toast.classList.add(TOAST_VIS);
  scheduleToastHide(toast);
}

function scheduleToastHide(toast: HTMLElement): void {
  const prev = Number(toast.dataset.hideTimer ?? '0');
  if (prev) window.clearTimeout(prev);
  const id = window.setTimeout(() => toast.classList.remove(TOAST_VIS), ARRIVAL_TOAST_MS);
  toast.dataset.hideTimer = String(id);
}

// ── Orchestrator (Tanya §2.4, Mike §5.9) ────────────────────────────────

/** Resolve the cell targeted by the current `location.hash`; null if
 *  the hash is malformed or no DOM element matches. */
function resolveHashCell(): HTMLElement | null {
  const hash = window.location.hash;
  if (!HASH_RE.test(hash)) return null;
  const cell = document.getElementById(hash.slice(1));
  return cell?.matches(CELL_SEL) ? cell : null;
}

/** Fire the arrive beacon iff the hash+ref combo is complete. */
function reportArrival(cell: HTMLElement, ref: string | null): void {
  if (!ref) return;
  const coord = readCellCoord(cell);
  if (!coord) return;
  beaconArrive(coord.axis, coord.stage, ref);
}

/**
 * Paint the arrival beat on the cell targeted by `location.hash`.
 *
 * Contract:
 *   · hash absent / malformed / no matching cell → no-op.
 *   · hash present, no `?r=<nonce>`            → bloom + beacon skipped.
 *   · hash present, valid `?r=<nonce>`         → bloom + shared badge +
 *                                                 toast + beacon.
 *
 * Idempotent on re-entry (hashchange fires repeatedly when a reader
 * clicks the same anchor): prior timers are cancelled, no stacking.
 */
export function paintArrival(): void {
  const cell = resolveHashCell();
  if (!cell) return;
  const ref = readRef();
  retireCompetingGlows(cell);
  triggerArrival(cell);
  if (ref) {
    markShared(cell);
    const coord = readCellCoord(cell);
    if (coord) announceShared(coord.axis, coord.stage);
  }
  reportArrival(cell, ref);
}

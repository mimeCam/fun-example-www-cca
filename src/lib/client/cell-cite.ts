// src/lib/client/cell-cite.ts
// Copy-cell-anchor citation ritual — the 7×5 grammar matrix's outgoing
// and incoming half. One click → clipboard + toast. One hashchange →
// stage-keyed arrival bloom (delegated to arrival.ts, v154).
//
// Architecture (Mike napkin §2):
//   · Buttons carry `data-cell-citation` + `data-cell-url` set by SSR.
//   · Click delegation reads them → clipboard + toast + optional beacon.
//   · Arrival lives in src/lib/client/arrival.ts (v154 extraction —
//     Mike napkin "New meaning earns new pixels"). This file wires the
//     `hashchange` listener; the painter is imported.
//
// v151b — keystroke cite (Mike napkin §3, Tanya §3/§4): the same
// .api-docs__matrix delegation also accepts `c` / Enter / Space on a
// focused cell, routing to the same `handleCopy` as the mouse click.
// Cmd/Ctrl/Alt+<key> combos are let through untouched (Tanya §10 —
// native copy must not be stolen). `e.preventDefault()` stops Space
// from scrolling and Enter from submitting an enclosing form.
//
// v154 — arrival extraction (Mike napkin §2, Tanya UX spec §0):
// `paintArrival`, `readRef`, `triggerArrival`, `retireCompetingGlows`,
// `markShared`, and the `arrive`-event beacon moved to arrival.ts. This
// module KEEPS: click delegation, keystroke cite (chip-lit feedback),
// the cell-confirm ring on cite, the copy-toast + copy-beacon. The
// chip-lit contract (v153) is unchanged; arrival.ts is prohibited from
// importing `ds-kbd-lit` by `check-no-chip-lit-in-arrival.ts`.
//
// Non-negotiable (Paul): the clipboard *string* is the product. The
// toast and the bloom make the string believable.
//
// Credits: Mike (napkin §2, §5.8 event delegation, §5.9 dual-trigger
//          arrival, §3 v151b keybinding, v154 §2 extraction + invariant
//          fence), Tanya (§4 sequenced feedback, §5 stage-keyed arrival,
//          v154 UX spec §2 cell-local badge), Elon (§4.1 single-line
//          payload, v154 report 32 "new meaning earns new pixels"),
//          Paul (§non-negotiable + CAR metric, v151b string-parity vow),
//          Sid (§simplify — one module, ten 10-line fns).

import { cellCitationPayload } from '../stage-axes';
import type { Axis } from '../stage-axes';
import type { DecayStage } from '../decay-engine';
// v153 Tanya §3.3 — chip-lit feedback. Pure helper; does not own listeners.
import { lightForKey } from './ds-kbd-lit';
// v154 Mike §2 — arrival sub-system (extracted). Delegation, not reach-in:
// cell-cite.ts wires the listener; arrival.ts owns every paint + beacon.
import {
  paintArrival,
  retireCompetingGlows,
  ARRIVAL_MS as ARRIVAL_MS_BEAT,
} from './arrival';

// ── Selectors & keys ─────────────────────────────────────────────────────

const MATRIX_SEL  = '.api-docs__matrix';
const CELL_SEL    = '.api-docs__matrix-cell';
const BTN_SEL     = '[data-cell-copy]';
const TOAST_SEL   = '[data-cell-toast]';
const CONFIRMING  = 'cell--confirming';   // v152 Mike §A — foveal confirm
const CONFIRMED   = 'cell-copy--confirmed';
const TOAST_VIS   = 'is-visible';

// Timing constants — snapshotted in cell-confirm.test.ts. Do not tune
// one without documenting the perceptual reason in the PR body (Mike §6).
// ARRIVAL_MS is re-exported from arrival.ts so cell-confirm.test.ts keeps
// its byte-stable import path (v154 extraction — single source, one beat).
export const ARRIVAL_MS       = ARRIVAL_MS_BEAT;
export const TOAST_MS         = 1800;   // Tanya §4b linger window
export const CONFIRM_MS       = 1200;   // Tanya §4a button icon-swap duration
export const CITE_CONFIRM_MS  = 1200;   // v152 Mike §A — cell confirm ring
// v153 Tanya §3.3 — chip lit duration. Matches --motion-snap-duration
// in tokens; the CSS transition + this timeout finish at the same beat.
export const CHIP_LIT_MS      = 120;

// v151b — keystroke cite (Mike napkin §3.1). Three keys, one handler.
// Disjoint from matrix-keynav's NAV_KEYS so the two listeners never
// race (Tanya §6 no merge, Mike §5.9). Lowercase-only: Shift+C is a
// cite (capital letter, not a chord); Cmd/Ctrl+C goes to native copy.
const CITE_KEYS: ReadonlySet<string> = new Set<string>(['c', 'Enter', ' ']);

// v150c — cell-event ledger wire. Mike napkin §3: event-shape frozen.
// The arrive beacon moved to arrival.ts (v154); the copy beacon stays
// here because it fires from handleCopy, not paintArrival.
const INGEST_URL  = '/api/ingest/cell-event';

// ── Boot ──────────────────────────────────────────────────────────────────

/** Wire up the matrix. Safe on pages that have no matrix (no-op). */
export function initCellCite(): void {
  const matrix = document.querySelector<HTMLElement>(MATRIX_SEL);
  if (!matrix) return;
  const toast = document.querySelector<HTMLElement>(TOAST_SEL);
  matrix.addEventListener('click',   (e) => onMatrixClick(e, toast));
  matrix.addEventListener('keydown', (e) => onMatrixKey(e, toast));
  window.addEventListener('hashchange', paintArrival);
  paintArrival();
}

// ── Click handling ────────────────────────────────────────────────────────

function onMatrixClick(e: Event, toast: HTMLElement | null): void {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(BTN_SEL);
  if (!btn) return;
  e.preventDefault();
  void handleCopy(btn, toast);
}

// ── v151b keystroke handling (Mike napkin §3.1, Tanya §3) ─────────────────

/**
 * Pure predicate — true when a KeyboardEvent should cite the focused
 * cell. Rejects all modifier combos so Cmd+C / Ctrl+C fall through to
 * the browser's native copy handler (Tanya §4.1, §10). Shift+C still
 * cites (capital letter is a letter, not a chord). No JSDOM; pure fn.
 */
export function isCiteKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return CITE_KEYS.has(e.key);
}

/**
 * From a keyboard event whose target is somewhere inside a matrix cell,
 * resolve the cell's copy button (or null). Mirrors matrix-keynav's
 * `resolveCurrentCell` shape — one convention, two modules (Mike §5.9).
 */
function resolveCellCopyBtn(e: KeyboardEvent): HTMLButtonElement | null {
  const cell = (e.target as HTMLElement | null)?.closest<HTMLElement>(CELL_SEL);
  return cell?.querySelector<HTMLButtonElement>(BTN_SEL) ?? null;
}

/** Route a cite keystroke into the same handleCopy the click takes. */
function onMatrixKey(e: KeyboardEvent, toast: HTMLElement | null): void {
  if (!isCiteKey(e)) return;
  const btn = resolveCellCopyBtn(e);
  if (!btn) return;
  e.preventDefault();      // Space: no page-scroll. Enter: no form-submit.
  // v153 Tanya §3.3 — breathe the matching chip for one snap beat.
  lightForKey(e.key, CHIP_LIT_MS);
  void handleCopy(btn, toast);
}

async function handleCopy(btn: HTMLButtonElement, toast: HTMLElement | null): Promise<void> {
  const axis  = btn.dataset.cellAxis  ?? '';
  const stage = btn.dataset.cellStage ?? '';
  if (!axis || !stage) return;
  // Build payload at copy time — prerendered HTML never bakes in a host.
  const ref = mintRef();
  const payload = cellCitationPayload(axis as Axis, stage as DecayStage, window.location.origin, ref);
  const ok = await copyTextSafe(payload);
  if (!ok) return;
  confirmButton(btn);
  announce(toast, axis, stage);
  markConfirmingForBtn(btn);                  // v152 Mike §A — foveal ring
  beaconCopy(axis, stage, ref);
}

/** v152 Mike §A — resolve the btn's owning cell, then paint the confirm ring. */
function markConfirmingForBtn(btn: HTMLButtonElement): void {
  const cell = btn.closest<HTMLElement>(CELL_SEL);
  if (!cell) return;
  markConfirming(cell);
}

// Local re-import of the shared helper as a thin wrapper keeps the bundle
// graph obvious; the compiler will fold it.
async function copyTextSafe(text: string): Promise<boolean> {
  const { copyText } = await import('./clipboard');
  return copyText(text);
}

// ── Button confirm (Tanya §4a) ────────────────────────────────────────────

function confirmButton(btn: HTMLButtonElement): void {
  btn.classList.add(CONFIRMED);
  window.setTimeout(() => btn.classList.remove(CONFIRMED), CONFIRM_MS);
}

// ── Toast (Tanya §4b) ─────────────────────────────────────────────────────

function announce(toast: HTMLElement | null, axis: string, stage: string): void {
  if (!toast) return;
  // Elon §4.4 — "at" reads cleanly in every screen reader.
  toast.textContent = `copied: ${axis} at ${stage}`;
  toast.classList.add(TOAST_VIS);
  scheduleToastHide(toast);
}

function scheduleToastHide(toast: HTMLElement): void {
  const prev = Number(toast.dataset.hideTimer ?? '0');
  if (prev) window.clearTimeout(prev);
  const id = window.setTimeout(() => toast.classList.remove(TOAST_VIS), TOAST_MS);
  toast.dataset.hideTimer = String(id);
}

// ── Cell confirm ring (v152 Mike §A) ─────────────────────────────────────
// Arrival (bloom, shared badge, beacon) lives in arrival.ts now. This
// block keeps ONLY the foveal confirm ring — the receipt the user sees
// when THEY cite (mouse or keystroke). Arrival is a separate voice
// (v154), painted by paintArrival() from arrival.ts.

/** v152 Mike §A — paint the foveal confirm ring on the focused cell.
 *  On rapid-fire cites, a second call on the SAME cell resets the timer.
 *  `retireCompetingGlows` is imported from arrival.ts — one implementation
 *  of the cleanup pass, reused by both mouths (cite + arrival).          */
function markConfirming(cell: HTMLElement): void {
  retireCompetingGlows(cell);
  cell.classList.add(CONFIRMING);
  scheduleConfirmRemoval(cell);
}

function scheduleConfirmRemoval(cell: HTMLElement): void {
  const prev = Number(cell.dataset.confirmTimer ?? '0');
  if (prev) window.clearTimeout(prev);
  const id = window.setTimeout(
    () => cell.classList.remove(CONFIRMING),
    CITE_CONFIRM_MS,
  );
  cell.dataset.confirmTimer = String(id);
}

// ── Copy ingest beacon (v150c — Mike napkin §2/§4, Paul round-trip) ──────
// The arrive beacon lives in arrival.ts (v154). This module keeps the
// copy-side twin because it fires from handleCopy — keystroke or click
// both route here and feed the ledger's other leg.

/** Client-generated nonce that joins copy→arrive without a login. */
function mintRef(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Legacy-browser fallback: 16 hex chars from Math.random (still REF_RE-safe).
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** Fire-and-forget POST to the ingest endpoint. Must never throw. */
function beaconCopy(axis: string, stage: string, ref: string): void {
  if (!axis || !stage || !ref) return;
  try {
    sendIngest(JSON.stringify({ event: 'copy', axis, stage, ref, ts: Date.now() }));
  } catch {
    // Intentional no-op: analytics must never block the citation ritual.
  }
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

// ── Auto-boot on DOMContentLoaded (deferred module) ───────────────────────
// SSR-safe: the `typeof document` guard lets this module be imported by
// node-test / unit tests (where pure helpers like `isCiteKey` are all we
// exercise) without synthesising a DOM. Matches matrix-keynav.ts shape.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCellCite, { once: true });
  } else {
    initCellCite();
  }
}

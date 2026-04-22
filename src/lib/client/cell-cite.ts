// src/lib/client/cell-cite.ts
// Copy-cell-anchor citation ritual — the 7×5 grammar matrix's outgoing
// and incoming half. One click → clipboard + toast. One hashchange →
// stage-keyed arrival bloom. 35 cells, one delegated listener, one
// aria-live region. Vanilla TS, zero dependencies.
//
// Architecture (Mike napkin §2):
//   · Buttons carry `data-cell-citation` + `data-cell-url` set by SSR.
//   · Click delegation reads them → clipboard + toast + optional beacon.
//   · Arrival handler listens to DOMContentLoaded + hashchange — a
//     cell whose id matches `location.hash` receives .cell--arrived
//     for the duration of its own stage, then releases.
//
// v151b — keystroke cite (Mike napkin §3, Tanya §3/§4): the same
// .api-docs__matrix delegation also accepts `c` / Enter / Space on a
// focused cell, routing to the same `handleCopy` as the mouse click.
// No new module, no new endpoint, no new CSS, no new animation.
// Cmd/Ctrl/Alt+<key> combos are let through untouched (Tanya §10 —
// native copy must not be stolen). `e.preventDefault()` stops Space
// from scrolling and Enter from submitting an enclosing form.
//
// Non-negotiable (Paul): the clipboard *string* is the product. The
// toast and the bloom make the string believable.
//
// Credits: Mike (napkin §2, §5.8 event delegation, §5.9 dual-trigger
//          arrival, §3 v151b keybinding), Tanya (§4 sequenced feedback,
//          §5 stage-keyed arrival, §7 reveal rules, §8 ARIA, v151b
//          UX spec §3/§4/§6/§10), Elon (§4.1 single-line payload,
//          §4.2 fossil-still-arrives, §4.4 "at" wording, §4.6 instrument
//          before celebrate, v151b §10 no new mythology), Paul
//          (§non-negotiable + CAR metric, v151b string-parity vow),
//          Sid (§simplify — one module, ten 10-line fns).

import { cellCitationPayload } from '../stage-axes';
import type { Axis } from '../stage-axes';
import type { DecayStage } from '../decay-engine';

// ── Selectors & keys ─────────────────────────────────────────────────────

const MATRIX_SEL  = '.api-docs__matrix';
const CELL_SEL    = '.api-docs__matrix-cell';
const BTN_SEL     = '[data-cell-copy]';
const TOAST_SEL   = '[data-cell-toast]';
const ARRIVED     = 'cell--arrived';
const CONFIRMED   = 'cell-copy--confirmed';
const TOAST_VIS   = 'is-visible';
const HASH_RE     = /^#axis-[a-z-]+-stage-[a-z-]+$/;
const ARRIVAL_MS  = 1200;        // covers stage durations incl. fossil hold
const TOAST_MS    = 1800;        // Tanya §4b linger window
const CONFIRM_MS  = 1200;        // Tanya §4a icon-swap duration

// v151b — keystroke cite (Mike napkin §3.1). Three keys, one handler.
// Disjoint from matrix-keynav's NAV_KEYS so the two listeners never
// race (Tanya §6 no merge, Mike §5.9). Lowercase-only: Shift+C is a
// cite (capital letter, not a chord); Cmd/Ctrl+C goes to native copy.
const CITE_KEYS: ReadonlySet<string> = new Set<string>(['c', 'Enter', ' ']);

// v150c — cell-event ledger wire. Mike napkin §3: event-shape frozen.
const INGEST_URL  = '/api/ingest/cell-event';
const REF_PARAM   = 'r';          // ?r=<nonce> in the pasted URL
const REF_RE      = /^[a-zA-Z0-9-]{8,64}$/;

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
  beacon('copy', axis, stage, ref);
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

// ── Arrival (Tanya §5, Mike §5.9, Elon §6) ────────────────────────────────

function paintArrival(): void {
  const hash = window.location.hash;
  if (!HASH_RE.test(hash)) return;
  const cell = document.getElementById(hash.slice(1));
  if (!cell) return;
  retireOthers(cell);
  triggerArrival(cell);
  reportArrival(cell);
}

/** Parse `?r=<ref>` off location.search; null if malformed or absent. */
function readRef(): string | null {
  try {
    const ref = new URL(window.location.href).searchParams.get(REF_PARAM);
    return ref && REF_RE.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

/** Extract (axis, stage) from a data-cell-cell target element. */
function readCellCoord(cell: HTMLElement): { axis: string; stage: string } | null {
  const axis = cell.dataset.axis ?? '';
  const stage = cell.dataset.decayStage ?? '';
  if (!axis || !stage) return null;
  return { axis, stage };
}

/** Fire the arrive beacon when the hash+ref combo is complete. */
function reportArrival(cell: HTMLElement): void {
  const ref = readRef();
  const coord = readCellCoord(cell);
  if (!ref || !coord) return;
  beacon('arrive', coord.axis, coord.stage, ref);
}

function retireOthers(keep: HTMLElement): void {
  document
    .querySelectorAll<HTMLElement>(`.${ARRIVED}`)
    .forEach((el) => { if (el !== keep) el.classList.remove(ARRIVED); });
}

function triggerArrival(cell: HTMLElement): void {
  // Restart the animation cleanly: remove, reflow, re-add.
  cell.classList.remove(ARRIVED);
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void cell.offsetWidth;
  cell.classList.add(ARRIVED);
  window.setTimeout(() => cell.classList.remove(ARRIVED), ARRIVAL_MS);
}

// ── Ingest beacon (v150c — Mike napkin §2/§4, Paul round-trip) ────────────

/** Client-generated nonce that joins copy→arrive without a login. */
function mintRef(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Legacy-browser fallback: 16 hex chars from Math.random (still REF_RE-safe).
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** Fire-and-forget POST to the ingest endpoint. Must never throw. */
function beacon(event: 'copy' | 'arrive', axis: string, stage: string, ref: string): void {
  if (!axis || !stage || !ref) return;
  try {
    const body = JSON.stringify({ event, axis, stage, ref, ts: Date.now() });
    sendIngest(body);
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

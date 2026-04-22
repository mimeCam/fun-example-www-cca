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
// Non-negotiable (Paul): the clipboard *string* is the product. The
// toast and the bloom make the string believable.
//
// Credits: Mike (napkin §2, §5.8 event delegation, §5.9 dual-trigger
//          arrival), Tanya (§4 sequenced feedback, §5 stage-keyed
//          arrival, §7 reveal rules, §8 ARIA), Elon (§4.1 single-line
//          payload, §4.2 fossil-still-arrives, §4.4 "at" wording,
//          §4.6 instrument before celebrate), Paul (§non-negotiable
//          + CAR metric), Sid (§simplify — one module, ten 10-line fns).

import { cellCitationPayload } from '../stage-axes';
import type { Axis } from '../stage-axes';
import type { DecayStage } from '../decay-engine';

// ── Selectors & keys ─────────────────────────────────────────────────────

const MATRIX_SEL  = '.api-docs__matrix';
const BTN_SEL     = '[data-cell-copy]';
const TOAST_SEL   = '[data-cell-toast]';
const ARRIVED     = 'cell--arrived';
const CONFIRMED   = 'cell-copy--confirmed';
const TOAST_VIS   = 'is-visible';
const HASH_RE     = /^#axis-[a-z-]+-stage-[a-z-]+$/;
const ARRIVAL_MS  = 1200;        // covers stage durations incl. fossil hold
const TOAST_MS    = 1800;        // Tanya §4b linger window
const CONFIRM_MS  = 1200;        // Tanya §4a icon-swap duration

// ── Boot ──────────────────────────────────────────────────────────────────

/** Wire up the matrix. Safe on pages that have no matrix (no-op). */
export function initCellCite(): void {
  const matrix = document.querySelector<HTMLElement>(MATRIX_SEL);
  if (!matrix) return;
  const toast = document.querySelector<HTMLElement>(TOAST_SEL);
  matrix.addEventListener('click', (e) => onMatrixClick(e, toast));
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

async function handleCopy(btn: HTMLButtonElement, toast: HTMLElement | null): Promise<void> {
  const axis  = btn.dataset.cellAxis  ?? '';
  const stage = btn.dataset.cellStage ?? '';
  if (!axis || !stage) return;
  // Build payload at copy time — prerendered HTML never bakes in a host.
  const payload = cellCitationPayload(axis as Axis, stage as DecayStage, window.location.origin);
  const ok = await copyTextSafe(payload);
  if (!ok) return;
  confirmButton(btn);
  announce(toast, axis, stage);
  beacon(axis, stage);
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

// ── Analytics beacon (Elon §4.6) ──────────────────────────────────────────

// TODO: wire an actual ingest endpoint — today the beacon is a no-op
// recorded in `data-analytics` for future client-side counting.
function beacon(axis: string, stage: string): void {
  if (!axis || !stage) return;
  try {
    const url = '/api/ingest/copy-cell';
    const body = JSON.stringify({ event: 'copy-cell', axis, stage, ts: Date.now() });
    if ('sendBeacon' in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    }
  } catch {
    // Intentional no-op: analytics must never block the citation ritual.
  }
}

// ── Auto-boot on DOMContentLoaded (deferred module) ───────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCellCite, { once: true });
} else {
  initCellCite();
}

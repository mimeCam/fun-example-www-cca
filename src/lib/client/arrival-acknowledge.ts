// src/lib/client/arrival-acknowledge.ts
// v177 "Arrival Receipt" — client orchestrator for the copy→arrive→verify
// handshake. ONLY runs when `?r=<nonce>` is present on /api/docs; zero
// payload cost for visitors without a nonce (gated at the bottom of the
// file; the Astro page conditionally imports this module).
//
// Duties (exactly three, per Mike napkin §5.1):
//   1. Read `?r=<nonce>` + the hash-encoded cell, build the receipt from
//      the pure helper (`buildArrivalReceipt`), and paint it into the
//      `<ArrivalReceipt />` panel's DOM (`data-arrival-*` attributes).
//   2. Emit the SAME JSON bytes the curl endpoint would onto the panel's
//      `data-receipt-json` — this is the byte-identical witness the
//      falsifiable criterion (§5.10) checks.
//   3. Pulse the target cell once, using the single `--motion-cite-ack-*`
//      token pair. No-op under `prefers-reduced-motion: reduce`.
//
// Non-duties:
//   · Does NOT touch the arrival beacon — that's arrival.ts's job and
//     fires independently when a real (hash + valid ref) combo is seen.
//   · Does NOT re-import ds-kbd-lit (chip-lit fence, v154 AGENTS.md).
//   · Does NOT assemble a second receipt shape — the pure helper is the
//     only producer (Mike §3 "polymorphism is a killer").
//
// Credits: Mike Koch (napkin §5.1 single producer, §5.6 zero-bytes for
//          non-arrivals, §5.10 falsifiable criterion), Tanya Donska
//          (UX §4.2 "receipt is the reward", §7 one-pulse roster),
//          Paul Kim (byte-identical bytes), Elon (no toast, no badge),
//          Sid — 2026-04-23. Motto: "code maintenance without tests."

import {
  buildArrivalReceipt,
  serializeArrivalReceipt,
  type ArrivalReceipt,
  type ArrivalReceiptOk,
} from '../arrival-receipt';
import { cellIdFromHash } from '../stage-axes';
import { readRef } from './arrival';

// ── Selectors & class names ─────────────────────────────────────────────

const PANEL_SEL  = '[data-arrival-panel]';
const CELL_SEL   = '.api-docs__matrix-cell';
const PULSE_CLS  = 'arrival-receipt-pulse';
const PULSE_MS   = 320;                             // matches --motion-cite-ack + 100ms safety.

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Initialise the arrival acknowledgement.
 *
 * Contract:
 *   · `?r=<nonce>` absent    → no-op, no DOM touched, no bytes painted.
 *   · `?r=` present, no hash → panel stays hidden; we wait for hashchange.
 *   · `?r=` present + hash   → panel docks, cell pulses once.
 *
 * Idempotent: calling twice on the same (ref, hash) is a no-op after the
 * pulse clears; timers are cancelled via `window.setTimeout` handles.
 */
export function initArrivalAcknowledge(): void {
  const ref = readRef();
  if (!ref) return;
  const panel = document.querySelector<HTMLElement>(PANEL_SEL);
  if (!panel) return;
  paintNow(panel, ref);
  window.addEventListener('hashchange', () => paintNow(panel, ref));
}

// ── DOM painters (each ≤ 10 lines) ──────────────────────────────────────

/** Resolve the target cell from `location.hash` + paint the panel. */
function paintNow(panel: HTMLElement, ref: string): void {
  const cell = cellIdFromHash(window.location.hash);
  if (!cell) return;
  const receipt = buildArrivalReceipt({ axis: cell.axis, stage: cell.stage, ref });
  writePanel(panel, receipt);
  if (receipt.ok) pulseCell(receipt.cell.anchor);
}

/** Write the receipt into the panel DOM; hide on failure (paranoia). */
function writePanel(panel: HTMLElement, r: ArrivalReceipt): void {
  panel.dataset.receiptJson = serializeArrivalReceipt(r);
  if (!r.ok) { panel.hidden = true; return; }
  setText(panel, '[data-arrival-cell]',   r.label);
  setText(panel, '[data-arrival-ref]',    r.ref);
  setText(panel, '[data-arrival-pinned]', formatPinned(r));
  panel.hidden = false;
}

/** Write textContent onto a panel descendant, safe on missing nodes. */
function setText(root: HTMLElement, sel: string, text: string): void {
  const el = root.querySelector<HTMLElement>(sel);
  if (el) el.textContent = text;
}

/** Strip the date part — the panel only needs HH:MM:SS UTC for brevity.
 *  The full ISO is still available in `data-receipt-json` for parity. */
function formatPinned(r: ArrivalReceiptOk): string {
  const t = r.pinnedAt.slice(11, 19);                 // "HH:MM:SS".
  return `${t} UTC`;
}

/** Single-beat pulse on the target cell. One class add + one timer off. */
function pulseCell(anchor: string): void {
  const cell = document.getElementById(anchor);
  if (!cell || !cell.matches(CELL_SEL)) return;
  // Reflow before re-adding so rapid re-arrivals restart cleanly.
  cell.classList.remove(PULSE_CLS);
  void cell.offsetWidth;
  cell.classList.add(PULSE_CLS);
  window.setTimeout(() => cell.classList.remove(PULSE_CLS), PULSE_MS);
}

// ── Dismiss hook — panel close button ───────────────────────────────────

/** Wire the close button; idempotent — safe to call more than once. */
export function wireDismiss(): void {
  const panel = document.querySelector<HTMLElement>(PANEL_SEL);
  const btn   = panel?.querySelector<HTMLElement>('[data-arrival-close]');
  if (!panel || !btn) return;
  btn.addEventListener('click', () => { panel.hidden = true; });
}

// ── Boot ────────────────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initArrivalAcknowledge();
      wireDismiss();
    });
  } else {
    initArrivalAcknowledge();
    wireDismiss();
  }
}

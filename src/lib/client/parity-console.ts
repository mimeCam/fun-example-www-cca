// src/lib/client/parity-console.ts
// v178 "Parity Console" — client-side refresh for the three-pane
// demonstrator. One listener, no new event bus, one fetch per focus.
//
// Scope (Mike napkin §4, Tanya UX §7):
//   · Listen to `focus` events on `.api-docs__matrix-cell` (delegation).
//   · On focus: rewrite the three `<code>` panes from the oracle
//     (cellCitationPayload) for pointer + keyboard; refetch the curl
//     pane from GET /api/docs/cite. Never block; fail-closed → "—".
//   · Repaint the diff line: `0 bytes · …` on parity, `<N> bytes drift`
//     otherwise (byteDrift from parity-proof.ts, the shared oracle).
//
// Non-duties (deliberate):
//   · NO writes to history / URL / hashes.
//   · NO ledger beacons (parity view is read-only).
//   · NO second clock.
//   · NO import of matrix-keynav internals — subscribed through the DOM.
//
// Credits: Mike (napkin §4 client sketch, §5.4 no-store on refetch, §5.6
//          fail-closed curl pane, §5.7 conditional-import shape), Tanya
//          (UX §10 motion narrates drift only), AGENTS.md (freeze).
//          Sid — 2026-04-23. Motto: "code maintenance without tests."

import { cellCitationPayload, cellAnchorId } from '../stage-axes';
import type { Axis } from '../stage-axes';
import type { DecayStage } from '../decay-engine';
import { byteDrift, diffSentence } from '../parity-proof';
import type { ParityProof } from '../parity-proof';

// ── Selectors / attributes ───────────────────────────────────────────────

const MATRIX_SEL     = '.api-docs__matrix';
const CELL_SEL       = '.api-docs__matrix-cell';
const CONSOLE_SEL    = '[data-parity-console]';
const PANE_SEL       = '[data-pane-body]';
const FOCUS_LABEL    = '[data-parity-focus-label]';
const DIFF_TEXT      = '[data-parity-diff-text]';
const JUMP_SEL       = '[data-parity-jump]';

const CITE_ENDPOINT  = '/api/docs/cite';

// ── DOM helpers (each ≤ 10 LoC, Sid §rule) ───────────────────────────────

/** Resolve the console's three panes — returns null if the section or
 *  any pane is missing (fail-closed, no half-wired repaints). */
function paneMap(root: HTMLElement): Map<string, HTMLElement> | null {
  const map = new Map<string, HTMLElement>();
  const panes = root.querySelectorAll<HTMLElement>(PANE_SEL);
  for (const p of panes) {
    const name = p.dataset.paneBody ?? '';
    if (name) map.set(name, p);
  }
  if (map.size !== 3) return null;
  return map;
}

/** Read (axis, stage) from a matrix cell element. Null if invalid. */
function coordOf(cell: HTMLElement): { axis: Axis; stage: DecayStage } | null {
  const axis  = cell.dataset.axis;
  const stage = cell.dataset.decayStage;
  if (!axis || !stage) return null;
  return { axis: axis as Axis, stage: stage as DecayStage };
}

/** Build the URL for the curl refetch — explicit `no-store` is Mike §5.4. */
function buildCiteUrl(axis: Axis, stage: DecayStage, origin: string): string {
  const u = new URL(`${origin}${CITE_ENDPOINT}`);
  u.searchParams.set('axis', axis);
  u.searchParams.set('stage', stage);
  return u.toString();
}

/** Fetch the curl mouth body; returns null on any error (fail-closed). */
async function fetchCurl(axis: Axis, stage: DecayStage): Promise<string | null> {
  try {
    const res = await fetch(buildCiteUrl(axis, stage, window.location.origin), {
      cache: 'no-store',
      headers: { accept: 'text/plain' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Mark a pane as pending (fail-closed dash, no red). */
function markPending(pane: HTMLElement): void {
  pane.dataset.pending = 'true';
  pane.textContent = '—';
}

/** Clear the pending state — called when real bytes are written in. */
function clearPending(pane: HTMLElement): void {
  delete pane.dataset.pending;
}

/** Write a string into a pane, clearing the pending dash. */
function writePane(pane: HTMLElement, text: string): void {
  clearPending(pane);
  pane.textContent = text;
}

// ── Repaint ──────────────────────────────────────────────────────────────

/** Rewrite the three panes + diff line for a (axis, stage) focus.
 *  The pointer + keyboard legs write immediately (pure oracle call); the
 *  curl leg is async and fail-closes to a dash if the handler errors. */
async function repaint(root: HTMLElement, axis: Axis, stage: DecayStage): Promise<void> {
  const panes = paneMap(root);
  if (!panes) return;
  const origin = window.location.origin;
  const pointer  = cellCitationPayload(axis, stage, origin);
  const keyboard = cellCitationPayload(axis, stage, origin);
  writePane(panes.get('pointer')!,  pointer);
  writePane(panes.get('keyboard')!, keyboard);
  markPending(panes.get('curl')!);
  updateFocusLabel(root, axis, stage);
  updateJumpHref(root, axis, stage);
  const curl = await fetchCurl(axis, stage);
  if (curl === null) { repaintDiff(root, pointer, keyboard, null); return; }
  writePane(panes.get('curl')!, curl);
  repaintDiff(root, pointer, keyboard, curl);
}

/** Rewrite the diff line — fail-closed → "curl pending" when curl=null. */
function repaintDiff(
  root: HTMLElement, pointer: string, keyboard: string, curl: string | null,
): void {
  const text = root.querySelector<HTMLElement>(DIFF_TEXT);
  const diff = root.querySelector<HTMLElement>('[data-parity-diff]');
  if (!text || !diff) return;
  if (curl === null) { text.textContent = 'curl pending'; diff.dataset.drift = 'pending'; return; }
  const drift = byteDrift(pointer, keyboard, curl);
  const fake: ParityProof = makeFakeProof(pointer, keyboard, curl, drift);
  text.textContent = diffSentence(fake);
  diff.dataset.drift = drift === 0 ? 'zero' : 'drift';
}

/** Shape-compatible proof packet for `diffSentence` — pure, no oracle
 *  calls; client repaint does not need axis/stage here. */
function makeFakeProof(
  pointer: string, keyboard: string, curl: string, drift: number,
): ParityProof {
  return {
    axis: 'typography' as Axis, stage: 'fresh' as DecayStage, ref: null,
    label: '', anchor: '',
    pointer, keyboard, curl,
    driftBytes: drift,
  };
}

/** Update the human-readable focus label ("focused cell: typography × fresh"). */
function updateFocusLabel(root: HTMLElement, axis: Axis, stage: DecayStage): void {
  const label = root.querySelector<HTMLElement>(FOCUS_LABEL);
  if (!label) return;
  label.textContent = `${axis} × ${stage}`;
}

/** Update the jump-to-cell href so keyboard users land on the current cell. */
function updateJumpHref(root: HTMLElement, axis: Axis, stage: DecayStage): void {
  const a = root.querySelector<HTMLAnchorElement>(JUMP_SEL);
  if (!a) return;
  a.href = `#${cellAnchorId(axis, stage)}`;
}

// ── Listener (delegated; one `focus` per matrix) ─────────────────────────

let _lastKey = '';

/** On focus: extract (axis, stage), debounce no-op repeats, repaint. */
function onMatrixFocus(root: HTMLElement, e: Event): void {
  const target = e.target as HTMLElement | null;
  const cell = target?.closest<HTMLElement>(CELL_SEL);
  if (!cell) return;
  const coord = coordOf(cell);
  if (!coord) return;
  const key = `${coord.axis}:${coord.stage}`;
  if (key === _lastKey) return;
  _lastKey = key;
  void repaint(root, coord.axis, coord.stage);
}

// ── Boot ─────────────────────────────────────────────────────────────────

/** Wire up the console's focus listener. Safe to call on pages that have
 *  no console (no-op). Runs after DOMContentLoaded via the auto-boot. */
export function initParityConsole(): void {
  const root = document.querySelector<HTMLElement>(CONSOLE_SEL);
  if (!root) return;
  const matrix = document.querySelector<HTMLElement>(MATRIX_SEL);
  if (!matrix) return;
  // `focus` does not bubble; use capture to see it through the matrix.
  matrix.addEventListener('focus', (e) => onMatrixFocus(root, e), true);
}

// ── Auto-boot (SSR-safe) ─────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initParityConsole, { once: true });
  } else {
    initParityConsole();
  }
}

// src/lib/client/matrix-keynav.ts
// v151 "Linkable Gaze" — keyboard grid + hash-arrival seed for /api/docs.
//
// Two jobs, one module, zero polymorphism:
//   1. Arrow / Home / End / PageUp / PageDown roving tabindex over 7×5.
//   2. On boot, seed the roving tabindex (and programmatic focus) from the
//      incoming URL fragment, via `cellIdFromHash()` — the symmetric inverse
//      of `cellAnchorId()`. One grammar, one parser, one source (stage-axes.ts).
//
// Non-duties (deliberate):
//   · NO writes to `location.hash`. Arrow keys never mutate history/URL.
//     (Elon §3.1 URL thrash; Elon §3.2 back-button erosion.)
//   · NO second `hashchange` listener. `cell-cite.ts` owns the arrival
//     bloom; this module owns navigation only. Shared contract = the DOM.
//   · NO beacons. Keynav is not a "cited cell" signal (Mike §7.6).
//   · NO scroll. `focus({ preventScroll: true })` lets the browser's own
//     `:target` scroll + `scroll-margin-top` do the work (Mike §7.2).
//
// Axis-freeze safety: all bounds come from `STAGE_AXES.length` and
// `DECAY_STAGES.length` — never hard-coded 6/4. A breaker of the freeze
// fails the compliance guard long before they reach this file (AGENTS.md).
//
// Credits: Mike (napkin §5.3 module shape, §6.2 nextIndex signature, §7
//          risks list), Tanya (UX spec §3 arrival choreography, §5 silent
//          fallbacks), Elon (§3/§5 ruthless diff; keynav-only, zero writes),
//          Krystle (roving-tabindex skeleton), AGENTS.md (axis freeze).
//          Sid — 2026-04-22. Motto: "code maintenance without tests".

import { STAGE_AXES, cellAnchorId, cellIdFromHash } from '../stage-axes';
import type { Axis } from '../stage-axes';
import { DECAY_STAGES } from '../decay-engine';
import type { DecayStage } from '../decay-engine';

// ── Selectors / keys ──────────────────────────────────────────────────────

const MATRIX_SEL = '.api-docs__matrix';
const CELL_SEL   = '.api-docs__matrix-cell';

export type NavKey =
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'Home'    | 'End'       | 'PageUp'    | 'PageDown';

const NAV_KEYS: ReadonlySet<string> = new Set<NavKey>([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

/**
 * Pure predicate — true when a KeyboardEvent should move the roving
 * focus inside the matrix. Mirror of cell-cite :: isCiteKey. Rejects
 * all modifier chords so Cmd/Ctrl/Alt+Arrow (tab switch, history
 * back/forward, word-jumps) fall through to the browser untouched.
 * No JSDOM; pure fn — used by `handleKey` below and probed from
 * `nav-legend.test.ts` to lock the legend↔handler parity contract
 * (v151d, Mike napkin §4, Tanya §6).
 */
export function isNavKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return NAV_KEYS.has(e.key);
}

const MAX_AXIS  = STAGE_AXES.length   - 1;
const MAX_STAGE = DECAY_STAGES.length - 1;

// ── Pure movement math (unit-testable, zero globals) ──────────────────────

/** Clamp `v` into `[lo, hi]`. Never wraps. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Table-driven dispatch. Each entry is a ≤1-line arrow function; adding a
 * new nav key is a one-row diff. Keeps `nextIndex` a 2-line function and
 * makes the clamp/no-wrap property obvious by inspection.
 */
const MOVES: Record<NavKey, (axisIdx: number, stageIdx: number) => [number, number]> = {
  ArrowUp:    (a, s) => [clamp(a - 1, 0, MAX_AXIS),  s],
  ArrowDown:  (a, s) => [clamp(a + 1, 0, MAX_AXIS),  s],
  ArrowLeft:  (a, s) => [a, clamp(s - 1, 0, MAX_STAGE)],
  ArrowRight: (a, s) => [a, clamp(s + 1, 0, MAX_STAGE)],
  Home:       (a, _) => [a, 0],
  End:        (a, _) => [a, MAX_STAGE],
  PageUp:     (_, s) => [0, s],
  PageDown:   (_, s) => [MAX_AXIS, s],
};

/**
 * Compute the next focused coordinate, clamp-not-wrap. Pure function —
 * no DOM, no globals. Mike §6.2: "every DOM-coupled concern wraps around
 * this." Unit-tested without JSDOM.
 */
export function nextIndex(
  axisIdx: number, stageIdx: number, key: NavKey,
): { axisIdx: number; stageIdx: number } {
  const [a, s] = MOVES[key](axisIdx, stageIdx);
  return { axisIdx: a, stageIdx: s };
}

// ── v151a — Edge-of-axis bump (Tanya §2, Mike napkin §3 bumpDirection) ────

/** The four directions we paint onto `.api-docs__matrix` when a clamp lands. */
export type BumpDirection = 'up' | 'down' | 'left' | 'right';

/** Map Arrow key → the direction the matrix nudges when clamped. Pure. */
const ARROW_TO_BUMP: Readonly<Partial<Record<NavKey, BumpDirection>>> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};

/**
 * Return the bump direction if an Arrow key failed to move the cursor
 * (clamp at an edge), else `null`. Bounds come from the tuple lengths
 * upstream — no magic 7/5 in this file (Elon §5.1 non-negotiable).
 */
export function bumpDirection(
  prev: { axisIdx: number; stageIdx: number },
  next: { axisIdx: number; stageIdx: number },
  key: NavKey,
): BumpDirection | null {
  const dir = ARROW_TO_BUMP[key];
  if (!dir) return null;
  if (prev.axisIdx !== next.axisIdx || prev.stageIdx !== next.stageIdx) return null;
  return dir;
}

// ── DOM helpers (each ≤ 10 lines, one responsibility) ─────────────────────

function coordToId(axisIdx: number, stageIdx: number): string {
  return cellAnchorId(STAGE_AXES[axisIdx], DECAY_STAGES[stageIdx]);
}

function cellsIn(matrix: HTMLElement): HTMLElement[] {
  return Array.from(matrix.querySelectorAll<HTMLElement>(CELL_SEL));
}

/** Roving tabindex: exactly one `0`, the rest `-1`. Idempotent. */
function seedTabindex(matrix: HTMLElement, targetId: string): void {
  for (const cell of cellsIn(matrix)) cell.tabIndex = cell.id === targetId ? 0 : -1;
}

/** Resolve a cell's (axisIdx, stageIdx) from its data-* attrs; null if invalid. */
function readCoord(cell: HTMLElement): { axisIdx: number; stageIdx: number } | null {
  const axis  = cell.dataset.axis       ?? '';
  const stage = cell.dataset.decayStage ?? '';
  const axisIdx  = STAGE_AXES.indexOf(axis as Axis);
  const stageIdx = DECAY_STAGES.indexOf(stage as DecayStage);
  if (axisIdx < 0 || stageIdx < 0) return null;
  return { axisIdx, stageIdx };
}

/** Move the roving tabindex + focus to the given cell. No scroll (Mike §7.2). */
function moveRoving(matrix: HTMLElement, target: HTMLElement): void {
  seedTabindex(matrix, target.id);
  target.focus({ preventScroll: true });
}

// ── Event handler ─────────────────────────────────────────────────────────

function resolveCurrentCell(e: KeyboardEvent): HTMLElement | null {
  const t = e.target as HTMLElement | null;
  return t?.closest<HTMLElement>(CELL_SEL) ?? null;
}

function moveTo(
  matrix: HTMLElement, next: { axisIdx: number; stageIdx: number },
): void {
  const target = document.getElementById(coordToId(next.axisIdx, next.stageIdx));
  if (target) moveRoving(matrix, target);
}

/** Optional listener for clamped arrow-keystrokes. One caller: edge-bump.ts. */
export type ClampListener = (info: {
  matrix: HTMLElement;
  coord: { axisIdx: number; stageIdx: number };
  key: NavKey;
  direction: BumpDirection;
}) => void;

/** Module-local slot; set via `setClampListener`. Reset to `null` on clear. */
let _onClamp: ClampListener | null = null;

function handleKey(matrix: HTMLElement, e: KeyboardEvent): void {
  // v151d — the tested predicate IS the handler gate (Mike §4). If this
  // shortcut falls out of sync with the legend chips, `test:nav-legend`
  // fails the build.
  if (!isNavKey(e)) return;
  const current = resolveCurrentCell(e);
  if (!current) return;
  const coord = readCoord(current);
  if (!coord) return;
  e.preventDefault();
  const next = nextIndex(coord.axisIdx, coord.stageIdx, e.key as NavKey);
  moveTo(matrix, next);
  notifyClamp(matrix, coord, next, e.key as NavKey);
}

/** If the keystroke clamped, notify the listener. Zero work if no listener. */
function notifyClamp(
  matrix: HTMLElement,
  prev: { axisIdx: number; stageIdx: number },
  next: { axisIdx: number; stageIdx: number },
  key: NavKey,
): void {
  if (!_onClamp) return;
  const direction = bumpDirection(prev, next, key);
  if (!direction) return;
  _onClamp({ matrix, coord: prev, key, direction });
}

// ── Boot (seed from hash) ─────────────────────────────────────────────────

/**
 * Resolve the seed coordinate: the hash target if valid, else top-left.
 * The caller decides whether to steal focus (only when a valid hash was
 * supplied — Tanya §3 t=0-16ms; no-hash arrivals stay passive).
 */
function resolveSeed(): { id: string; focusOnArrival: boolean } {
  const parsed = cellIdFromHash(typeof location !== 'undefined' ? location.hash : '');
  const axis  = parsed?.axis  ?? STAGE_AXES[0];
  const stage = parsed?.stage ?? DECAY_STAGES[0];
  return { id: cellAnchorId(axis, stage), focusOnArrival: Boolean(parsed) };
}

/** Apply the seed: always reset roving tabindex; focus only when arriving. */
function applySeed(matrix: HTMLElement, seed: { id: string; focusOnArrival: boolean }): void {
  seedTabindex(matrix, seed.id);
  if (!seed.focusOnArrival) return;
  const cell = document.getElementById(seed.id);
  if (cell) cell.focus({ preventScroll: true });
}

/**
 * Register (or clear) the clamp listener. Edge-bump.ts is the only caller.
 * Called at import time — before DOMContentLoaded fires — so the first
 * clamped keystroke after boot already has a listener to fire into.
 */
export function setClampListener(fn: ClampListener | null): void {
  _onClamp = fn;
}

export function initMatrixKeynav(): void {
  const matrix = document.querySelector<HTMLElement>(MATRIX_SEL);
  if (!matrix) return;
  applySeed(matrix, resolveSeed());
  matrix.addEventListener('keydown', (e) => handleKey(matrix, e));
}

// ── Auto-boot on DOMContentLoaded (SSR-safe: only runs in a browser) ──────
//
// v151a: edge-bump.ts registers its listener via `setClampListener` at
// module-import time — before this auto-boot fires — so the first clamped
// keystroke already has a receiver. One boot, one keydown listener.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMatrixKeynav, { once: true });
  } else {
    initMatrixKeynav();
  }
}

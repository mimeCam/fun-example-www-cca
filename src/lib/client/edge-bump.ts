// src/lib/client/edge-bump.ts
// v151a "Edge of axis" — the wall-nods-back polish for the /api/docs matrix.
//
// One job: when the roving tabindex is already at a row/column edge and the
// user presses ArrowUp/Down/Left/Right again, the matrix translates 2px
// toward the wall (CSS keyframes in motion.css) AND the existing v150b
// aria-live toast whispers "edge of axis — <axis>" / "edge of stage — <stage>".
//
// Non-duties (all deliberate — Tanya §14 / Mike §9 out-of-scope):
//   · NO new aria-live region. Reuse the `[data-cell-toast]` lane.
//   · NO visual toast. The bump IS the eye's channel; the toast stays hidden
//     (`is-visible` class is NEVER added here). One cue per sense.
//   · NO beacon. Tanya §11: keynav is not a citation signal; clamps are not
//     "cited cells." No widening of `/api/ingest/cell-event` for v151a.
//   · NO write to location.hash / history. We never move the cursor.
//
// Reduced-motion + forced-colors: motion.css zeroes the keyframe; this module
// still fires the aria-live announcement. Motion ≠ feedback (Tanya §7.1).
//
// Debounce: ≥ 150ms between announcement writes (Tanya §7.2). A held Arrow
// key at the boundary must not spam the screen reader. The CSS class toggle
// is idempotent (animationend removes it), so visual re-triggers are free.
//
// Budget: ~140 LoC incl. comments. Every function ≤ 10 lines. No DOM state
// leaks — the only stateful thing is one module-level "last announced ts".
//
// Credits: Krystle Clear (v151a spec), Tanya Donska (UX spec §2/§3/§6/§7),
//          Mike Koch (napkin §3 module shape, §5 contracts, §6 risk
//          mitigations), Elon Musk (reduced-motion + debounce non-
//          negotiables), AGENTS.md (STAGE_AXES/DECAY_STAGES as the only
//          source of bounds — no magic 7/5 in this file).
//          Sid — 2026-04-22. Motto: "code maintenance without tests."

import { setClampListener } from './matrix-keynav';
import type { BumpDirection } from './matrix-keynav';
import { STAGE_AXES } from '../stage-axes';
import type { Axis } from '../stage-axes';
import { DECAY_STAGES } from '../decay-engine';
import type { DecayStage } from '../decay-engine';

// ── Selectors / constants ─────────────────────────────────────────────────

const TOAST_SEL      = '[data-cell-toast]';
const BUMP_PREFIX    = 'is-bumping--';       // matches motion.css rule names
const DEBOUNCE_MS    = 150;                   // Tanya §7.2 non-negotiable
const CLASS_FALLBACK = 240;                   // ms — strip class if animationend
                                              // never fires (reduced-motion path)

// ── Pure helpers (unit-testable, no DOM) ──────────────────────────────────

/** Arrow directions that clamp row-wise vs column-wise. */
const VERTICAL_DIRS:   ReadonlySet<BumpDirection> = new Set<BumpDirection>(['up',   'down']);
const HORIZONTAL_DIRS: ReadonlySet<BumpDirection> = new Set<BumpDirection>(['left', 'right']);

/**
 * Compose the announcement sentence. Two grammar words, one position word,
 * em-dash joiner. Lowercase, passthrough — no title-case, no "you've reached".
 * Tanya §6 copy spec.
 */
export function edgeMessage(
  direction: BumpDirection, axis: Axis, stage: DecayStage,
): string {
  if (VERTICAL_DIRS.has(direction))   return `edge of axis — ${axis}`;
  if (HORIZONTAL_DIRS.has(direction)) return `edge of stage — ${stage}`;
  return '';  // unreachable; BumpDirection is exhaustive
}

/** Resolve (axisIdx, stageIdx) → typed names. Bounds-safe by construction. */
export function coordToNames(
  coord: { axisIdx: number; stageIdx: number },
): { axis: Axis; stage: DecayStage } | null {
  const axis  = STAGE_AXES[coord.axisIdx];
  const stage = DECAY_STAGES[coord.stageIdx];
  if (!axis || !stage) return null;
  return { axis, stage };
}

/** True if `now - last` has cleared the debounce window. Pure. */
export function shouldAnnounce(lastAt: number, now: number, windowMs = DEBOUNCE_MS): boolean {
  return now - lastAt >= windowMs;
}

// ── DOM side-effects (each ≤ 10 lines) ────────────────────────────────────

/** All four bump class names — single source so motion.css + TS can't drift. */
const ALL_DIRS: readonly BumpDirection[] = ['up', 'down', 'left', 'right'] as const;

/** Flip all four bump classes off; then set the requested one. Idempotent. */
function applyBumpClass(matrix: HTMLElement, direction: BumpDirection): void {
  for (const d of ALL_DIRS) matrix.classList.remove(`${BUMP_PREFIX}${d}`);
  // Reflow so re-pressing the same key restarts the keyframe cleanly.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void matrix.offsetWidth;
  matrix.classList.add(`${BUMP_PREFIX}${direction}`);
  scheduleClassFallback(matrix, direction);
}

/** Safety net: if `animationend` never fires (reduced-motion), strip after
 *  CLASS_FALLBACK ms so the class never leaks beyond one keystroke window. */
function scheduleClassFallback(matrix: HTMLElement, direction: BumpDirection): void {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => matrix.classList.remove(`${BUMP_PREFIX}${direction}`), CLASS_FALLBACK);
}

/** Strip whichever bump class matches this animation event. One listener total. */
function wireAnimationEnd(matrix: HTMLElement): void {
  if (matrix.dataset.bumpWired === '1') return;
  matrix.dataset.bumpWired = '1';
  matrix.addEventListener('animationend', (e) => {
    const name = (e as AnimationEvent).animationName;
    if (!name.startsWith('edge-bump-')) return;
    const dir = name.slice('edge-bump-'.length) as BumpDirection;
    matrix.classList.remove(`${BUMP_PREFIX}${dir}`);
  });
}

/** Swap the aria-live text; do NOT add `is-visible` (Tanya §9 — one eye cue). */
function writeToast(text: string): void {
  if (typeof document === 'undefined') return;     // node/test path
  const toast = document.querySelector<HTMLElement>(TOAST_SEL);
  if (!toast) return;
  toast.textContent = text;
}

// ── Closure: one listener, one debounce slot ──────────────────────────────

/**
 * Build a clamp listener with private debounce state. Exposed for tests so
 * they can drive the pure-logic arm without touching `Date.now()`.
 */
export function createClampListener(nowFn: () => number = () => Date.now()) {
  let lastAnnouncedAt = 0;
  return function onClamp(info: {
    matrix: HTMLElement; coord: { axisIdx: number; stageIdx: number };
    direction: BumpDirection;
  }): void {
    applyBumpClass(info.matrix, info.direction);
    wireAnimationEnd(info.matrix);
    const names = coordToNames(info.coord);
    if (!names) return;
    const now = nowFn();
    if (!shouldAnnounce(lastAnnouncedAt, now)) return;
    lastAnnouncedAt = now;
    writeToast(edgeMessage(info.direction, names.axis, names.stage));
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────

/** Register ourselves as matrix-keynav's clamp listener. Idempotent. */
export function initEdgeBump(): void {
  setClampListener(createClampListener());
}

// Auto-register at import time — before matrix-keynav's DOMContentLoaded
// fires — so the first clamped keystroke already has a receiver. SSR-safe:
// the setter is a plain assignment (no DOM access) until the listener fires.
if (typeof window !== 'undefined') initEdgeBump();

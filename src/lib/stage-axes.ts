// src/lib/stage-axes.ts
// Canonical axis literal for the decay grammar (v150a, Mike napkin).
//
// Two readers, one source:
//   · `/api/docs` renders the 7×5 grammar-appendix matrix.
//   · `scripts/check-token-compliance.ts` enforces the file/axis inventory.
//
// Rule of the module (Mike §5.1, "polymorphism is a killer"):
//   - One `STAGE_AXES` tuple. No parallel lists in Markdown, JSON, AGENTS.md.
//   - `DECAY_STAGES` (decay-engine.ts) stays the stage-literal source.
//   - Add an axis → mutate one literal and the map below; propagate everywhere.
//
// Anti-scope: no new wire contract, no new route, no new token. The
// `axisStageExample` helper is a *pure lookup* — it returns the CSS
// tokens the cell consumes and the element kind the page renders.
// If a consumer wants the grammar programmatically, they already have
// `stage-tokens.generated.ts`; this module does not duplicate it.
//
// Credits: Mike Koch (§napkin single-literal rule, §5.6 axis-map
//          resolution), Tanya Donska (§3.4 cell-anatomy), Elon Musk
//          (axis-inventory enforcement), AGENTS.md (freeze).

import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';

// ── Canonical axis literal (freeze at 7) ──────────────────────────────────

/**
 * The seven grammar axes, in visual-grouping order:
 *   static identity   (typography, border) — the stage as style.
 *   timing            (tempo)               — the stage as time.
 *   interaction cues  (selection, drag-highlight, focus, underline)
 *                                           — the stage as feedback.
 *
 * Reordering or renaming is a breaking UX change; adding an 8th axis
 * is a breaking freeze violation (AGENTS.md).
 */
export const STAGE_AXES = [
  'typography',
  'border',
  'tempo',
  'selection',
  'drag-highlight',
  'focus',
  'underline',
] as const;

export type Axis = typeof STAGE_AXES[number];

// ── Axis → CSS file mapping ───────────────────────────────────────────────

/**
 * Where each axis is painted. Not every axis owns a dedicated file:
 *   typography + border live in `tokens.css` (token-only, no rule block);
 *   selection + drag-highlight share `stage-selection.css` (AGENTS.md).
 *
 * The compliance guard resolves axis ⇄ file drift via this map.
 */
export const AXIS_TO_CSS_FILE: Record<Axis, string> = {
  'typography':     'src/styles/tokens.css',
  'border':         'src/styles/tokens.css',
  'tempo':          'src/styles/stage-motion.css',
  'selection':      'src/styles/stage-selection.css',
  'drag-highlight': 'src/styles/stage-selection.css',
  'focus':          'src/styles/stage-focus.css',
  'underline':      'src/styles/stage-underline.css',
};

/**
 * `stage-*.css` files on disk that are NOT per-axis paint rules.
 * `stage-transitions.css` is the crossing orchestrator (keyframes only),
 * not an axis — it documents transitions BETWEEN stages. Exempt so the
 * compliance guard doesn't demand a matching axis for it.
 */
export const STAGE_FILE_EXEMPT: readonly string[] = ['stage-transitions.css'];

// ── Per-axis cell shape (for the /api/docs matrix) ────────────────────────

export interface AxisStageCell {
  /** CSS custom-property names consumed by this cell (dashed, no `var(…)`). */
  tokenRefs: string[];
  /** Element kind the docs page renders for this axis (e.g. 'span', 'button'). */
  exampleElement: string;
}

/** Small pure helpers — each returns a single token name. */
function borderToken(stage: DecayStage): string {
  return `--stage-${stage}-border`;
}
function durationToken(stage: DecayStage): string {
  return `--stage-${stage}-duration`;
}
function easeToken(stage: DecayStage): string {
  return `--stage-${stage}-ease`;
}

/** The tokens each (axis, stage) cell consumes — single source for docs + test. */
const AXIS_TOKENS: Record<Axis, (stage: DecayStage) => string[]> = {
  'typography':     (s) => [`--stage-${s}-title-weight`, `--stage-${s}-text-primary`],
  'border':         (s) => [borderToken(s)],
  'tempo':          (s) => [durationToken(s), easeToken(s)],
  'selection':      (s) => [borderToken(s)],
  'drag-highlight': (s) => [borderToken(s)],
  'focus':          (s) => [borderToken(s), durationToken(s), easeToken(s)],
  'underline':      (s) => [borderToken(s), durationToken(s), easeToken(s)],
};

/** The HTML element kind rendered per axis in the docs matrix. */
const AXIS_ELEMENT: Record<Axis, string> = {
  'typography':     'span',
  'border':         'div',
  'tempo':          'span',
  'selection':      'span',
  'drag-highlight': 'div',
  'focus':          'button',
  'underline':      'p',
};

/**
 * Pure lookup: the tokens consumed and the example element kind for a
 * given (axis, stage). Both values are non-empty for every pair.
 * Stateless — safe to call during SSR, during tests, and from the guard.
 */
export function axisStageExample(axis: Axis, stage: DecayStage): AxisStageCell {
  return {
    tokenRefs: AXIS_TOKENS[axis](stage),
    exampleElement: AXIS_ELEMENT[axis],
  };
}

export interface AxisStageEntry {
  axis: Axis;
  stage: DecayStage;
  cell: AxisStageCell;
}

/**
 * Enumerate the full 7 × 5 grid. Order is row-major (axis outer, stage
 * inner) — matches the docs page's visual order (Tanya §3.3).
 */
export function stageAxisGrid(): AxisStageEntry[] {
  const out: AxisStageEntry[] = [];
  for (const axis of STAGE_AXES)
    for (const stage of DECAY_STAGES)
      out.push({ axis, stage, cell: axisStageExample(axis, stage) });
  return out;
}

/**
 * URL-fragment id for a single cell. Stable across renders — deep links
 * in Slack / commits / tickets resolve to this exact element (Paul).
 */
export function cellAnchorId(axis: Axis, stage: DecayStage): string {
  return `axis-${axis}-stage-${stage}`;
}

/** URL-fragment id for an axis row. */
export function rowAnchorId(axis: Axis): string {
  return `axis-${axis}`;
}

/** URL-fragment id for a stage row in the existing `<dl>` definition list. */
export function stageAnchorId(stage: DecayStage): string {
  return `stages-${stage}`;
}

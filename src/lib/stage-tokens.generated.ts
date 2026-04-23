// AUTO-GENERATED from src/styles/tokens.css. DO NOT EDIT BY HAND.
// Regenerate: `npm run generate:stage-tokens`
// Scope: Move A presentational atoms. Mike napkin 2026-04-22.

import type { DecayStage } from './decay-engine';

export const STAGE_KEYS = ['fresh', 'fading', 'endangered', 'ghost', 'fossil'] as const;
export type StageKey = typeof STAGE_KEYS[number];

// Compile-time assertion: StageKey ≡ DecayStage. If the CSS gains a
// stage the ontology does not know about (or vice versa), TypeScript
// breaks the build. Cheaper than a runtime test. (Mike §napkin #1.)
const _stageKeyIsDecayStage: DecayStage = null as unknown as StageKey;
const _decayStageIsStageKey: StageKey = null as unknown as DecayStage;
void _stageKeyIsDecayStage; void _decayStageIsStageKey;

export const STAGE_TEXT_PRIMARY_OPACITY: Record<StageKey, number> = {
  fresh: 0.95,
  fading: 0.85,
  endangered: 1,
  ghost: 0.55,
  fossil: 0.45,
};
export const STAGE_TITLE_WEIGHT: Record<StageKey, number> = {
  fresh: 700,
  fading: 600,
  endangered: 600,
  ghost: 400,
  fossil: 400,
};
export const STAGE_TRANSITION_DURATION_MS: Record<StageKey, string> = {
  fresh: "280ms",
  fading: "360ms",
  endangered: "140ms",
  ghost: "540ms",
  fossil: "720ms",
};
export const STAGE_TRANSITION_EASE: Record<StageKey, string> = {
  fresh: "var(--motion-easing-spring)",
  fading: "cubic-bezier(0.25, 0.8, 0.3, 1)",
  endangered: "cubic-bezier(0.4, 0, 0.2, 1)",
  ghost: "cubic-bezier(0.5, 0.05, 0.5, 0.95)",
  fossil: "cubic-bezier(1, 0, 1, 0)",
};

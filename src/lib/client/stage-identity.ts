// src/lib/client/stage-identity.ts
// Decay Stage Identity — maps decay factor to per-card CSS identity tokens.
// Zero new RAF loops: called from heartbeat THROTTLED tick (already 120ms cadence).
// Writes --si-* CSS vars to el.style (card-scoped) — never to :root.
// Sets data-decay-stage attribute which triggers CSS [data-decay-stage] selectors.
//
// Architecture: Mike Koch §napkin-plan (Stage Identity Layer)
// UX: Tanya Donska §3 (Five Worlds — 5 discrete identities, not 5 opacities)
// prefers-reduced-motion: pulse animation set to 'none' — JS is motion-agnostic.
//
// Credits: Mike Koch (arch spec), Tanya Donska (stage table §3), DevBrain (ambient animations)

export type StageId = 'fresh' | 'fading' | 'endangered' | 'ghost' | 'fossil';

interface StageTokens {
  borderColor:    string;  // OKLCH value matching --color-decay-* in tokens.css
  borderOpacity:  number;  // 0–1
  titleWeight:    number;  // font-weight integer (300 | 400 | 600 | 700)
  titleOpacity:   number;  // 0–1
  excerptOpacity: number;  // 0–1
  pulseAnimation: string;  // 'none' | 'border-pulse'
  pulseDuration:  string;  // '0s' | '2s'
}

// Stage thresholds — mirror factorToStage() in decay-heartbeat-orchestrator.ts.
// FOSSIL_THRESHOLD raised to 0.97 (matches heartbeat-orchestrator FOSSIL_THRESHOLD).
const THRESHOLDS = {
  fading:     0.25,
  endangered: 0.50,
  ghost:      0.75,
  fossil:     0.97,
} as const;

/** Maps decay factor [0,1] to a discrete StageId. Pure function, no side effects. */
export function stageFor(factor: number): StageId {
  if (factor >= THRESHOLDS.fossil)     return 'fossil';
  if (factor >= THRESHOLDS.ghost)      return 'ghost';
  if (factor >= THRESHOLDS.endangered) return 'endangered';
  if (factor >= THRESHOLDS.fading)     return 'fading';
  return 'fresh';
}

// Token table — OKLCH values mirror --color-decay-* primitives in tokens.css.
// Tanya §3 Stage Identity Table: each stage is a complete visual identity.
// DO NOT use raw hex — lint:tokens enforces token compliance.
const TOKENS: Record<StageId, StageTokens> = {
  fresh: {
    borderColor:    'oklch(66% 0.195 145)',   // --color-decay-fresh
    borderOpacity:  0.12,
    titleWeight:    700,
    titleOpacity:   1.0,
    excerptOpacity: 0.70,
    pulseAnimation: 'none',
    pulseDuration:  '0s',
  },
  fading: {
    borderColor:    'oklch(60% 0.130 85)',    // --color-decay-fading
    borderOpacity:  0.08,
    titleWeight:    600,
    titleOpacity:   0.92,
    excerptOpacity: 0.65,
    pulseAnimation: 'none',
    pulseDuration:  '0s',
  },
  endangered: {
    borderColor:    'oklch(56% 0.210 32)',    // --color-decay-endangered
    borderOpacity:  0.15,
    titleWeight:    600,
    titleOpacity:   1.0,
    excerptOpacity: 0.70,
    pulseAnimation: 'border-pulse',
    pulseDuration:  '2s',
  },
  ghost: {
    borderColor:    'oklch(48% 0.085 18)',    // --color-decay-ghost
    borderOpacity:  0.04,
    titleWeight:    400,
    titleOpacity:   0.65,
    excerptOpacity: 0.45,
    pulseAnimation: 'none',
    pulseDuration:  '0s',
  },
  fossil: {
    borderColor:    'oklch(38% 0.025 60)',    // --color-decay-fossil
    borderOpacity:  0.0,
    titleWeight:    400,
    titleOpacity:   0.40,
    excerptOpacity: 0.30,
    pulseAnimation: 'none',
    pulseDuration:  '0s',
  },
};

/** Returns the full token set for a given stage. Pure lookup — no side effects. */
export function tokensFor(stage: StageId): StageTokens {
  return TOKENS[stage];
}

/** Writes all --si-* CSS vars to the element's inline style (card-scoped, never :root). */
function writeTokens(s: CSSStyleDeclaration, t: StageTokens): void {
  s.setProperty('--si-border-color',    t.borderColor);
  s.setProperty('--si-border-opacity',  String(t.borderOpacity));
  s.setProperty('--si-title-weight',    String(t.titleWeight));
  s.setProperty('--si-title-opacity',   String(t.titleOpacity));
  s.setProperty('--si-excerpt-opacity', String(t.excerptOpacity));
  s.setProperty('--si-pulse-animation', t.pulseAnimation);
  s.setProperty('--si-pulse-duration',  t.pulseDuration);
}

/**
 * Applies stage-identity CSS tokens to a card element (card-scoped, never :root).
 * Sets el.dataset.decayStage to activate [data-decay-stage] CSS identity selectors.
 * Idempotent: no-op if stage already matches — safe to call every THROTTLED tick.
 *
 * Mike Koch §napkin-plan: "writes to el.style (card-scoped) — never :root —
 * avoids cascade pollution. A Ghost-stage card on the same page as a Fresh-stage
 * card must not interfere with each other's tokens."
 */
export function applyStageTokens(el: HTMLElement, stage: StageId): void {
  if (el.dataset.decayStage === stage) return;  // idempotent guard
  el.dataset.decayStage = stage;
  writeTokens(el.style, tokensFor(stage));
}

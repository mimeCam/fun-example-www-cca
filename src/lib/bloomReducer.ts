// src/lib/bloomReducer.ts
// Pure function: maps 5-phase bloom config → 3-phase (Ignite → Glow → Settle).
// Removes Burst + Afterglow phases. Halves particle count.
// Single responsibility. Unit-testable. Used by bloomOrchestrator.ts.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Phase {
  name: string;
  delayMs: number;
  durationMs?: number;
}

export interface BloomConfig {
  phases: Phase[];
  particleCount: number;
  reducedMode?: boolean;
}

// ---------------------------------------------------------------------------
// Constants — the 3 surviving phases
// ---------------------------------------------------------------------------

const IGNITE_MS = 0;
const GLOW_MS = 800;
const SETTLE_MS = 1800;

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Collapse any bloom config down to 3 phases: Ignite → Glow → Settle. */
export function reduceBloomPhases(config: BloomConfig): BloomConfig {
  return {
    phases: buildThreePhases(),
    particleCount: halveParticles(config.particleCount),
    reducedMode: config.reducedMode,
  };
}

function buildThreePhases(): Phase[] {
  return [
    { name: 'ignite',  delayMs: IGNITE_MS },
    { name: 'glow',    delayMs: GLOW_MS },
    { name: 'settle',  delayMs: SETTLE_MS },
  ];
}

function halveParticles(count: number): number {
  return Math.max(1, Math.floor(count / 2));
}

// ---------------------------------------------------------------------------
// Helpers for external consumers
// ---------------------------------------------------------------------------

/** Check if a config is already reduced to 3 phases. */
export function isReduced(config: BloomConfig): boolean {
  return config.phases.length <= 3;
}

/** Extract phase delay by name, or fallback. */
export function phaseDelay(config: BloomConfig, name: string): number {
  const phase = config.phases.find(p => p.name === name);
  return phase?.delayMs ?? 0;
}

// ---------------------------------------------------------------------------
// Default 5-phase config (for reference / testing)
// ---------------------------------------------------------------------------

export function defaultFivePhaseConfig(): BloomConfig {
  return {
    phases: [
      { name: 'ignite',    delayMs: 0 },
      { name: 'burst',     delayMs: 800 },
      { name: 'afterglow', delayMs: 900 },
      { name: 'settle',    delayMs: 1800 },
      { name: 'cleanup',   delayMs: 3000 },
    ],
    particleCount: 12,
  };
}

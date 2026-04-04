// src/lib/dissolve.ts
// Dissolve choreography at time-phase boundaries.
// Reuses .ambient-time-tint — no new DOM layers.
//
// 3-phase opacity dance: fade out → liminal color peak → settle to new tint.
// "Silent" boundaries (morning→noon, noon→afternoon) produce no effect.
//
// Design: Tanya Donska — "the passage is *felt*, not seen."
// Architecture: Michael Koch — four files, zero deps.

import type { TimePhase, TimeTint } from './timeAmbient';

export interface LiminalTint {
  color: string;      // CSS color at the liminal peak
  peakOpacity: number; // opacity during the brief liminal flash
  shimmerType?: string; // shimmer accent key (see shimmer.ts)
}

// ---------------------------------------------------------------------------
// Boundary → liminal color map (null = silent boundary)
// ---------------------------------------------------------------------------

const LIMINALS: Partial<Record<string, LiminalTint>> = {
  'night→dawn':          { color: '#c8956e', peakOpacity: 0.05, shimmerType: 'pulse' },
  'dawn→morning':        { color: '#f0d8b0', peakOpacity: 0.03 },
  'morning→noon':        null, // silent
  'noon→afternoon':      null, // silent
  'afternoon→golden-hour': { color: '#c4905a', peakOpacity: 0.04 },
  'golden-hour→dusk':    { color: '#A07058', peakOpacity: 0.06, shimmerType: 'veil' },
  'dusk→evening':        { color: '#4a2d6e', peakOpacity: 0.05, shimmerType: 'sweep' },
  'evening→night':       { color: '#1e1640', peakOpacity: 0.04 },
};

/** Boundary key from two adjacent phases. */
export function boundaryKey(from: TimePhase, to: TimePhase): string {
  return `${from}→${to}`;
}

/** Returns the liminal tint for a boundary, or null if silent. */
export function liminalFor(from: TimePhase, to: TimePhase): LiminalTint | null {
  return LIMINALS[boundaryKey(from, to)] ?? null;
}

/** Serializable config for the inline script. */
export function dissolveConfig(): string {
  return JSON.stringify(LIMINALS);
}

// ---------------------------------------------------------------------------
// Timing constants (ms) — the three choreography phases
// ---------------------------------------------------------------------------

export const DISSOLVE_TIMING = {
  fadeOut: 2000,   // phase 1: current tint fades to 0
  liminal: 3000,  // phase 2: liminal color peaks
  settle: 2000,   // phase 3: new tint settles in
} as const;

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testDissolve(): void {
  const goldenDusk = liminalFor('golden-hour', 'dusk');
  console.assert(goldenDusk?.color === '#A07058', 'golden→dusk should be terracotta');
  console.assert(liminalFor('morning', 'noon') === null, 'morning→noon should be silent');
  console.assert(liminalFor('noon', 'afternoon') === null, 'noon→afternoon should be silent');

  const cfg = dissolveConfig();
  console.assert(cfg.includes('#A07058'), 'config missing terracotta');

  console.log('[dissolve] OK — liminals verified, silent boundaries confirmed');
}

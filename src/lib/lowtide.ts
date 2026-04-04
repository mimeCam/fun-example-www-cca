// src/lib/lowtide.ts
// Tidal cycle engine — surfaces aged content on a 72-hour rhythm.
// Old entries invert their decay: high decay = high glow (bioluminescence).
// Pure functions, zero side-effects. Reuses temporal.ts primitives.
//
// TODO: wire _testLowTideLib() into a build sanity step

import type { MoodId } from './mood';
import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TideCandidate {
  id: string;
  text: string;
  posted: string;
  mood: MoodId;
  source: 'wall' | 'ember';
}

export type TidalState = 'surfaced' | 'turning' | 'resting';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CYCLE_HOURS = 72;
const DOT_COUNT   = 12;
const MIN_DECAY   = 0.5;   // only surface entries past half-life
const DECAY_WINDOW = 30;   // days — matches wall.ts FADE_MAX

// ---------------------------------------------------------------------------
// Tidal phase — 0 = high tide (resting), 1 = low tide (surfaced)
// ---------------------------------------------------------------------------

/** Sinusoidal phase: 0→1→0 over 72 hours. Epoch-anchored. */
export function tidalPhase(now = new Date()): number {
  const hours = now.getTime() / 3_600_000;
  return (Math.sin((hours / CYCLE_HOURS) * Math.PI * 2) + 1) / 2;
}

/** Discrete tidal state from continuous phase. */
export function tidalState(phase: number): TidalState {
  if (phase >= 0.65) return 'surfaced';
  if (phase >= 0.35) return 'turning';
  return 'resting';
}

/** Label text for the current tidal state. */
export function tidalLabel(state: TidalState): string {
  const labels: Record<TidalState, string> = {
    surfaced: 'The tide is out',
    turning:  'The tide is turning',
    resting:  'The tide is in',
  };
  return labels[state];
}

// ---------------------------------------------------------------------------
// Phase indicator — 12 dots, active count proportional to phase
// ---------------------------------------------------------------------------

/** Number of active dots (0–12) for the phase indicator strip. */
export function activeDotCount(phase: number): number {
  return Math.round(phase * DOT_COUNT);
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/** Filter entries to those old enough to surface as fossils. */
export function fossilCandidates(
  entries: TideCandidate[],
  now = new Date(),
): TideCandidate[] {
  return entries.filter(e => {
    const age = daysSince(e.posted, now);
    return (age / DECAY_WINDOW) >= MIN_DECAY;
  });
}

/** Surfaced intensity: decay inverted and scaled by tidal phase. */
export function surfacedIntensity(
  decay: number,
  phase: number,
): number {
  return Math.min(1, decay * phase);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testLowTideLib(): void {
  const p = tidalPhase(new Date('2026-04-04T12:00:00Z'));
  console.assert(p >= 0 && p <= 1, `phase out of range: ${p}`);

  console.assert(tidalState(0.8) === 'surfaced', 'high phase → surfaced');
  console.assert(tidalState(0.5) === 'turning',  'mid phase → turning');
  console.assert(tidalState(0.2) === 'resting',  'low phase → resting');

  console.assert(activeDotCount(1) === DOT_COUNT, 'full phase = all dots');
  console.assert(activeDotCount(0) === 0,         'zero phase = no dots');

  const entries: TideCandidate[] = [
    { id: 'a', text: 'old', posted: '2026-01-01', mood: 'lo-fi', source: 'wall' },
    { id: 'b', text: 'new', posted: '2026-04-03', mood: 'focus', source: 'ember' },
  ];
  const candidates = fossilCandidates(entries, new Date('2026-04-04'));
  console.assert(candidates.length === 1, `expected 1 candidate, got ${candidates.length}`);

  const si = surfacedIntensity(0.8, 0.9);
  console.assert(si > 0.5 && si <= 1, `intensity out of range: ${si}`);

  console.log('[lowtide] lib OK — phase, state, dots, candidates, intensity verified');
}

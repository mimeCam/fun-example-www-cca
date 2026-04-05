// src/lib/pulse.ts
// Shared utilities for the /pulse page — open loops + contradictions.
// Pure functions. Reuses daysSince() from temporal.ts.
//
// TODO: build-time slug validation for contradiction post links
// TODO: wire _testPulseLib() into a build sanity step

import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenLoop {
  id: string;
  question: string;
  dateAdded: string;   // ISO date
  context: string;
  resolved: boolean;
  decayDays: number;   // freshness window in days
}

export interface PostRef {
  slug: string;
  title: string;
}

export interface Contradiction {
  id: string;
  postA: PostRef;
  postB: PostRef;
  reflection: string;
  dateAdded: string;   // ISO date
}

export interface PulseData {
  lastUpdated: string;
  openLoops: OpenLoop[];
  contradictions: Contradiction[];
}

// ---------------------------------------------------------------------------
// Freshness utilities
// ---------------------------------------------------------------------------

export type DecayLabel = 'fresh' | 'aging' | 'stale';

/** Ratio of elapsed days to decay window. 0 = new, 1+ = fully decayed. */
export function decayRatio(dateAdded: string, maxDays: number, now = new Date()): number {
  return Math.min(1, daysSince(dateAdded, now) / maxDays);
}

/** Human-readable freshness label from a decay ratio. */
export function decayLabel(ratio: number): DecayLabel {
  if (ratio < 0.4) return 'fresh';
  if (ratio < 0.8) return 'aging';
  return 'stale';
}

/** CSS opacity derived from decay ratio: fresh = 1.0, stale = 0.35. */
export function decayOpacity(ratio: number): number {
  return Math.max(0.35, 1 - ratio * 0.65);
}

/** True when every open loop is either resolved or fully stale. */
export function isPulseQuiet(data: PulseData, now = new Date()): boolean {
  const loopsAlive = data.openLoops.some(
    l => !l.resolved && decayRatio(l.dateAdded, l.decayDays, now) < 1,
  );
  return !loopsAlive && data.contradictions.length === 0;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/** Reads and returns typed pulse data from the static JSON file. */
export async function getPulseData(): Promise<PulseData> {
  const mod = await import('../data/pulse.json');
  return mod.default as PulseData;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testPulseLib(): void {
  const r0 = decayRatio('2026-04-04', 30, new Date('2026-04-04'));
  console.assert(r0 === 0, `same-day ratio should be 0, got ${r0}`);

  const r1 = decayRatio('2026-03-05', 30, new Date('2026-04-04'));
  console.assert(r1 === 1, `30/30 ratio should be 1, got ${r1}`);

  console.assert(decayLabel(0) === 'fresh', 'label 0 → fresh');
  console.assert(decayLabel(0.5) === 'aging', 'label 0.5 → aging');
  console.assert(decayLabel(0.9) === 'stale', 'label 0.9 → stale');

  console.assert(decayOpacity(0) === 1, 'fresh opacity = 1');
  console.assert(decayOpacity(1) === 0.35, 'stale opacity = 0.35');

  const quiet: PulseData = {
    lastUpdated: '2026-01-01',
    openLoops: [{ id: 'x', question: 'q', dateAdded: '2025-01-01', context: '', resolved: false, decayDays: 30 }],
    contradictions: [],
  };
  console.assert(isPulseQuiet(quiet, new Date('2026-04-04')), 'all stale → quiet');

  const loud: PulseData = {
    lastUpdated: '2026-04-04',
    openLoops: [{ id: 'y', question: 'q', dateAdded: '2026-04-04', context: '', resolved: false, decayDays: 30 }],
    contradictions: [],
  };
  console.assert(!isPulseQuiet(loud, new Date('2026-04-04')), 'fresh loop → not quiet');

  console.log('[pulse] lib OK — decayRatio, decayLabel, decayOpacity, isPulseQuiet verified');
}

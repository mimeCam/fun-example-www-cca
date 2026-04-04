// src/lib/wall.ts
// Shared utilities for the /wall page.
// Each wall entry decays independently: glowing → active → fading → fossil.
// Fossils never disappear — they compress into inline whispers.
// Reuses daysSince() from now.ts. Zero side-effects, zero dependencies.
//
// TODO: add optional `link` field to WallEntry once external references ship
// TODO: wire _testWallLib() into a build sanity step

import type { MoodId } from './mood';
import { daysSince } from './now';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WallEntry {
  id: string;
  text: string;
  posted: string;        // ISO date, e.g. "2026-04-01"
  mood: MoodId;
}

export type WallState = 'glowing' | 'active' | 'fading' | 'fossil';

export interface ComputedWallEntry {
  entry: WallEntry;
  days: number;
  state: WallState;
  decay: number;         // 0 = just posted, 1 = fully fossilised
  quip: string;
}

// ---------------------------------------------------------------------------
// Thresholds (days) — faster cycle than /now since wall is chatty
// ---------------------------------------------------------------------------

const GLOW_MAX  = 3;
const ACTIVE_MAX = 14;
const FADE_MAX   = 30;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Map a day count to a WallState. */
export function wallState(days: number): WallState {
  if (days <= GLOW_MAX)   return 'glowing';
  if (days <= ACTIVE_MAX) return 'active';
  if (days <= FADE_MAX)   return 'fading';
  return 'fossil';
}

/** Continuous decay: 0 = just posted, 1 = fully fossilised. */
export function wallDecay(posted: string, now = new Date()): number {
  return Math.min(1, daysSince(posted, now) / FADE_MAX);
}

/** Self-aware quip for a wall entry's current state. */
export function wallQuip(state: WallState): string {
  const quips: Record<WallState, string> = {
    glowing: 'Still warm to the touch.',
    active:  'Holding up, for now.',
    fading:  'Becoming part of the scenery.',
    fossil:  'A whisper from another week.',
  };
  return quips[state];
}

/** One-call: turn a raw WallEntry into a fully computed one. */
export function computeWallEntry(
  entry: WallEntry,
  now = new Date(),
): ComputedWallEntry {
  const days  = daysSince(entry.posted, now);
  const state = wallState(days);
  return { entry, days, state, decay: wallDecay(entry.posted, now), quip: wallQuip(state) };
}

/** Partition entries into active (glowing/active/fading) vs fossils. */
export function partitionEntries(
  entries: WallEntry[],
  now = new Date(),
): { active: ComputedWallEntry[]; fossils: ComputedWallEntry[] } {
  const computed = entries.map(e => computeWallEntry(e, now));
  const active  = computed.filter(c => c.state !== 'fossil');
  const fossils = computed.filter(c => c.state === 'fossil');
  return { active, fossils };
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testWallLib(): void {
  console.assert(wallState(0)  === 'glowing', 'day 0 → glowing');
  console.assert(wallState(3)  === 'glowing', 'day 3 → glowing');
  console.assert(wallState(4)  === 'active',  'day 4 → active');
  console.assert(wallState(14) === 'active',  'day 14 → active');
  console.assert(wallState(15) === 'fading',  'day 15 → fading');
  console.assert(wallState(30) === 'fading',  'day 30 → fading');
  console.assert(wallState(31) === 'fossil',  'day 31 → fossil');

  const d0 = wallDecay('2026-04-04', new Date('2026-04-04'));
  console.assert(d0 === 0, `same-day decay should be 0, got ${d0}`);
  const d1 = wallDecay('2026-03-01', new Date('2026-04-04'));
  console.assert(d1 >= 1, `34-day decay should be 1, got ${d1}`);

  const stub: WallEntry = {
    id: 't1', text: 'test', posted: '2026-04-04', mood: 'lo-fi',
  };
  const c = computeWallEntry(stub, new Date('2026-04-04'));
  console.assert(c.state === 'glowing', 'same-day entry should glow');
  console.assert(c.quip.length > 0, 'quip must not be empty');

  const batch: WallEntry[] = [
    { id: 'a', text: 'new', posted: '2026-04-03', mood: 'focus' },
    { id: 'b', text: 'old', posted: '2026-02-01', mood: 'jazz' },
  ];
  const { active, fossils } = partitionEntries(batch, new Date('2026-04-04'));
  console.assert(active.length === 1, `expected 1 active, got ${active.length}`);
  console.assert(fossils.length === 1, `expected 1 fossil, got ${fossils.length}`);

  console.log('[wall] lib OK — states, decay, quips, partition verified');
}

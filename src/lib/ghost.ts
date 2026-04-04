// src/lib/ghost.ts
// Shared library for the GhostZone feature — ephemeral text fragments
// representing abandoned ideas that auto-vanish after 30 days.
// Ghosts start dim and fade to near-invisible over their lifespan.
// Reuses daysSince() from temporal.ts. Zero side-effects.
//
// TODO: wire _testGhostLib() into a build sanity step
// TODO: add scripts/haunt.ts CLI to append ghosts (mirror whisper pattern)
// DONE: GhostPill.astro + GhostDrawer.astro render ghosts site-wide via mood bar

import { daysSince } from './temporal';
import type { MoodId } from './mood';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GhostEntry {
  id: string;
  text: string;
  createdAt: string;     // ISO date, e.g. "2026-04-01"
  mood?: MoodId;         // optional — ghosts are moodless by default
}

export interface ComputedGhost {
  entry: GhostEntry;
  age: number;           // days since creation
  opacity: number;       // 0.08 (nearly gone) → 0.30 (fresh ghost)
  alive: boolean;        // false when age > GHOST_MAX_DAYS
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GHOST_MAX_DAYS = 30;
const OPACITY_MIN   = 0.08;
const OPACITY_MAX   = 0.30;

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/** Aliveness ratio: 1 = just created, 0 = about to vanish. */
export function ghostAliveness(createdAt: string, now = new Date()): number {
  const age = daysSince(createdAt, now);
  return Math.max(0, 1 - age / GHOST_MAX_DAYS);
}

/** Ghost opacity: dims from OPACITY_MAX to OPACITY_MIN over 30 days. */
export function ghostOpacity(createdAt: string, now = new Date()): number {
  const aliveness = ghostAliveness(createdAt, now);
  return OPACITY_MIN + (OPACITY_MAX - OPACITY_MIN) * aliveness;
}

/** Is this ghost still within its 30-day lifespan? */
export function isGhostAlive(createdAt: string, now = new Date()): boolean {
  return daysSince(createdAt, now) <= GHOST_MAX_DAYS;
}

/** Enrich a raw GhostEntry with computed display values. */
export function computeGhost(
  entry: GhostEntry,
  now = new Date(),
): ComputedGhost {
  return {
    entry,
    age: daysSince(entry.createdAt, now),
    opacity: ghostOpacity(entry.createdAt, now),
    alive: isGhostAlive(entry.createdAt, now),
  };
}

// ---------------------------------------------------------------------------
// Public API — mirrors wall.ts pattern
// ---------------------------------------------------------------------------

/** Filter expired ghosts and return computed entries, newest first. */
export function getGhosts(
  raw: GhostEntry[],
  now = new Date(),
): ComputedGhost[] {
  return raw
    .map(e => computeGhost(e, now))
    .filter(g => g.alive)
    .sort((a, b) => a.age - b.age);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testGhostLib(): void {
  const ref = new Date('2026-04-04');

  const a = ghostAliveness('2026-04-04', ref);
  console.assert(a === 1, `same-day aliveness should be 1, got ${a}`);

  const a30 = ghostAliveness('2026-03-05', ref);
  console.assert(a30 === 0, `30-day aliveness should be 0, got ${a30}`);

  const o = ghostOpacity('2026-04-04', ref);
  console.assert(o === OPACITY_MAX, `fresh opacity should be ${OPACITY_MAX}, got ${o}`);

  const oOld = ghostOpacity('2026-03-05', ref);
  console.assert(oOld === OPACITY_MIN, `expired opacity should be ${OPACITY_MIN}, got ${oOld}`);

  console.assert(isGhostAlive('2026-04-04', ref), 'same-day ghost should be alive');
  console.assert(isGhostAlive('2026-03-05', ref), '30-day ghost should be alive');
  console.assert(!isGhostAlive('2026-03-04', ref), '31-day ghost should be dead');

  const stub: GhostEntry = { id: 'g0', text: 'test', createdAt: '2026-04-04' };
  const c = computeGhost(stub, ref);
  console.assert(c.alive, 'fresh ghost should be alive');
  console.assert(c.age === 0, 'fresh ghost age should be 0');

  const batch: GhostEntry[] = [
    { id: 'a', text: 'new', createdAt: '2026-04-03' },
    { id: 'b', text: 'old', createdAt: '2026-02-01' },
    { id: 'c', text: 'mid', createdAt: '2026-03-20' },
  ];
  const result = getGhosts(batch, ref);
  console.assert(result.length === 2, `expected 2 alive, got ${result.length}`);
  console.assert(result[0].entry.id === 'a', 'newest ghost should be first');

  console.log('[ghost] lib OK — aliveness, opacity, filtering verified');
}

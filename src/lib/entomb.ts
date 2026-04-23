// src/lib/entomb.ts
// Pure functions for the Consequential Decay system.
// Posts that reach full decay with zero recent revivals get "entombed" —
// they vanish from the homepage and appear in the /graveyard page.
//
// Two conditions: high decay AND prolonged neglect. A post with recent
// revivals can't be entombed even at high decay — someone still cares.
//
// Stateless. Testable. No dependencies beyond daysSince().

import { daysSince } from './temporal';
import { nowDate } from './clock';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ENTOMB_THRESHOLD = 0.95;
export const DORMANCY_DAYS = 30;
export const RESURRECT_BONUS = 3;

// ---------------------------------------------------------------------------
// Core predicates
// ---------------------------------------------------------------------------

/** True when a post should be moved to the graveyard. */
export function isEntombed(
  decayFactor: number,
  lastRevivalDaysAgo: number,
  dormancy = DORMANCY_DAYS,
): boolean {
  return decayFactor >= ENTOMB_THRESHOLD && lastRevivalDaysAgo > dormancy;
}

/** Days since a post was entombed (approximation from its age). */
export function entombmentAge(
  pubDateISO: string,
  maxDays: number,
  now: Date = nowDate(),
): number {
  const age = daysSince(pubDateISO, now);
  const thresholdDay = Math.ceil(maxDays * ENTOMB_THRESHOLD);
  return Math.max(0, age - thresholdDay);
}

/** Revival weight for a resurrection (heavier than a regular revival). */
export function resurrectWeight(): number {
  return RESURRECT_BONUS;
}

// ---------------------------------------------------------------------------
// Risen-badge helpers
// ---------------------------------------------------------------------------

const RISEN_VISIBLE_DAYS = 7;

/** True when the risen badge should still be visible. */
export function isRecentlyRisen(
  risenAt: Date | null,
  now: Date = nowDate(),
): boolean {
  if (!risenAt) return false;
  const ms = now.getTime() - risenAt.getTime();
  return ms < RISEN_VISIBLE_DAYS * 86_400_000;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testEntomb(): void {
  // Basic entombment
  console.assert(isEntombed(0.96, 31), 'high decay + dormant = entombed');
  console.assert(!isEntombed(0.94, 31), 'below threshold = not entombed');
  console.assert(!isEntombed(0.96, 10), 'recent revival = not entombed');
  console.assert(!isEntombed(0.5, 60), 'low decay = not entombed');

  // Edge cases
  console.assert(isEntombed(0.95, 31), 'exactly at threshold = entombed');
  console.assert(!isEntombed(0.95, 30), 'exactly at dormancy = NOT entombed');

  // Resurrect weight
  console.assert(resurrectWeight() === 3, 'resurrect = 3 revival points');

  // Risen badge
  const now = new Date('2026-04-06');
  const recent = new Date('2026-04-02');
  const old = new Date('2026-03-01');
  console.assert(isRecentlyRisen(recent, now), 'recent risen = visible');
  console.assert(!isRecentlyRisen(old, now), 'old risen = hidden');
  console.assert(!isRecentlyRisen(null, now), 'null = hidden');

  // Entombment age
  const age = entombmentAge('2025-01-01', 365, new Date('2026-04-06'));
  console.assert(age > 0, `entombment age should be > 0, got ${age}`);

  console.log('[entomb] lib OK — entombment, risen badge, weight verified');
}

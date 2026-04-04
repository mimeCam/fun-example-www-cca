// src/lib/ember.ts
// Shared utilities for the /embers page — short-form micro-posts that decay.
// Follows the wall.ts pattern: glowing → warm → cooling → ash.
// Reuses daysSince/decay from temporal.ts. Zero side-effects.
//
// TODO: add optional `link` field for external references
// TODO: add optional `tags` array for filtering by topic

import type { MoodId } from './mood';
import { daysSince, decay as decayFn } from './temporal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Ember {
  id: string;
  text: string;
  posted: string;   // ISO date
  mood: MoodId;
}

export type EmberState = 'glowing' | 'warm' | 'cooling' | 'ash';

export interface ComputedEmber {
  ember: Ember;
  days: number;
  state: EmberState;
  decay: number;    // 0 = just posted, 1 = fully cooled
}

// ---------------------------------------------------------------------------
// Thresholds (days) — embers burn faster than wall entries
// ---------------------------------------------------------------------------

const GLOW_MAX = 2;
const WARM_MAX = 7;
const COOL_MAX = 21;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function emberState(days: number): EmberState {
  if (days <= GLOW_MAX) return 'glowing';
  if (days <= WARM_MAX) return 'warm';
  if (days <= COOL_MAX) return 'cooling';
  return 'ash';
}

export function emberDecay(posted: string, now = new Date()): number {
  return decayFn(posted, COOL_MAX, now);
}

export function computeEmber(ember: Ember, now = new Date()): ComputedEmber {
  const days = daysSince(ember.posted, now);
  return { ember, days, state: emberState(days), decay: emberDecay(ember.posted, now) };
}

export function sortedEmbers(embers: Ember[], now = new Date()): ComputedEmber[] {
  return embers
    .map(e => computeEmber(e, now))
    .sort((a, b) => a.days - b.days);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testEmberLib(): void {
  console.assert(emberState(0) === 'glowing', 'day 0 → glowing');
  console.assert(emberState(2) === 'glowing', 'day 2 → glowing');
  console.assert(emberState(3) === 'warm',    'day 3 → warm');
  console.assert(emberState(7) === 'warm',    'day 7 → warm');
  console.assert(emberState(8) === 'cooling',  'day 8 → cooling');
  console.assert(emberState(21) === 'cooling', 'day 21 → cooling');
  console.assert(emberState(22) === 'ash',     'day 22 → ash');

  const d0 = emberDecay('2026-04-04', new Date('2026-04-04'));
  console.assert(d0 === 0, `same-day decay should be 0, got ${d0}`);

  const stub: Ember = { id: 'e1', text: 'test', posted: '2026-04-04', mood: 'lo-fi' };
  const c = computeEmber(stub, new Date('2026-04-04'));
  console.assert(c.state === 'glowing', 'same-day ember should glow');

  console.log('[ember] lib OK — states, decay, compute verified');
}

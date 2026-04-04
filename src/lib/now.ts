// src/lib/now.ts
// Shared utilities for the /now page.
// Reads the hand-edited now.json, computes staleness from the update date,
// and returns display-ready data. Zero side-effects, zero dependencies.
//
// The "staleness" mechanic is the soul of this module: neglect the page
// long enough and it starts talking back to your visitors.
//
// TODO: add optional `reading` and `listening` fields once the page ships
// TODO: wire _testNowLib() into a build sanity step

import type { MoodId } from './mood';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NowEntry {
  emoji: string;
  text: string;
}

export interface NowData {
  mood: MoodId;
  updated: string;       // ISO date, e.g. "2026-04-01"
  doing: NowEntry[];
  thinking: string;
  location?: string;
}

export type Freshness = 'fresh' | 'recent' | 'stale' | 'dormant';

export interface FreshnessInfo {
  level: Freshness;
  days: number;
  label: string;
  quip: string;         // personality line shown on page
}

// ---------------------------------------------------------------------------
// Staleness thresholds (days)
// ---------------------------------------------------------------------------

const FRESH_MAX  = 7;
const RECENT_MAX = 30;
const STALE_MAX  = 90;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Number of full days between `updated` and `now`. */
export function daysSince(updated: string, now = new Date()): number {
  const ms = now.getTime() - new Date(updated).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Map a day count to a Freshness level. */
export function freshnessLevel(days: number): Freshness {
  if (days <= FRESH_MAX)  return 'fresh';
  if (days <= RECENT_MAX) return 'recent';
  if (days <= STALE_MAX)  return 'stale';
  return 'dormant';
}

/** Human-friendly label for a freshness level. */
export function freshnessLabel(level: Freshness): string {
  const labels: Record<Freshness, string> = {
    fresh:   'Updated just now',
    recent:  'Updated recently',
    stale:   'A while ago…',
    dormant: 'Gone quiet',
  };
  return labels[level];
}

/** The snarky quip that gives the staleness mechanic personality. */
export function freshnessQuip(level: Freshness): string {
  const quips: Record<Freshness, string> = {
    fresh:   'This page is piping hot.',
    recent:  'Still reasonably accurate, probably.',
    stale:   'The author wandered off. This is what they were last seen doing.',
    dormant: "If this page were milk, you'd smell it from here.",
  };
  return quips[level];
}

/** One-call convenience: turn an update date into full FreshnessInfo. */
export function computeFreshness(updated: string, now = new Date()): FreshnessInfo {
  const days  = daysSince(updated, now);
  const level = freshnessLevel(days);
  return { level, days, label: freshnessLabel(level), quip: freshnessQuip(level) };
}

/** Continuous decay value: 0 = just updated, 1 = fully dormant. */
export function computeDecay(updated: string, now = new Date()): number {
  const days = daysSince(updated, now);
  return Math.min(1, days / STALE_MAX);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testNowLib(): void {
  const d = daysSince('2026-01-01', new Date('2026-04-04'));
  console.assert(d === 93, `daysSince expected 93 got ${d}`);

  console.assert(freshnessLevel(0)   === 'fresh',   'day 0 should be fresh');
  console.assert(freshnessLevel(7)   === 'fresh',   'day 7 should be fresh');
  console.assert(freshnessLevel(8)   === 'recent',  'day 8 should be recent');
  console.assert(freshnessLevel(30)  === 'recent',  'day 30 should be recent');
  console.assert(freshnessLevel(31)  === 'stale',   'day 31 should be stale');
  console.assert(freshnessLevel(91)  === 'dormant', 'day 91 should be dormant');

  const info = computeFreshness('2026-04-04', new Date('2026-04-04'));
  console.assert(info.level === 'fresh', 'same-day should be fresh');
  console.assert(info.quip.length > 0,   'quip should not be empty');

  const decay0 = computeDecay('2026-04-04', new Date('2026-04-04'));
  console.assert(decay0 === 0, `same-day decay should be 0, got ${decay0}`);
  const decay1 = computeDecay('2026-01-01', new Date('2026-04-04'));
  console.assert(decay1 >= 1, `93-day decay should be 1, got ${decay1}`);
  const decayMid = computeDecay('2026-03-05', new Date('2026-04-04'));
  console.assert(decayMid > 0 && decayMid < 1, `30-day decay should be mid-range`);

  console.log('[now] lib OK — staleness thresholds, quips, and decay verified');
}

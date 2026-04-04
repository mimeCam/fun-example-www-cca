// src/lib/tidepool.ts
// Shared utilities for the /tidepool page — curated links that decay.
// Links wash ashore fresh (foreign-hued) and blend into the site over 45 days.
// Follows wall.ts/ember.ts pattern: JSON data -> compute -> sort.
// Reuses daysSince/decay from temporal.ts. Zero side-effects.
//
// TODO: TidepoolEntry component to consume ComputedTidepoolLink
// TODO: TidepoolPreview component for homepage widget
// TODO: /tidepool page with full listing + OG meta

import { daysSince, decay as decayFn } from './temporal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TidepoolLink {
  url: string;
  title: string;
  note?: string;
  date: string;   // ISO date
}

export type TidepoolState = 'fresh' | 'settling' | 'integrated' | 'native';

export interface ComputedTidepoolLink {
  link: TidepoolLink;
  days: number;
  state: TidepoolState;
  decay: number;    // 0 = just washed ashore, 1 = fully native
  domain: string;
}

// ---------------------------------------------------------------------------
// Thresholds (days) — links age slower than hot takes
// ---------------------------------------------------------------------------

const FRESH_MAX    = 5;
const SETTLE_MAX   = 18;
export const DECAY_WINDOW = 45;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Extract display domain from a URL. */
export function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

/** Map a day count to a TidepoolState. */
export function tidepoolState(days: number): TidepoolState {
  if (days <= FRESH_MAX)  return 'fresh';
  if (days <= SETTLE_MAX) return 'settling';
  if (days <= DECAY_WINDOW) return 'integrated';
  return 'native';
}

/** Continuous decay: 0 -> 1 over DECAY_WINDOW days. */
export function tidepoolDecay(date: string, now = new Date()): number {
  return decayFn(date, DECAY_WINDOW, now);
}

/** Compute a single tidepool link with derived fields. */
export function computeTidepoolLink(
  link: TidepoolLink,
  now = new Date(),
): ComputedTidepoolLink {
  const days = daysSince(link.date, now);
  return {
    link,
    days,
    state: tidepoolState(days),
    decay: tidepoolDecay(link.date, now),
    domain: extractDomain(link.url),
  };
}

/** All links, sorted newest-first, with computed fields. */
export function sortedTidepoolLinks(
  links: TidepoolLink[],
  now = new Date(),
): ComputedTidepoolLink[] {
  return links
    .map(l => computeTidepoolLink(l, now))
    .sort((a, b) => a.days - b.days);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testTidepoolLib(): void {
  console.assert(tidepoolState(0) === 'fresh',      'day 0 -> fresh');
  console.assert(tidepoolState(5) === 'fresh',      'day 5 -> fresh');
  console.assert(tidepoolState(6) === 'settling',   'day 6 -> settling');
  console.assert(tidepoolState(18) === 'settling',  'day 18 -> settling');
  console.assert(tidepoolState(19) === 'integrated','day 19 -> integrated');
  console.assert(tidepoolState(45) === 'integrated','day 45 -> integrated');
  console.assert(tidepoolState(46) === 'native',    'day 46 -> native');

  console.assert(extractDomain('https://www.example.com/path') === 'example.com',
    'extractDomain strips www');
  console.assert(extractDomain('https://blog.jim-nielsen.com') === 'blog.jim-nielsen.com',
    'extractDomain keeps subdomains');
  console.assert(extractDomain('not-a-url') === 'not-a-url',
    'extractDomain handles bad URLs');

  const d0 = tidepoolDecay('2026-04-04', new Date('2026-04-04'));
  console.assert(d0 === 0, `same-day decay should be 0, got ${d0}`);

  const stub: TidepoolLink = {
    url: 'https://example.com', title: 'Test', date: '2026-04-04',
  };
  const c = computeTidepoolLink(stub, new Date('2026-04-04'));
  console.assert(c.state === 'fresh', 'same-day link should be fresh');
  console.assert(c.domain === 'example.com', 'domain derived correctly');
  console.assert(c.link.note === undefined, 'optional note is undefined');

  const batch: TidepoolLink[] = [
    { url: 'https://old.com', title: 'Old', date: '2026-01-01' },
    { url: 'https://new.com', title: 'New', date: '2026-04-03' },
  ];
  const sorted = sortedTidepoolLinks(batch, new Date('2026-04-04'));
  console.assert(sorted[0].domain === 'new.com', 'newest first after sort');
  console.assert(sorted[1].state === 'native', 'old link is native');

  console.log('[tidepool] lib OK — states, decay, domain, sort verified');
}

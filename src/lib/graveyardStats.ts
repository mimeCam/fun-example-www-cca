// src/lib/graveyardStats.ts
// Pure stats functions for the Graveyard Discovery Surface.
// Derives entombment data from PostDisplayData — no new DB tables needed.
// Callers join DB revival data with the content collection at page level,
// then pass PostDisplayData[] here. All functions are stateless + testable.
//
// Note: cannot store entombed_at in DB yet (no migration) — derive from
// pubDate + decay threshold per Mike's architecture spec.
//
// Credits: Mike (architecture spec — Graveyard Discovery Surface, napkin plan)

import type { PostDisplayData } from './postMeta';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntombedPost {
  slug: string;
  title: string;
  pubDateISO: string;
  revivalCount: number;
  readingSeconds: number;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** Count of posts currently in the graveyard. */
export function getEntombedCount(posts: PostDisplayData[]): number {
  return posts.filter(p => p.entombed).length;
}

/** Slim records for all entombed posts. */
export function getEntombedPosts(posts: PostDisplayData[]): EntombedPost[] {
  return posts.filter(p => p.entombed).map(toEntombed);
}

/**
 * Fraction of entombed posts revived within the last 7 days.
 * Returns 0 when graveyard is empty.
 */
export function getResurrectionRate(posts: PostDisplayData[]): number {
  const entombed = posts.filter(p => p.entombed);
  if (entombed.length === 0) return 0;
  const risen = entombed.filter(p => p.recentlyRisen).length;
  return risen / entombed.length;
}

/**
 * Most recently published post that is now entombed.
 * Returns null when graveyard is empty.
 */
export function getNewestEntombed(posts: PostDisplayData[]): EntombedPost | null {
  const entombed = posts.filter(p => p.entombed);
  if (entombed.length === 0) return null;
  const newest = entombed.reduce(pickNewer);
  return toEntombed(newest);
}

/** Total accumulated reading seconds across all entombed posts. */
export function getTotalReadingSecondsEntombed(posts: PostDisplayData[]): number {
  return posts
    .filter(p => p.entombed)
    .reduce((sum, p) => sum + p.readingSeconds, 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reducer: pick the PostDisplayData with the newer pubDate. */
function pickNewer(a: PostDisplayData, b: PostDisplayData): PostDisplayData {
  return a.pubDate.valueOf() > b.pubDate.valueOf() ? a : b;
}

/** Map a PostDisplayData to a slim EntombedPost record. */
function toEntombed(p: PostDisplayData): EntombedPost {
  return {
    slug: p.slug,
    title: p.title,
    pubDateISO: p.pubDateISO,
    revivalCount: p.revivalCount,
    readingSeconds: p.readingSeconds,
  };
}

// ---------------------------------------------------------------------------
// Isolated sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testGraveyardStats(): void {
  const base = {
    description: '', url: '', pubDate: new Date('2024-01-01'), readingTime: 1,
    decay: 0, freshness: 'fossil' as const, decayStyle: '', revivalWarm: false,
    endangered: false, endangeredUrgency: 'ok' as const, endangeredDaysLeft: 999,
    risenAt: null,
  };

  const entombedPost: PostDisplayData = {
    ...base, slug: 'old', title: 'Old', pubDateISO: '2024-01-01T00:00:00.000Z',
    revivalCount: 2, readingSeconds: 120, entombed: true, recentlyRisen: false,
  };
  const livingPost: PostDisplayData = {
    ...base, slug: 'new', title: 'New', pubDateISO: '2025-06-01T00:00:00.000Z',
    revivalCount: 5, readingSeconds: 60, entombed: false, recentlyRisen: false,
  };
  const risenPost: PostDisplayData = {
    ...base, slug: 'risen', title: 'Risen', pubDateISO: '2024-03-01T00:00:00.000Z',
    revivalCount: 1, readingSeconds: 0, entombed: true, recentlyRisen: true,
  };

  const all = [entombedPost, livingPost, risenPost];

  console.assert(getEntombedCount(all) === 2, 'entombed count = 2');
  console.assert(getEntombedPosts(all).length === 2, 'entombed posts = 2 records');
  console.assert(getResurrectionRate(all) === 0.5, 'resurrection rate = 0.5');
  console.assert(getNewestEntombed(all)?.slug === 'risen', 'newest entombed = risen (2024-03)');
  console.assert(getTotalReadingSecondsEntombed(all) === 120, 'total reading seconds = 120');
  console.assert(getEntombedCount([livingPost]) === 0, 'no entombed = 0');
  console.assert(getResurrectionRate([livingPost]) === 0, 'no entombed = rate 0');
  console.assert(getNewestEntombed([livingPost]) === null, 'no entombed = null');

  console.log('[graveyardStats] OK — count, posts, rate, newest, reading seconds verified');
}

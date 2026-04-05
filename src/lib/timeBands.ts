// src/lib/timeBands.ts
// Groups posts into time bands for the homepage "Decay Field" layout.
// Three bands: Now (≤30 days), Recent (31–180 days), Archive (180+ days).
// Archive caps at ARCHIVE_PREVIEW_LIMIT ghost previews to keep the page clean.
//
// Pure functions. Zero dependencies beyond postMeta types.

import type { PostDisplayData } from './postMeta';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NOW_DAYS       = 30;
const RECENT_DAYS    = 180;
const ARCHIVE_LIMIT  = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeBand {
  label: string;
  hint: string;            // subtle description for screen readers / UI
  posts: PostDisplayData[];
  overflow: number;        // how many posts exceeded ARCHIVE_LIMIT (archive only)
}

export interface TimeBands {
  now:     TimeBand;
  recent:  TimeBand;
  archive: TimeBand;
}

// ---------------------------------------------------------------------------
// Band assignment — one pass over sorted posts
// ---------------------------------------------------------------------------

function ageDays(post: PostDisplayData): number {
  const ms = Date.now() - new Date(post.pubDateISO).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Partition sorted posts into three time bands. */
export function groupIntoBands(posts: PostDisplayData[]): TimeBands {
  const now:     PostDisplayData[] = [];
  const recent:  PostDisplayData[] = [];
  const archive: PostDisplayData[] = [];

  for (const p of posts) {
    const age = ageDays(p);
    if      (age <= NOW_DAYS)    now.push(p);
    else if (age <= RECENT_DAYS) recent.push(p);
    else                         archive.push(p);
  }

  const overflow = Math.max(0, archive.length - ARCHIVE_LIMIT);

  return {
    now:     { label: 'Now',     hint: 'Last 30 days',  posts: now,    overflow: 0 },
    recent:  { label: 'Recent',  hint: '1–6 months',    posts: recent, overflow: 0 },
    archive: { label: 'Archive', hint: '6+ months',     posts: archive.slice(0, ARCHIVE_LIMIT), overflow },
  };
}

/** True when at least one band has posts. */
export function hasPosts(bands: TimeBands): boolean {
  return bands.now.posts.length + bands.recent.posts.length + bands.archive.posts.length > 0;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testTimeBands(): void {
  const fake = (iso: string): PostDisplayData => ({
    slug: 'x', title: 'X', description: '', url: '', pubDate: new Date(iso),
    pubDateISO: iso, readingTime: 1, decay: 0, freshness: 'recent',
    decayStyle: '',
  });

  const now = new Date();
  const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

  const posts = [
    fake(d(1)), fake(d(5)), fake(d(29)),   // now band
    fake(d(60)), fake(d(120)),              // recent band
    fake(d(200)), fake(d(250)), fake(d(300)), fake(d(350)), fake(d(400)), // archive
  ];

  const bands = groupIntoBands(posts);
  console.assert(bands.now.posts.length === 3,     `now: expected 3, got ${bands.now.posts.length}`);
  console.assert(bands.recent.posts.length === 2,  `recent: expected 2, got ${bands.recent.posts.length}`);
  console.assert(bands.archive.posts.length === 4, `archive: expected 4 (capped), got ${bands.archive.posts.length}`);
  console.assert(bands.archive.overflow === 1,     `overflow: expected 1, got ${bands.archive.overflow}`);
  console.assert(hasPosts(bands),                  'hasPosts should be true');

  const empty = groupIntoBands([]);
  console.assert(!hasPosts(empty), 'empty bands should report no posts');

  console.log('[timeBands] lib OK — band grouping, capping, overflow verified');
}

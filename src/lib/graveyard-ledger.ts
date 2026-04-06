// src/lib/graveyard-ledger.ts
// Graveyard Ledger — shapes PostDisplayData into structured ledger records.
// Pure functions — no DB access, no side effects.
// Called by graveyard.astro and /api/graveyard-stats.
// Credits: Mike (arch §4.4)

import type { PostDisplayData } from './postMeta';
import { generateEpitaph, survivalTier } from './epitaph-engine';
import type { SurvivalTier } from './epitaph-engine';

export interface LedgerEntry {
  slug: string;
  title: string;
  survivalDays: number;
  totalRevivalCount: number;
  readingMinutes: number;
  tier: SurvivalTier;
  epitaph: string;
  entombedAt: Date | null;
  pubDate: Date;
}

export interface GraveyardSummary {
  longestSurvivor: LedgerEntry | null;
  mostContested: LedgerEntry | null;
  totalForeverLost: number;
  avgSurvivalDays: number;
  totalReaderMinutes: number;
}

/** UTC-safe survival days via millisecond arithmetic on Date objects. */
function survivalDays(post: PostDisplayData): number {
  const end = post.entombedAt ?? new Date();
  return Math.max(0, Math.round((end.getTime() - post.pubDate.getTime()) / 86_400_000));
}

/** Core ledger fields — extracted to keep buildLedgerEntry ≤10 lines. */
function entryCore(
  post: PostDisplayData,
  days: number,
  readingMinutes: number,
): Omit<LedgerEntry, 'tier' | 'epitaph'> {
  return {
    slug: post.slug, title: post.title, survivalDays: days,
    totalRevivalCount: post.revivalCount, readingMinutes,
    entombedAt: post.entombedAt, pubDate: post.pubDate,
  };
}

/** Build a single ledger entry from PostDisplayData. */
export function buildLedgerEntry(post: PostDisplayData): LedgerEntry {
  const days = survivalDays(post);
  const readingMinutes = Math.round(post.readingSeconds / 60);
  const tier = survivalTier(days, post.revivalCount);
  const epitaph = generateEpitaph(post.slug, days, post.revivalCount, readingMinutes);
  return { ...entryCore(post, days, readingMinutes), tier, epitaph };
}

/** Paginated entombed posts as ledger entries (preserves incoming sort order). */
export function getEntombedLedger(
  posts: PostDisplayData[],
  page = 1,
  pageSize = 20,
): LedgerEntry[] {
  const start = (page - 1) * pageSize;
  return posts.filter(p => p.entombed).slice(start, start + pageSize).map(buildLedgerEntry);
}

/** Aggregate summary for the Hall of Records hero section. */
export function getGraveyardSummary(posts: PostDisplayData[]): GraveyardSummary {
  const entries = posts.filter(p => p.entombed).map(buildLedgerEntry);
  if (entries.length === 0) return emptySummary();
  return {
    longestSurvivor:   maxBy(entries, e => e.survivalDays),
    mostContested:     maxBy(entries, e => e.totalRevivalCount),
    totalForeverLost:  entries.filter(e => e.totalRevivalCount === 0).length,
    avgSurvivalDays:   Math.round(entries.reduce((s, e) => s + e.survivalDays, 0) / entries.length),
    totalReaderMinutes: entries.reduce((s, e) => s + e.readingMinutes, 0),
  };
}

function emptySummary(): GraveyardSummary {
  return {
    longestSurvivor: null, mostContested: null,
    totalForeverLost: 0, avgSurvivalDays: 0, totalReaderMinutes: 0,
  };
}

function maxBy<T>(arr: T[], fn: (x: T) => number): T {
  return arr.reduce((a, b) => fn(a) >= fn(b) ? a : b);
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

function _makePosts(): PostDisplayData[] {
  const base = {
    description: '', url: '', readingTime: 1, decay: 0, freshness: 'fossil' as const,
    decayStyle: '', revivalWarm: false, endangered: false, endangeredUrgency: 'ok' as const,
    endangeredDaysLeft: 999, risenAt: null, recentlyRisen: false,
  };
  const p1: PostDisplayData = {
    ...base, slug: 'old', title: 'Old', pubDateISO: '2024-01-01T00:00:00Z',
    pubDate: new Date('2024-01-01'), revivalCount: 8, readingSeconds: 300,
    entombed: true, entombedAt: new Date('2024-04-20'),
  };
  const p2: PostDisplayData = {
    ...base, slug: 'new', title: 'New', pubDateISO: '2025-06-01T00:00:00Z',
    pubDate: new Date('2025-06-01'), revivalCount: 0, readingSeconds: 0,
    entombed: true, entombedAt: null,
  };
  return [p1, p2];
}

function _testSummary(): void {
  const posts = _makePosts();
  const s = getGraveyardSummary(posts);
  console.assert(s.longestSurvivor?.slug === 'old', 'longest survivor = old');
  console.assert(s.mostContested?.slug === 'old',   'most contested = old');
  console.assert(s.totalForeverLost === 1,           'forever lost = 1');
  console.assert(s.avgSurvivalDays > 0,              'avg > 0');
}

function _testLedger(): void {
  const posts = _makePosts();
  const page = getEntombedLedger(posts, 1, 10);
  console.assert(page.length === 2,                      'paginated = 2');
  console.assert(typeof page[0].epitaph === 'string',    'epitaph is string');
  console.assert(page[0].epitaph.length > 0,             'epitaph non-empty');
  console.assert(getEntombedLedger(posts, 2, 10).length === 0, 'page 2 empty');
}

export function _testGraveyardLedger(): void {
  _testSummary();
  _testLedger();
  console.log('[graveyard-ledger] OK — all checks passed');
}

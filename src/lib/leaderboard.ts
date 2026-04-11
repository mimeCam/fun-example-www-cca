// src/lib/leaderboard.ts
// Per-author batting average aggregation — the leaderboard data layer.
// No new tables. No new dependencies. Pure computation over existing ledger.
// Reuses tallyVerdicts() from batting-average.ts — one algorithm, two scopes.
//
// Sort order: pct DESC → total DESC → firstSeal ASC (earliest staker ranks higher on tie).
//
// Credits: Mike (arch spec §leaderboard), Tanya (UX — transparency board, not gamification)

import { getAllAuthorSlugs, getSealsByAuthor, getVerdictEventsForSlugs } from './conviction-ledger';
import { tallyVerdicts, toPercent } from './batting-average';
import type { BattingAverage } from './batting-average';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthorStats {
  slug:        string;
  avg:         BattingAverage;
  firstSeal:   number | null;
  rank:        number;
  isActive:    boolean;  // true if last seal within 30 days
}

// ---------------------------------------------------------------------------
// Per-author average — pure after DB calls are done
// ---------------------------------------------------------------------------

function buildAvg(sealCount: number, verdictEvents: { post_slug: string; payload_json: string | null }[]): BattingAverage {
  if (!sealCount) return { status: 'cold', total: 0 };
  const { correct, wrong, evolved, pending } = tallyVerdicts(verdictEvents, sealCount);
  if (correct + wrong + evolved === 0) return { status: 'cold', total: 0 };
  return { status: 'live', total: sealCount, correct, wrong, pending, pct: toPercent(correct, wrong, evolved) };
}

function isActive(latestSealTs: number | undefined): boolean {
  if (!latestSealTs) return false;
  return Date.now() - latestSealTs < 30 * 24 * 60 * 60 * 1000;
}

function buildAuthorStats(slug: string, rank: number): AuthorStats {
  const seals = getSealsByAuthor(slug);
  const slugList = seals.map(s => s.post_slug);
  const verdictEvents = getVerdictEventsForSlugs(slugList);
  const avg = buildAvg(seals.length, verdictEvents);
  const latestSeal = seals.at(-1)?.timestamp;
  return { slug, avg, firstSeal: seals[0]?.timestamp ?? null, rank, isActive: isActive(latestSeal) };
}

// ---------------------------------------------------------------------------
// Sorting — stable: pct DESC, total DESC, firstSeal ASC
// ---------------------------------------------------------------------------

function avgPct(a: BattingAverage): number {
  return a.status === 'live' ? a.pct : -1;
}

function avgTotal(a: BattingAverage): number {
  return a.status === 'live' ? a.total : 0;
}

function compareAuthors(a: AuthorStats, b: AuthorStats): number {
  const pctDiff = avgPct(b.avg) - avgPct(a.avg);
  if (pctDiff !== 0) return pctDiff;
  const totalDiff = avgTotal(b.avg) - avgTotal(a.avg);
  if (totalDiff !== 0) return totalDiff;
  return (a.firstSeal ?? Infinity) - (b.firstSeal ?? Infinity);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all authors with ≥1 seal, ranked by conviction accuracy. */
export function getLeaderboard(): AuthorStats[] {
  try {
    const slugs = getAllAuthorSlugs();
    const unranked = slugs.map(slug => buildAuthorStats(slug, 0));
    unranked.sort(compareAuthors);
    return unranked.map((a, i) => ({ ...a, rank: i + 1 }));
  } catch { return []; }
}

/** Returns stats for a single author, or null if author has no seals. */
export function getAuthorStats(authorSlug: string): AuthorStats | null {
  try {
    const board = getLeaderboard();
    return board.find(a => a.slug === authorSlug) ?? null;
  } catch { return null; }
}

// src/pages/api/og/batting-average.png.ts
// OG share card for batting average — sitewide or per-author.
//
// GET /api/og/batting-average.png                  → sitewide card
// GET /api/og/batting-average.png?author=ada       → per-author card
//
// Pipeline: computeBattingAverage() or getBattingAverageResult()
//         → battingAverageLayout() → Satori → PNG
// Cache: public, max-age=3600, stale-while-revalidate=86400
//
// Credits: Mike (Portability Kit spec), Tanya (UX §20 — OG card spec)

import type { APIRoute } from 'astro';
import {
  computeBattingAverage,
  getBattingAverageResult,
} from '../../../lib/batting-average';
import { renderBattingAverageImage } from '../../../lib/og/renderOGImage';
import type { OGAuthor } from '../../../lib/og/renderOGImage';
import { buildTrackRecord } from '../../../lib/track-record';
import { recordStage } from '../../../lib/record-stage';
import { getSealsByAuthor } from '../../../lib/conviction-ledger';
import { siteDefaults } from '../../../config/seo.config';
import { getCollection } from 'astro:content';

export const prerender = false;

function cacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  };
}

/** Build a sitewide OG card (no author param). */
async function sitewideCard(siteName: string): Promise<Uint8Array> {
  const avg = computeBattingAverage();
  return renderBattingAverageImage(avg, siteName);
}

/** Build a per-author OG card. */
async function authorCard(
  authorSlug: string, siteName: string,
): Promise<Uint8Array> {
  const allPosts = await getCollection('blog');
  const count = allPosts.length;
  const result = getBattingAverageResult(authorSlug, count);
  const avg = toBattingAverage(result);
  // Record-age stage — mirrors the live /author/[slug] page (Mike napkin §7.3).
  // `?author=<slug>` is already the cache key; SWR of 24h is acceptable given
  // record-stage boundaries are months/years apart (Mike §8 risk table).
  const stage = authorRecordStage(authorSlug, allPosts);
  const author = toOGAuthor(authorSlug, result, stage);
  return renderBattingAverageImage(avg, siteName, author);
}

/** Compute record-stage for the given author, null-safe through trackData. */
function authorRecordStage(
  authorSlug: string,
  allPosts: Awaited<ReturnType<typeof getCollection<'blog'>>>,
): ReturnType<typeof recordStage> {
  const sealedSlugs = getSealsByAuthor(authorSlug).map(s => s.post_slug);
  const authorPosts = allPosts.filter(p => sealedSlugs.includes(p.slug));
  const track = buildTrackRecord(authorPosts);
  return recordStage(track.firstSealDate);
}

/** Convert BattingAverageResult → BattingAverage discriminated union. */
function toBattingAverage(
  r: ReturnType<typeof getBattingAverageResult>,
) {
  if (!r.eligible || r.battingAverage === null) {
    return { status: 'cold' as const, total: 0 };
  }
  const pct = Math.round(r.battingAverage * 100);
  const wrong = r.resolvedTotal - r.resolvedCorrect;
  const pending = r.totalSealed - r.resolvedTotal;
  return {
    status: 'live' as const,
    total: r.totalSealed,
    correct: r.resolvedCorrect,
    wrong,
    pending: Math.max(0, pending),
    pct,
  };
}

/** Map BattingAverageResult → OGAuthor for the layout builder. */
function toOGAuthor(
  slug: string,
  r: ReturnType<typeof getBattingAverageResult>,
  stage: ReturnType<typeof recordStage>,
): OGAuthor {
  return {
    slug,
    name: slug,
    tier: r.trophyTier,
    selectivity: r.selectivityRate,
    recordStage: stage,
  };
}

export const GET: APIRoute = async ({ url }) => {
  const { siteName } = siteDefaults();
  const authorSlug = url.searchParams.get('author');
  const png = authorSlug
    ? await authorCard(authorSlug, siteName)
    : await sitewideCard(siteName);
  return new Response(png, { status: 200, headers: cacheHeaders() });
};

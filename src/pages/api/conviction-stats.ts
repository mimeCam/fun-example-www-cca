// src/pages/api/conviction-stats.ts
// GET /api/conviction-stats — sitewide BA stats OR per-slug conviction stage.
//
// Without ?slug=: returns per-author BA result with all integrity fields.
//   Uses ?author= (default: 'host') and optional ?published=.
//   When ?published= is omitted, auto-resolves from the content collection.
//
// With ?slug=: returns per-slug conviction stage for TrustBadge polling.
//
// Sitewide shape (all integrity fields):
//   { author, battingAverage, resolvedTotal, resolvedCorrect,
//     selectivityRate, totalPublished, totalSealed,
//     eligible, trophyTier, computedAt }
//
// Per-slug shape (polled by trust-badge-ceremony.ts every 5s):
//   { slug, conviction_stage, sealed_at, verdict }
//
// Credits: Mike Koch (spec §BA-Integrity + Portability Kit),
//          Tanya (§4.4 — trophy display contract), Elon (selectivity visibility)

import type { APIRoute } from 'astro';
import { getBattingAverageResult } from '../../lib/batting-average';
import { getSealEntry }            from '../../lib/conviction-ledger';
import { getTstForSeal }           from '../../lib/timestamp-store';
import { getDisputeResolution }    from '../../lib/verdict-dispute';
import { getCollection }           from 'astro:content';
import { jsonStamped }             from '../../lib/clock';

export const prerender = false;

type ConvictionStage = 'unsealed' | 'pending' | 'sealed' | 'upheld' | 'overturned';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function buildAuthorPayload(
  authorSlug: string, totalPublished: number,
): Record<string, unknown> {
  const r = getBattingAverageResult(authorSlug, totalPublished);
  // jsonStamped bakes `computedAt: nowISO()` routed through the SSR clock.
  return jsonStamped({
    author:          authorSlug,
    battingAverage:  r.battingAverage,
    resolvedTotal:   r.resolvedTotal,
    resolvedCorrect: r.resolvedCorrect,
    selectivityRate: r.selectivityRate,
    totalPublished:  r.totalPublished,
    totalSealed:     r.totalSealed,
    eligible:        r.eligible,
    trophyTier:      r.trophyTier,
  });
}

function deriveStage(
  sealEntry:  ReturnType<typeof getSealEntry>,
  tst:        ReturnType<typeof getTstForSeal>,
  resolution: ReturnType<typeof getDisputeResolution>,
): ConvictionStage {
  if (!sealEntry)  return 'unsealed';
  if (!tst)        return 'pending';
  if (!resolution) return 'sealed';
  return resolution.state; // 'upheld' | 'overturned'
}

function buildSlugPayload(slug: string): Record<string, unknown> {
  const sealEntry  = getSealEntry(slug);
  const tst        = getTstForSeal(slug);
  const resolution = getDisputeResolution(slug);
  return {
    slug,
    conviction_stage: deriveStage(sealEntry, tst, resolution),
    sealed_at:        sealEntry?.timestamp ?? null,
    verdict:          resolution?.state    ?? null,
  };
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const slug = url.searchParams.get('slug');
    if (slug) return json(buildSlugPayload(slug));

    const author = url.searchParams.get('author') ?? 'host';
    const pubParam = url.searchParams.get('published');
    const published = pubParam !== null
      ? parseInt(pubParam, 10)
      : await resolvePublishedCount();
    return json(buildAuthorPayload(author, published));
  } catch {
    return json({ error: 'Stats unavailable' }, 503);
  }
};

/** Auto-resolve total published from content collection when not provided. */
async function resolvePublishedCount(): Promise<number> {
  try {
    return (await getCollection('blog')).length;
  } catch { return 0; }
}

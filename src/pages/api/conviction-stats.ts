// src/pages/api/conviction-stats.ts
// GET /api/conviction-stats — sitewide BA stats OR per-slug conviction stage.
//
// Without ?slug=: returns per-author BA result with all integrity fields.
//   Uses ?author= (default: 'host') and ?published= (total published posts count).
//
// With ?slug=: returns per-slug conviction stage for TrustBadge polling.
//
// Sitewide shape (updated — all new integrity fields):
//   { battingAverage, resolvedTotal, resolvedCorrect,
//     selectivityRate, totalPublished, totalSealed,
//     eligible, trophyTier, computedAt }
//
// Per-slug shape (polled by trust-badge-ceremony.ts every 5s):
//   { slug, conviction_stage, sealed_at, verdict }
//
// Credits: Mike Koch (spec §BA-Integrity — 5 new API fields),
//          Tanya (§4.4 — trophy display contract), Elon (selectivity visibility)

import type { APIRoute } from 'astro';
import { getBattingAverageResult } from '../../lib/batting-average';
import { getSealEntry }            from '../../lib/conviction-ledger';
import { getTstForSeal }           from '../../lib/timestamp-store';
import { getDisputeResolution }    from '../../lib/verdict-dispute';

export const prerender = false;

type ConvictionStage = 'unsealed' | 'pending' | 'sealed' | 'upheld' | 'overturned';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function buildSitewidePayload(authorSlug: string, totalPublished: number): Record<string, unknown> {
  const r = getBattingAverageResult(authorSlug, totalPublished);
  return {
    battingAverage:  r.battingAverage,    // null if not eligible
    resolvedTotal:   r.resolvedTotal,
    resolvedCorrect: r.resolvedCorrect,
    selectivityRate: r.selectivityRate,   // sealed / published
    totalPublished:  r.totalPublished,
    totalSealed:     r.totalSealed,
    eligible:        r.eligible,          // resolvedTotal >= MIN_VERDICTS (5)
    trophyTier:      r.trophyTier,        // 'locked'|'bronze'|'silver'|'gold'|'diamond'
    computedAt:      new Date().toISOString(),
  };
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

export const GET: APIRoute = ({ url }) => {
  try {
    const slug      = url.searchParams.get('slug');
    if (slug) return json(buildSlugPayload(slug));
    const author    = url.searchParams.get('author') ?? 'host';
    const published = parseInt(url.searchParams.get('published') ?? '0', 10);
    return json(buildSitewidePayload(author, published));
  } catch {
    return json({ error: 'Stats unavailable' }, 503);
  }
};

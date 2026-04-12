// src/pages/api/conviction-stats.ts
// GET /api/conviction-stats — sitewide batting average OR per-slug conviction stage.
//
// Without ?slug=: returns sitewide conviction batting average (unchanged shape).
// With ?slug=:    returns per-slug conviction stage for TrustBadge polling.
//
// Sitewide shape:
//   { status, total, correct, wrong, pending, pct, computedAt }
//
// Per-slug shape (polled by trust-badge-ceremony.ts every 5s):
//   { slug, conviction_stage, sealed_at, verdict }
//
// Credits: Mike (spec §5 — conviction-stats audit + verdict field addition),
//          Tanya (§4.2 — TrustBadge token fix), ceremony.ts (polling contract)

import type { APIRoute } from 'astro';
import { computeBattingAverage } from '../../lib/batting-average';
import { getSealEntry }          from '../../lib/conviction-ledger';
import { getTstForSeal }         from '../../lib/timestamp-store';
import { getDisputeResolution }  from '../../lib/verdict-dispute';

export const prerender = false;

type ConvictionStage = 'unsealed' | 'pending' | 'sealed' | 'upheld' | 'overturned';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function buildSitewidePayload(avg: ReturnType<typeof computeBattingAverage>): Record<string, unknown> {
  const base = { computedAt: new Date().toISOString() };
  if (avg.status === 'cold') return { status: 'cold', total: 0, ...base };
  return {
    status:  avg.status,
    total:   avg.total,
    correct: avg.correct,
    wrong:   avg.wrong,
    pending: avg.pending,
    pct:     avg.pct,
    ...base,
  };
}

function deriveStage(
  sealEntry: ReturnType<typeof getSealEntry>,
  tst:       ReturnType<typeof getTstForSeal>,
  resolution: ReturnType<typeof getDisputeResolution>,
): ConvictionStage {
  if (!sealEntry)   return 'unsealed';
  if (!tst)         return 'pending';
  if (!resolution)  return 'sealed';
  return resolution.state;  // 'upheld' | 'overturned'
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
    const slug = url.searchParams.get('slug');
    if (slug) return json(buildSlugPayload(slug));
    return json(buildSitewidePayload(computeBattingAverage()));
  } catch {
    return json({ error: 'Stats unavailable' }, 503);
  }
};

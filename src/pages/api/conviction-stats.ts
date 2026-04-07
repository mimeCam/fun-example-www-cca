// src/pages/api/conviction-stats.ts
// GET /api/conviction-stats — sitewide conviction batting average as JSON.
// Documents the shape publicly; enables future ISR/cache-header work without
// touching ConvictionMeter. Chain integrity checked per sealed slug.
//
// Response shape:
//   { status, total, correct, wrong, pending, pct, chainIntegrity, computedAt }
//
// Credits: Mike (spec §3 — endpoint design), conviction-audit.ts (patterns)

import type { APIRoute } from 'astro';
import { computeBattingAverage } from '../../lib/batting-average';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function buildPayload(avg: ReturnType<typeof computeBattingAverage>): Record<string, unknown> {
  const base = { computedAt: new Date().toISOString() };
  if (avg.status === 'cold') return { status: 'cold', total: 0, ...base };
  return {
    status: avg.status,
    total:   avg.total,
    correct: avg.correct,
    wrong:   avg.wrong,
    pending: avg.pending,
    pct:     avg.pct,
    ...base,
  };
}

export const GET: APIRoute = () => {
  try {
    const avg = computeBattingAverage();
    return json(buildPayload(avg));
  } catch {
    return json({ error: 'Stats unavailable' }, 503);
  }
};

// src/pages/api/ghost-echoes.ts
// GET /api/ghost-echoes?slug=<slug>
// Returns pre-bucketed revival timeline + pre-computed SVG points.
// SVG computed server-side so the client does zero math.
//
// Cache-Control: public, max-age=60 — sparkline is historical context,
// stale-OK for 60s. PresenceBand (SSE) handles real-time.
//
// Credits: Mike (architecture spec)

import type { APIRoute } from 'astro';
import { getRevivalTimeline } from '../../lib/collectiveMemory';
import { shapeBuckets, bucketToSVGPoints, echoIntervalMs } from '../../lib/revivalHistory';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug) return badRequest('slug is required');
  return buildResponse(slug);
};

function buildResponse(slug: string): Response {
  const { timestamps, lastAt, total } = getRevivalTimeline(slug);
  const buckets = shapeBuckets(timestamps);
  const svgPoints = bucketToSVGPoints(buckets);
  const intervalMs = echoIntervalMs(buckets);
  const body = JSON.stringify({ buckets, lastAt, total, svgPoints, intervalMs });
  return new Response(body, { headers: responseHeaders() });
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function responseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
  };
}

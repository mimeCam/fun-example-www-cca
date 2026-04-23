// src/pages/api/stage-counts.ts
// GET /api/stage-counts — live/endangered/graveyard post counts as JSON.
// Used by RiverFilter client-side refresh to keep stage pill badges current.
//
// Response: { live, endangered, graveyard, computedAt }
// Cache: 30s public, 60s stale-while-revalidate — fresh enough for count badges.
//
// Credits: Mike (arch §Points of Interest — count badge hydration)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { allPostDisplayData } from '../../lib/postMeta';
import { getStageCounts } from '../../lib/river-data';
import { jsonStamped } from '../../lib/clock';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
    },
  });
}

export const GET: APIRoute = async () => {
  try {
    const posts  = await getCollection('blog');
    const counts = getStageCounts(allPostDisplayData(posts));
    return json(jsonStamped({ ...counts }));
  } catch {
    return json({ error: 'Counts unavailable' }, 503);
  }
};

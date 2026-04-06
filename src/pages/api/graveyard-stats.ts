// src/pages/api/graveyard-stats.ts
// GET /api/graveyard-stats — lightweight stats for the Graveyard Discovery Surface.
// Joins content collection with DB revival data at request time (SSR).
// Returns { entombed, recentlyRisen, newestSlug, resurrectionRate }.
//
// Cache: 60s CDN, stale-while-revalidate 300s. No writes.
//
// Credits: Mike (architecture spec — Graveyard Discovery Surface)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { allPostDisplayData } from '../../lib/postMeta';
import {
  getEntombedCount,
  getResurrectionRate,
  getNewestEntombed,
} from '../../lib/graveyardStats';

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const display = allPostDisplayData(posts);

  const entombed = getEntombedCount(display);
  const recentlyRisen = display.filter(p => p.entombed && p.recentlyRisen).length;
  const newest = getNewestEntombed(display);
  const resurrectionRate = getResurrectionRate(display);

  return json({ entombed, recentlyRisen, newestSlug: newest?.slug ?? null, resurrectionRate });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

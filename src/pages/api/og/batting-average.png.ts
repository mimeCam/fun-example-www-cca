// src/pages/api/og/batting-average.png.ts
// Dedicated OG share card for the sitewide batting average.
// Shorter cache (5 min) than post cards — the number can change on any verdict event.
//
// GET /api/og/batting-average.png → 200 image/png (1200×630)
//
// Pipeline: computeBattingAverage() → battingAverageLayout() → Satori → PNG
// Cache: public, max-age=300 (5 min) — live score must never be stale on a share.
//
// Credits: Mike (arch spec — batting-average.png endpoint), Tanya (UX §20 — OG card spec)

import type { APIRoute } from 'astro';
import { computeBattingAverage } from '../../../lib/batting-average';
import { renderBattingAverageImage } from '../../../lib/og/renderOGImage';
import { siteDefaults } from '../../../config/seo.config';

export const prerender = false;

/** 5-minute cache — batting average changes rarely but must be fresh on share events. */
function cacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=300',
  };
}

export const GET: APIRoute = async () => {
  const { siteName } = siteDefaults();
  const avg = computeBattingAverage();
  const png = await renderBattingAverageImage(avg, siteName);
  return new Response(png, { status: 200, headers: cacheHeaders() });
};

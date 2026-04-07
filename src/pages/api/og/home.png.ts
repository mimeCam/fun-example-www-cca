// src/pages/api/og/home.png.ts
// Sitewide accountability OG card — batting average front and center.
// Linked from <meta og:image> on the homepage and /predictions.
//
// GET /api/og/home.png → 200 image/png (1200×630)
//
// Pipeline: buildHomeAccountabilityData() → accountabilityLayout() → Satori → PNG
// Falls back to 'cold' variant when DB is unavailable (Docker cold-start safe).

import type { APIRoute } from 'astro';
import { buildHomeAccountabilityData } from '../../../lib/og/accountabilityData';
import { renderAccountabilityImage } from '../../../lib/og/renderOGImage';
import { siteDefaults } from '../../../config/seo.config';

export const prerender = false;

/** Cache headers: 1 hr fresh + 24 hr stale-while-revalidate. */
function cacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  };
}

export const GET: APIRoute = async () => {
  const { siteName } = siteDefaults();
  const data = buildHomeAccountabilityData(siteName);
  const png  = await renderAccountabilityImage(data);
  return new Response(png, { status: 200, headers: cacheHeaders() });
};

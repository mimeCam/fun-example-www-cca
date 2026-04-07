// src/pages/api/og/[slug].png.ts
// Accountability OG image endpoint — renders a batting-average card per post.
// The batting average is the hook; decay aesthetics are retired from this surface.
//
// GET /api/og/hello-world.png → 200 image/png (1200×630)
// GET /api/og/nonexistent.png → 404
//
// Pipeline: buildPostAccountabilityData() → accountabilityLayout() → Satori → PNG
// Cache: 1 hr fresh + 24 hr stale-while-revalidate (same as before)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { decayFactor, freshnessTag } from '../../../lib/decay-engine';
import { getRevivalCount } from '../../../lib/collectiveMemory';
import { buildPostAccountabilityData } from '../../../lib/og/accountabilityData';
import { renderAccountabilityImage } from '../../../lib/og/renderOGImage';
import { siteDefaults } from '../../../config/seo.config';

export const prerender = false;

/** Find a blog post by slug, or null. */
async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

/** Revival count with graceful fallback for build environments. */
function safeRevivalCount(slug: string): number {
  try { return getRevivalCount(slug); }
  catch { return 0; }
}

/** Compute freshness tag for a post entry. */
function postFreshness(post: any, slug: string) {
  const revivals = safeRevivalCount(slug);
  const decay = decayFactor(post.data.pubDate.toISOString(), 365, new Date(), revivals);
  return freshnessTag(decay);
}

/** Cache headers: 1 hr fresh + 24 hr stale-while-revalidate. */
function cacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  };
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response('Not found', { status: 404 });

  const post = await findPost(slug);
  if (!post) return new Response('Post not found', { status: 404 });

  const { siteName } = siteDefaults();
  const data = buildPostAccountabilityData({
    slug,
    title:       post.data.title,
    description: post.data.description,
    predictions: post.data.predictions,
    freshness:   postFreshness(post, slug),
  }, siteName);

  const png = await renderAccountabilityImage(data);
  return new Response(png, { status: 200, headers: cacheHeaders() });
};

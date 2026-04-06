// src/pages/api/og/[slug].png.ts
// Dynamic OG image endpoint — renders a decay-encoded PNG per post.
// Fresh posts glow. Dying posts fade. The preview IS the hook.
//
// GET /api/og/hello-world.png → 200 image/png (1200×630)
// GET /api/og/nonexistent.png → 404

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { decayFactor, freshnessTag } from '../../../lib/decay-engine';
import { getRevivalCount } from '../../../lib/collectiveMemory';
import { renderOGImage } from '../../../lib/og/renderOGImage';
import { siteDefaults } from '../../../config/seo.config';
import type { OGImageData } from '../../../lib/og/ogLayout';

export const prerender = false;

/** Find a blog post by slug, or null. */
async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

/** Assemble OGImageData from a resolved post entry. */
function buildOGData(post: any, slug: string): OGImageData {
  const now = new Date();
  const pubISO = post.data.pubDate.toISOString();
  const revivals = safeRevivalCount(slug);
  const decay = decayFactor(pubISO, 365, now, revivals);

  return {
    title: post.data.title,
    description: post.data.description,
    badge: post.data.badge,
    mood: post.data.mood,
    decay,
    freshness: freshnessTag(decay),
    revivalCount: revivals,
    pubDate: pubISO,
    siteName: siteDefaults().siteName,
  };
}

/** Revival count with graceful fallback for build environments. */
function safeRevivalCount(slug: string): number {
  try { return getRevivalCount(slug); }
  catch { return 0; }
}

/** Cache headers: 1hr fresh + 24hr stale-while-revalidate. */
function cacheHeaders(): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  };
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return notFound();

  const post = await findPost(slug);
  if (!post) return notFound();

  const data = buildOGData(post, slug);
  const png = await renderOGImage(data);
  return new Response(png, { status: 200, headers: cacheHeaders() });
};

function notFound(): Response {
  return new Response('Post not found', { status: 404 });
}

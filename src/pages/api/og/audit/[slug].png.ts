// src/pages/api/og/audit/[slug].png.ts
// OG image for conviction audit receipts — 1200×630 single-panel card.
// Shows: post title, conviction score, sealed date, verdict outcome.
// Cold state (unsealed): shows "NOT YET SEALED" with score placeholder.
// Pipeline: AuditOGData → auditLayout → satori → resvg → PNG
//
// GET /api/og/audit/building-in-public.png → 200 image/png
// Cache: 1 hr fresh + 24 hr stale-while-revalidate
//
// Credits: Mike (napkin plan §api/og/audit/[slug].png)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getSealEntry }       from '../../../../lib/conviction-ledger';
import { getVerdictDisplay }  from '../../../../lib/verdict-display';
import { renderAuditImage }   from '../../../../lib/og/renderOGImage';
import type { AuditOGData }   from '../../../../lib/og/renderOGImage';

export const prerender = false;

/** Find a blog post by slug — null if missing. */
async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

/** Build AuditOGData from slug + post existence check. */
function buildAuditData(slug: string, title: string): AuditOGData {
  const seal    = getSealEntry(slug);
  const verdict = seal ? getVerdictDisplay(slug) : null;
  return {
    title,
    score:    seal?.conviction_score ?? null,
    sealedAt: seal?.timestamp ?? null,
    verdict,
  };
}

/** PNG cache headers — 1 hr fresh + 24 hr stale-while-revalidate. */
function pngHeaders(): Record<string, string> {
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

  try {
    const data = buildAuditData(slug, post.data.title);
    const png  = await renderAuditImage(data);
    return new Response(png, { status: 200, headers: pngHeaders() });
  } catch {
    return new Response('Render error', { status: 500 });
  }
};

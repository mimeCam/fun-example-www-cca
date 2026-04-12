// src/pages/api/og/seal/[slug].png.ts
// GET /api/og/seal/[slug].png — shareable conviction seal card (1200×630).
// Shows: post title, conviction score + bar, sealed date, HMAC fingerprint, batting avg.
// Pipeline: SealOGData → sealLayout → satori → resvg → PNG
// Cache: 1 hr fresh + 24 hr stale-while-revalidate (score/date are immutable post-seal).
//
// Credits: Mike (napkin plan §api/og/seal/[slug].png), Tanya (§5 shareable card spec)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getSealEntry }         from '../../../../lib/conviction-ledger';
import { getBattingAverageResult } from '../../../../lib/batting-average';
import { renderSealImage }      from '../../../../lib/og/renderOGImage';
import type { SealOGData }      from '../../../../lib/og/renderOGImage';

export const prerender = false;

async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

async function buildSealData(slug: string, title: string): Promise<SealOGData> {
  const posts  = await getCollection('blog');
  const seal   = getSealEntry(slug);
  const avg    = getBattingAverageResult('host', posts.length);
  return {
    title,
    score:      seal?.conviction_score ?? null,
    sealedAt:   seal?.timestamp        ?? null,
    hmacHint:   seal?.hmac_seal        ? seal.hmac_seal.slice(0, 12) : null,
    battingPct: avg.battingAverage,
  };
}

function pngHeaders(): Record<string, string> {
  return {
    'Content-Type':  'image/png',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400, immutable',
  };
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response('Not found', { status: 404 });

  const post = await findPost(slug);
  if (!post) return new Response('Post not found', { status: 404 });

  try {
    const data = await buildSealData(slug, post.data.title);
    const png  = await renderSealImage(data);
    return new Response(png, { status: 200, headers: pngHeaders() });
  } catch {
    return new Response('Render error', { status: 500 });
  }
};

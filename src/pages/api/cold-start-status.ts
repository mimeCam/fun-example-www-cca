// src/pages/api/cold-start-status.ts
// GET  /api/cold-start-status?slug= → grace state snapshot
// POST /api/cold-start-status       → record a reader visit (body: { slug })
//
// GET: returns { warming, readerCount, threshold, daysUntilClockStarts }.
//      Used by ConvictionHero for future progressive enhancement (live ticker).
//      No auth required — reader count is not sensitive data.
//
// POST: records the visiting reader fingerprint (sha256(ip+ua)) in reader_events.
//       Idempotent per visitor per slug. Returns updated grace state.
//
// Credits: Mike (architecture spec §Modules)

export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection }  from 'astro:content';
import {
  readerCount, recordReader, getGraceState,
  READER_THRESHOLD, GRACE_DAYS,
} from '../../lib/cold-start';
import { daysSince } from '../../lib/temporal';
import { decayFactor } from '../../lib/decay-engine';
import { daysUntilEntombment, CLOCK_MAX_DAYS } from '../../lib/death-clock';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

function buildGracePayload(slug: string, pubDate: string): object {
  const daysOld      = daysSince(pubDate);
  const count        = readerCount(slug);
  const warming      = count < READER_THRESHOLD && daysOld < GRACE_DAYS;
  const decay        = decayFactor(pubDate, CLOCK_MAX_DAYS);
  const daysLeft     = daysUntilEntombment(pubDate, 0, 0, CLOCK_MAX_DAYS);
  const graceState   = getGraceState(slug, pubDate, decay, daysLeft);
  return { graceState, readerCount: count, threshold: READER_THRESHOLD };
}

// ---------------------------------------------------------------------------
// GET — read grace state snapshot
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) return badRequest('slug is required');

  const post = await findPost(slug);
  if (!post)  return badRequest('post not found');

  const pubDate = post.data.pubDate.toISOString();
  return jsonOk(buildGracePayload(slug, pubDate));
};

// ---------------------------------------------------------------------------
// POST — record reader visit, return updated grace state
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  let body: { slug?: string };
  try { body = await request.json(); } catch { return badRequest('invalid JSON'); }

  const slug = body.slug?.trim();
  if (!slug) return badRequest('slug is required');

  const post = await findPost(slug);
  if (!post)  return badRequest('post not found');

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? '';

  recordReader(slug, ip, ua);
  const pubDate = post.data.pubDate.toISOString();
  return jsonOk(buildGracePayload(slug, pubDate));
};

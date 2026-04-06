// src/pages/api/death-clock.ts
// GET /api/death-clock?slug=<slug>
// Returns countdown state: daysRemaining, urgencyLevel, decayFactor, labels.
// Cache-Control: max-age=300 — countdown changes by days, not seconds.
//
// Credits: Mike (architecture spec)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getRevivalCount, getReadingSeconds } from '../../lib/collectiveMemory';
import { decayFactor } from '../../lib/decay-engine';
import {
  daysUntilEntombment, clockUrgency, deathClockLabel,
  deathClockA11yLabel, CLOCK_MAX_DAYS,
} from '../../lib/death-clock';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug) return badRequest('slug is required');
  return clockResponse(slug);
};

async function clockResponse(slug: string): Promise<Response> {
  const post = await findPost(slug);
  if (!post) return new Response('not found', { status: 404 });
  return buildClockData(slug, post.data.pubDate.toISOString());
}

async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

function buildClockData(slug: string, pubDateISO: string): Response {
  const revivalCount   = safeRead(() => getRevivalCount(slug),   0);
  const readingSeconds = safeRead(() => getReadingSeconds(slug), 0);
  const now = new Date();
  const factor        = decayFactor(pubDateISO, CLOCK_MAX_DAYS, now, revivalCount, readingSeconds);
  const daysRemaining = daysUntilEntombment(pubDateISO, revivalCount, readingSeconds, CLOCK_MAX_DAYS, now);
  const urgency       = clockUrgency(daysRemaining);
  const body = JSON.stringify({
    slug, daysRemaining, urgencyLevel: urgency,
    decayFactor: +factor.toFixed(4),
    label:    deathClockLabel(daysRemaining, urgency),
    a11yLabel: deathClockA11yLabel(daysRemaining),
  });
  return new Response(body, { headers: responseHeaders() });
}

function safeRead<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function responseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };
}

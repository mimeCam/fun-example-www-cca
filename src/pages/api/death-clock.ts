// src/pages/api/death-clock.ts
// GET /api/death-clock?slug=<slug>
// Returns countdown state: daysRemaining, urgencyLevel, decayFactor, labels.
// Cache-Control: max-age=300 — countdown changes by days, not seconds.
//
// Credits: Mike (architecture spec)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getRevivalCount, getReadingSeconds } from '../../lib/collectiveMemory';
import { decayFactor, dominantConviction, wireDecayStage } from '../../lib/decay-engine';
import type { ConvictionVerdict } from '../../lib/decay-engine';
import {
  daysUntilEntombment, clockUrgency, deathClockLabel,
  deathClockA11yLabel, CLOCK_MAX_DAYS,
} from '../../lib/death-clock';
import { nowDate } from '../../lib/clock';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug) return badRequest('slug is required');
  return clockResponse(slug);
};

async function clockResponse(slug: string): Promise<Response> {
  const post = await findPost(slug);
  if (!post) return new Response('not found', { status: 404 });
  const verdicts = (post.data.convictions ?? []).map(c => c.verdict as ConvictionVerdict);
  const conviction = dominantConviction(verdicts);
  return buildClockData(slug, post.data.pubDate.toISOString(), conviction);
}

async function findPost(slug: string) {
  const posts = await getCollection('blog');
  return posts.find(p => p.slug === slug) ?? null;
}

function buildClockData(
  slug: string,
  pubDateISO: string,
  conviction: ConvictionVerdict | null,
): Response {
  const revivalCount   = safeRead(() => getRevivalCount(slug),   0);
  const readingSeconds = safeRead(() => getReadingSeconds(slug), 0);
  // SSR-pinned via withClock middleware — `nowDate()` agrees byte-for-byte
  // across every handler in the same request. No more per-handler drift.
  const now = nowDate();
  const factor        = decayFactor(pubDateISO, CLOCK_MAX_DAYS, now, revivalCount, readingSeconds, conviction);
  const daysRemaining = daysUntilEntombment(pubDateISO, revivalCount, readingSeconds, CLOCK_MAX_DAYS, now, conviction);
  const urgency       = clockUrgency(daysRemaining);
  // decayStage — sole-producer wire helper. Same `(pubDate, revivals, reading,
  // conviction, maxDays, now)` tuple as the factor above so the JSON stage
  // string never disagrees with the UI card. Mike §7.1 / §7.2.
  const decayStage    = wireDecayStage(pubDateISO, revivalCount, readingSeconds, conviction, CLOCK_MAX_DAYS, now);
  const body = JSON.stringify({
    slug, daysRemaining, urgencyLevel: urgency,
    decayFactor: +factor.toFixed(4),
    decayStage,
    conviction,
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

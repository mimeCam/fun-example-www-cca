// src/pages/api/endangered.ts
// GET /api/endangered — returns all endangered posts sorted by death proximity.
// Pure SSR function of content + DB. Cache-Control: no-store.
//
// Sources: blog collection (365d window) + community_posts (180d window).
// Returns EndangeredPost[] sorted daysLeft ASC.
//
// Credits: Mike (architecture napkin plan §6 — API contract)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getLivePosts, COMMUNITY_MAX_DAYS } from '../../lib/communityPosts';
import { getRevivalCount, getReadingSeconds } from '../../lib/collectiveMemory';
import { decayFactor, wireDecayStage } from '../../lib/decay-engine';
import {
  isEndangered,
  urgencyLevel,
  daysUntilEntomb,
  sortByUrgency,
} from '../../lib/endangered';
import type { EndangeredPost } from '../../lib/endangered';

export const prerender = false;

/** Build EndangeredPost entries from the static blog collection. */
async function blogEndangered(): Promise<EndangeredPost[]> {
  const posts = await getCollection('blog');
  return posts
    .filter(p => p.data.pubDate != null)
    .map(p => buildEntry(
      p.slug,
      p.data.title,
      p.data.pubDate!.toISOString(),
    ))
    .filter(p => isEndangered(p.decay));
}

/** Build EndangeredPost entries from community DB posts. */
function communityEndangered(): EndangeredPost[] {
  return getLivePosts()
    .map(p => buildEntry(p.slug, p.title, p.submitted_at, COMMUNITY_MAX_DAYS))
    .filter(p => isEndangered(p.decay));
}

/** Compute decay and assemble a single EndangeredPost record. */
function buildEntry(
  slug: string,
  title: string,
  pubDate: string,
  maxDays?: number,
): EndangeredPost {
  const revivalCount = getRevivalCount(slug);
  const readingSeconds = getReadingSeconds(slug);
  const decay = decayFactor(pubDate, maxDays, undefined, revivalCount, readingSeconds);
  // decayStage MUST come from the wire helper — never re-derive thresholds
  // here. Mike §7.1 / §7.2 — single source of truth for the wire vocabulary.
  const decayStage = wireDecayStage(pubDate, revivalCount, readingSeconds, null, maxDays);
  return {
    slug,
    title,
    decay,
    daysLeft: daysUntilEntomb(decay, maxDays),
    urgency: urgencyLevel(decay),
    revivalCount,
    pubDate,
    decayStage,
  };
}

export const GET: APIRoute = async () => {
  const [blog, community] = await Promise.all([
    blogEndangered(),
    Promise.resolve(communityEndangered()),
  ]);
  const sorted = sortByUrgency([...blog, ...community]);
  return new Response(JSON.stringify(sorted), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

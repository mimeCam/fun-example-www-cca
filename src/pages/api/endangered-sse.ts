// src/pages/api/endangered-sse.ts
// SSE endpoint — pushes live endangered-post state to connected clients.
// GET /api/endangered-sse
//
// Emits EndangeredPost[] snapshot every POLL_MS; auto-closes after TIMEOUT_MS.
// Client re-sorts cards via CSS `order` property on each emission — no DOM re-mount.
// Pattern mirrors dispute-sse.ts exactly — no new realtime primitive invented.
//
// Credits: Mike (architecture §endangered-sse — follow dispute-sse.ts pattern)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getLivePosts, COMMUNITY_MAX_DAYS } from '../../lib/communityPosts';
import { getRevivalCount, getReadingSeconds } from '../../lib/collectiveMemory';
import { decayFactor } from '../../lib/decay-engine';
import {
  isEndangered,
  urgencyLevel,
  daysUntilEntomb,
  sortByUrgency,
} from '../../lib/endangered';
import type { EndangeredPost } from '../../lib/endangered';

export const prerender = false;

const POLL_MS    = 5_000;
const TIMEOUT_MS = 120_000;
const KEEPALIVE_MS = 25_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseHeaders(): HeadersInit {
  return {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

function frame(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function ping(): Uint8Array {
  return new TextEncoder().encode(': keepalive\n\n');
}

function buildEntry(
  slug: string,
  title: string,
  pubDate: string,
  maxDays?: number,
): EndangeredPost {
  const revivalCount   = getRevivalCount(slug);
  const readingSeconds = getReadingSeconds(slug);
  const decay = decayFactor(pubDate, maxDays, undefined, revivalCount, readingSeconds);
  return { slug, title, decay, daysLeft: daysUntilEntomb(decay, maxDays), urgency: urgencyLevel(decay), revivalCount, pubDate };
}

async function snapshot(): Promise<EndangeredPost[]> {
  const posts = await getCollection('blog');
  const blog = posts
    .filter(p => p.data.pubDate != null)
    .map(p => buildEntry(p.slug, p.data.title, p.data.pubDate!.toISOString()))
    .filter(p => isEndangered(p.decay));
  const community = getLivePosts()
    .map(p => buildEntry(p.slug, p.title, p.submitted_at, COMMUNITY_MAX_DAYS))
    .filter(p => isEndangered(p.decay));
  return sortByUrgency([...blog, ...community]);
}

// ---------------------------------------------------------------------------
// Stream factory
// ---------------------------------------------------------------------------

function makeStream(): ReadableStream<Uint8Array> {
  let poll:      ReturnType<typeof setInterval>;
  let keepalive: ReturnType<typeof setInterval>;
  let kill:      ReturnType<typeof setTimeout>;

  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      // Immediate snapshot on connect
      try { ctrl.enqueue(frame(await snapshot())); } catch { return; }

      poll = setInterval(async () => {
        try { ctrl.enqueue(frame(await snapshot())); }
        catch { clearInterval(poll); clearInterval(keepalive); }
      }, POLL_MS);

      keepalive = setInterval(() => {
        try { ctrl.enqueue(ping()); }
        catch { clearInterval(poll); clearInterval(keepalive); }
      }, KEEPALIVE_MS);

      kill = setTimeout(() => {
        clearInterval(poll);
        clearInterval(keepalive);
        try { ctrl.close(); } catch { /* already closed */ }
      }, TIMEOUT_MS);
    },
    cancel() {
      clearInterval(poll);
      clearInterval(keepalive);
      clearTimeout(kill);
    },
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const GET: APIRoute = () =>
  new Response(makeStream(), { headers: sseHeaders() });

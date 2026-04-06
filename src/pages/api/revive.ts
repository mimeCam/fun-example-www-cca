// src/pages/api/revive.ts
// POST endpoint for collective memory revival signals.
// Accepts { slug }, increments count, returns { ok, count }.
// Rate-limited by IP+slug (30s window). Returns JSON for UI feedback.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  canRevive,
  incrementRevival,
  recordRevival,
} from '../../lib/collectiveMemory';
import { broadcast } from '../../lib/heartbeat';
import { getConstellation } from '../../lib/constellationLookup';

export const prerender = false;

/** Extract client IP from request headers. */
function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Validate slug exists in the blog collection. */
async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('Invalid JSON');

  const { slug } = body;
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  // Allow spectacle demo without touching the DB or rate limiter.
  if (slug === '__demo__') return jsonOk({ ok: true, count: 0, resonance: [] });
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  const ip = clientIp(request);
  if (!canRevive(ip, slug)) return tooManyRequests();

  const count = incrementRevival(slug);
  recordRevival(ip, slug);

  const constellation = await getConstellation(slug);
  const resonance = constellation.length > 0 ? constellation : undefined;
  broadcast({ slug, count, ts: Date.now(), resonance });

  return jsonOk({ ok: true, count, resonance: resonance ?? [] });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try { return await req.json(); }
  catch { return null; }
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function jsonOk(data: Record<string, unknown>): Response {
  const headers = { 'Content-Type': 'application/json' };
  return new Response(JSON.stringify(data), { status: 200, headers });
}

function tooManyRequests(): Response {
  return new Response(null, { status: 429 });
}

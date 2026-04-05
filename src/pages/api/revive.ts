// src/pages/api/revive.ts
// POST endpoint for collective memory revival signals.
// Fire-and-forget from client — accepts { slug }, increments count.
// Rate-limited by IP+slug (30s window). No response body needed.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  canRevive,
  incrementRevival,
  recordRevival,
} from '../../lib/collectiveMemory';

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
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  const ip = clientIp(request);
  if (!canRevive(ip, slug)) return tooManyRequests();

  incrementRevival(slug);
  recordRevival(ip, slug);
  return new Response(null, { status: 204 });
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

function tooManyRequests(): Response {
  return new Response(null, { status: 429 });
}

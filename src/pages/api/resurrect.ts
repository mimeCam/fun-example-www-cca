// src/pages/api/resurrect.ts
// POST endpoint for resurrecting entombed posts.
// Accepts { slug }, bumps revival count by RESURRECT_BONUS (3),
// sets risen_at timestamp. Returns { ok, count }.
// Rate-limited by session/IP (same pattern as /api/revive).

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  canRevive,
  canReviveBySession,
  recordRevival,
  recordRevivalBySession,
  resurrectPost,
} from '../../lib/collectiveMemory';
import { broadcast } from '../../lib/heartbeat';
import { RESURRECT_BONUS } from '../../lib/entomb';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('Invalid JSON');

  const { slug } = body;
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  const sessionId = request.headers.get('x-session-id');
  const ip = clientIp(request);
  if (!checkRateLimit(sessionId, ip, slug)) return tooMany();

  const count = resurrectPost(slug, RESURRECT_BONUS);
  stampRateLimit(sessionId, ip, slug);
  broadcast({ slug, count, ts: Date.now() });

  return jsonOk({ ok: true, count });
};

// ---------------------------------------------------------------------------
// Helpers (same pattern as revive.ts — small, focused)
// ---------------------------------------------------------------------------

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try { return await req.json(); }
  catch { return null; }
}

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

function checkRateLimit(sid: string | null, ip: string, slug: string): boolean {
  if (sid) return canReviveBySession(sid, slug);
  return canRevive(ip, slug);
}

function stampRateLimit(sid: string | null, ip: string, slug: string): void {
  if (sid) { recordRevivalBySession(sid, slug); return; }
  recordRevival(ip, slug);
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tooMany(): Response {
  return new Response(null, { status: 429 });
}

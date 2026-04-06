// src/pages/api/revive.ts
// POST endpoint for collective memory revival signals.
// Accepts { slug }, increments count, returns { ok, count }.
// Rate-limited by IP+slug (30s window). Returns JSON for UI feedback.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  canRevive,
  canReviveBySession,
  incrementRevival,
  incrementDailyCount,
  recordRevival,
  recordRevivalBySession,
} from '../../lib/collectiveMemory';
import { broadcast } from '../../lib/heartbeat';
import { getConstellation } from '../../lib/constellationLookup';
import { checkRevival } from '../../lib/revivalGuard';
import { FP_HEADER } from '../../lib/visitorFingerprint';

export const prerender = false;

/** Prefer session-based rate check; fall back to IP when session is absent. */
function checkRateLimit(sessionId: string | null, ip: string, slug: string): boolean {
  if (sessionId) return canReviveBySession(sessionId, slug);
  return canRevive(ip, slug);
}

/** Stamp whichever rate-limit store is in use. */
function stampRateLimit(sessionId: string | null, ip: string, slug: string): void {
  if (sessionId) { recordRevivalBySession(sessionId, slug); return; }
  recordRevival(ip, slug);
}

/** Stamp daily counters for fingerprint and IP. */
function stampDailyCounts(fp: string | null, ip: string): void {
  if (fp) incrementDailyCount(`fp:${fp}`);
  incrementDailyCount(`ip:${ip}`);
}

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

  const sessionId = request.headers.get('x-session-id');
  const ip = clientIp(request);

  // Revival Guard: PoW + fingerprint + velocity checks
  const proof = request.headers.get('x-proof-of-work');
  const fp = request.headers.get(FP_HEADER.toLowerCase()) ?? request.headers.get(FP_HEADER);
  const guard = checkRevival(proof, fp, ip, slug);
  if (!guard.allowed) return tooManyRequests(guard.reason);

  // Legacy per-slug rate limit still applies
  if (!checkRateLimit(sessionId, ip, slug)) return tooManyRequests();

  const count = incrementRevival(slug);
  stampRateLimit(sessionId, ip, slug);
  stampDailyCounts(fp, ip);

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

function tooManyRequests(reason?: string): Response {
  const body = reason ? JSON.stringify({ error: reason }) : null;
  const headers = reason ? { 'Content-Type': 'application/json' } : {};
  return new Response(body, { status: 429, headers });
}

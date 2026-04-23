// src/pages/api/revive.ts
// POST endpoint for collective memory revival signals.
// Accepts { slug }, increments count, returns { ok, count }.
// Rate-limited by IP+slug (30s window). Returns JSON for UI feedback.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPostBySlug as getCommunityPost } from '../../lib/communityPosts';
import {
  canRevive,
  canReviveBySession,
  incrementRevival,
  incrementDailyCount,
  recordRevival,
  recordRevivalBySession,
  getMonthlyRevivalCount,
  getRevivalCounts,
} from '../../lib/collectiveMemory';
import { broadcast, broadcastNamed } from '../../lib/heartbeat';
import { revive as presenceRevive } from '../../lib/presence-hub';
import { isEndangered, urgencyLevel } from '../../lib/endangered';
import { getConstellation } from '../../lib/constellationLookup';
import { checkRevival } from '../../lib/revivalGuard';
import { FP_HEADER } from '../../lib/visitorFingerprint';
import { decayFactorWithCount, stageFromFactor, decayFactor, wireDecayStage } from '../../lib/decay-engine';
import { canRevive as stageCanRevive, gateReason } from '../../lib/revival-gate';
import { appendResonance } from '../../lib/conviction-ledger';
import { getReadingSeconds } from '../../lib/collectiveMemory';
// v175 §3.1 — the route binds to its named producer. Tri-Mouth import-regex
// (scripts/check-tri-mouth.ts §5.5) fails the build if this line regresses.
import { buildRevivePayload } from '../../lib/revival-engine';

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

/** Find a post by slug — blog collection first, community DB fallback. */
async function findPost(slug: string): Promise<string | null> {
  const posts = await getCollection('blog');
  const blog = posts.find(p => p.slug === slug);
  if (blog?.data.pubDate) return blog.data.pubDate.toISOString();
  const community = getCommunityPost(slug);
  return community?.submitted_at ?? null;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('Invalid JSON');

  const { slug } = body;
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  // Allow spectacle demo without touching the DB or rate limiter.
  if (slug === '__demo__') return jsonOk({ ok: true, count: 0, resonance: [] });
  const pubDateISO = await findPost(slug);
  if (!pubDateISO) return badRequest('Unknown slug');

  // Stage gate — defense in depth: reject non-revivable posts at the API level.
  // The UI gate (CSS + data-gated) handles UX; this guards direct API calls.
  const currentStage = stageFromFactor(decayFactor(pubDateISO));
  if (!stageCanRevive(currentStage)) return stageGated(gateReason(currentStage));

  const sessionId = request.headers.get('x-session-id');
  const ip = clientIp(request);

  // Revival Guard: PoW + fingerprint + velocity checks
  const proof = request.headers.get('x-proof-of-work');
  const fp = request.headers.get(FP_HEADER.toLowerCase()) ?? request.headers.get(FP_HEADER);
  const guard = checkRevival(proof, fp, ip, slug);
  if (!guard.allowed) return tooManyRequests(guard.reason);

  // Session idempotency: one revival per tab per post (permanent lock).
  // Returns 200 with ok:false so the client animation doesn't break on double-tap.
  if (!checkRateLimit(sessionId, ip, slug)) return alreadyRevived();

  const count = incrementRevival(slug);
  stampRateLimit(sessionId, ip, slug);
  stampDailyCounts(fp, ip);

  // Recalculate decay with new count so client can decide dismiss vs update
  const decayAfterRevival  = decayFactorWithCount(pubDateISO, count);
  const decayBeforeRevival = decayFactorWithCount(pubDateISO, count - 1);
  // Post-revival wire stage — uses the *post-increment* count so the string
  // matches `decayAfterRevival` the client already reads. Mike §7.3 — clients
  // dismiss endangered cards off the float; a mismatched stage would flicker.
  const readerSecondsForStage = (() => { try { return getReadingSeconds(slug); } catch { return 0; } })();
  const decayStage = wireDecayStage(pubDateISO, count, readerSecondsForStage);

  const monthlyCount = getMonthlyRevivalCount(slug);

  const constellation = await getConstellation(slug);
  const resonance     = constellation.length > 0 ? constellation : undefined;
  // Derive related slugs for cascade bloom (additive field — existing callers unaffected).
  const relatedSlugs  = constellation.map(c => c.slug);

  // Append resonance to conviction ledger (non-blocking — never break revival on ledger failure)
  try {
    const readerSeconds = getReadingSeconds(slug);
    appendResonance(slug, 'revival', { revivalCount: count, readerSeconds });
  } catch { /* ledger append is best-effort */ }

  broadcast({ slug, count, ts: Date.now(), decayAfterRevival, resonance });
  // Notify honest presence subscribers on this slug
  presenceRevive(slug);
  // Alert endangered-feed SSE clients when revived post is (or just left) the danger zone
  if (isEndangered(decayAfterRevival)) {
    broadcastNamed('endangered-update', { slug, revivalCount: count, decay: decayAfterRevival, urgency: urgencyLevel(decayAfterRevival) });
  }

  // v175 §3.1 — delegate to the named producer. Route is a thin adapter;
  // the payload shape lives in src/lib/revival-engine.ts, same module all
  // three mouths (click / R / curl) imply through the Tri-Mouth inventory.
  return jsonOk(buildRevivePayload({
    count,
    decayAfterRevival,
    decayStage,
    monthlyCount,
    survivorRank:       survivorRank(slug, count),
    relatedSlugs,
    resonance:          resonance ?? [],
    wasEndangered:      isEndangered(decayBeforeRevival),
    isEndangeredAfter:  isEndangered(decayAfterRevival),
  }));
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

/** Generic guard rejection (velocity, fingerprint cap, etc.). */
function tooManyRequests(reason?: string): Response {
  const body    = reason ? JSON.stringify({ error: reason }) : null;
  const headers: HeadersInit = reason ? { 'Content-Type': 'application/json' } : {};
  return new Response(body, { status: 429, headers });
}

/**
 * Stage gate rejection — post is not in a revivable stage.
 * Mike Koch arch §4, Tanya P1-C: "API contract mirrors the UI gate."
 */
function stageGated(reason: string): Response {
  const body = JSON.stringify({ error: reason });
  return new Response(body, { status: 403, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Idempotent "already revived" response — always 200 so the client animation
 * doesn't break on double-tap. Reason field lets client show "already kept" copy.
 * (Mike Koch arch spec §6: "double-taps don't break the client animation")
 */
function alreadyRevived(): Response {
  const body = JSON.stringify({ ok: false, reason: 'already_revived' });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Percentile rank (0–100) of this post's revival count vs all others.
 * 100 = more revived than every other post. Feeds copy in RevivalMoment badge.
 */
function survivorRank(slug: string, count: number): number {
  const all    = getRevivalCounts();
  const values = [...all.values()].filter((_, i) => [...all.keys()][i] !== slug);
  if (!values.length) return 100;
  const lower  = values.filter(v => v <= count).length;
  return Math.round((lower / values.length) * 100);
}

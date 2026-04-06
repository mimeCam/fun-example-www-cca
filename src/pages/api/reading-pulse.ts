// src/pages/api/reading-pulse.ts
// POST /api/reading-pulse — records passive reading time for a post.
//
// Called by the client reading-heartbeat IIFE every 30 seconds while the
// reader has the page visible. Accumulates reading_seconds in the revivals
// table, which is then fed into readingBonus() to slow decay.
//
// Rate limit: one pulse per 25s per session+slug (client fires every 30s,
// so honest clients are always within the window). Excess pulses are
// silently dropped with { ok: false, reason: 'rate_limited' }.
//
// Credits: Mike (architecture spec)

import type { APIRoute } from 'astro';
import { canPulse, recordPulse, addReadingSeconds } from '../../lib/collectiveMemory';
import { readingBonus } from '../../lib/decay-engine';

const MAX_SECONDS_PER_PULSE = 60; // reject suspiciously large bursts

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('invalid json');

  const { slug, seconds } = body;
  if (!isValidSlug(slug)) return badRequest('invalid slug');
  if (!isValidSeconds(seconds)) return badRequest('invalid seconds');

  const sessionId = extractSession(request);
  if (!canPulse(sessionId, slug)) {
    return json({ ok: false, reason: 'rate_limited' });
  }

  recordPulse(sessionId, slug);
  const totalSeconds = addReadingSeconds(slug, seconds);
  const bonus = readingBonus(totalSeconds);

  return json({ ok: true, totalSeconds, bonus: +bonus.toFixed(4) });
};

// ---------------------------------------------------------------------------
// Helpers — each under 10 lines
// ---------------------------------------------------------------------------

async function parseBody(req: Request): Promise<{ slug: string; seconds: number } | null> {
  try {
    const data = await req.json();
    if (typeof data?.slug === 'string' && typeof data?.seconds === 'number') return data;
    return null;
  } catch {
    return null;
  }
}

function isValidSlug(slug: string): boolean {
  return typeof slug === 'string' && slug.length > 0 && slug.length < 120;
}

function isValidSeconds(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_SECONDS_PER_PULSE;
}

function extractSession(req: Request): string {
  return req.headers.get('x-session-id') ?? req.headers.get('x-forwarded-for') ?? 'anon';
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(reason: string): Response {
  return json({ ok: false, reason }, 400);
}

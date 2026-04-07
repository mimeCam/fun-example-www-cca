// src/pages/api/verdict-resolve.ts
// POST endpoint — author seals a final verdict at runtime.
// Called once per post; double-seal returns { ok: false, alreadySealed: true }.
// Guards: ADMIN_SECRET (cookie or body), slug existence, valid verdict value.
//
// Auth paths (both supported):
//   1. Cookie: admin_token=<hmac>          — Admin web UI
//   2. Body:   { ..., adminSecret: string } — CLI / curl
//
// Response: { ok, verdict, hmac, sealedAt }
//
// Credits: Mike (arch §verdict-resolve endpoint), Tanya (UX §3 verdict page)

import type { APIRoute } from 'astro';
import { createHmac } from 'crypto';
import { getCollection } from 'astro:content';
import { broadcastNamed } from '../../lib/heartbeat';
import { resolveVerdict, VerdictAlreadySealedError } from '../../lib/verdict-resolver';
import type { VerdictOutcome } from '../../lib/verdict-resolver';
import { computeBattingAverage } from '../../lib/batting-average';

export const prerender = false;

const VALID_VERDICTS = new Set<VerdictOutcome>(['still-true', 'evolved', 'wrong', 'abandoned']);

// ---------------------------------------------------------------------------
// Auth helpers — mirrors conviction-seal.ts exactly
// ---------------------------------------------------------------------------

function adminSecret(): string {
  return process.env.ADMIN_SECRET ?? '';
}

function expectedToken(secret: string): string {
  return createHmac('sha256', secret).update('admin-session').digest('hex');
}

function cookieAuthed(request: Request): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match ? match[1] === expectedToken(secret) : false;
}

function bodyAuthed(secret: unknown): boolean {
  const s = adminSecret();
  return !!s && secret === s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(msg: string): Response { return json({ error: msg }, 400); }
function forbidden(): Response { return json({ error: 'Forbidden' }, 403); }

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

function isValidVerdict(v: unknown): v is VerdictOutcome {
  return typeof v === 'string' && VALID_VERDICTS.has(v as VerdictOutcome);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return badRequest('Invalid JSON');

  const { slug, verdict, note = '', adminSecret: bodySecret } = body;

  if (!cookieAuthed(request) && !bodyAuthed(bodySecret)) return forbidden();
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (!isValidVerdict(verdict)) return badRequest('verdict must be: still-true | evolved | wrong | abandoned');
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  try {
    const secret = adminSecret();
    const record = resolveVerdict(slug, verdict, String(note ?? '').trim(), secret);

    // Broadcast verdict:declared — non-blocking, fire-and-forget (never rejects POST).
    try {
      const batting = computeBattingAverage();
      const newBattingAvg = batting.status === 'live' ? batting.pct    : null;
      const correct      = batting.status === 'live' ? batting.correct  : 0;
      const wrong        = batting.status === 'live' ? batting.wrong    : 0;
      const pending      = batting.status === 'live' ? batting.pending  : 0;
      broadcastNamed('verdict:declared', { slug, verdict, newBattingAvg, correct, wrong, pending, sealedAt: record.sealedAt });
    } catch { /* broadcast failure must never reject the POST */ }

    return json({ ok: true, verdict: record.verdict, hmac: record.hmac_seal, sealedAt: record.sealedAt });
  } catch (err) {
    if (err instanceof VerdictAlreadySealedError) {
      return json({ ok: false, alreadySealed: true, error: 'Verdict already sealed' }, 409);
    }
    throw err;
  }
};

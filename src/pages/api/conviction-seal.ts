// src/pages/api/conviction-seal.ts
// POST endpoint — author seals conviction score at publish time.
// Called once per post via cli/seal-conviction.mjs. Double-seal returns 409.
// Guards: ADMIN_SECRET env var, slug existence, score range 1-10.
//
// Auth paths (both supported):
//   1. Body: { slug, score, authorNote, adminSecret }  — CLI / curl
//   2. Cookie: admin_token=<hmac>                       — Admin web UI
//
// Response: { hash, sealedAt, score, authorNote }

import type { APIRoute } from 'astro';
import { createHmac } from 'crypto';
import { getCollection } from 'astro:content';
import { broadcastNamed } from '../../lib/heartbeat';
import {
  sealConviction,
  getSealEntry,
  ConvictionAlreadySealedError,
} from '../../lib/conviction-ledger';

export const prerender = false;

function adminSecret(): string {
  return process.env.ADMIN_SECRET ?? '';
}

/** Derive the deterministic admin token from the secret. */
function expectedToken(secret: string): string {
  return createHmac('sha256', secret).update('admin-session').digest('hex');
}

function validScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 10;
}

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(msg: string): Response { return json({ error: msg }, 400); }
function forbidden(): Response { return json({ error: 'Forbidden' }, 403); }

/** Check cookie-based auth (admin web UI). */
function cookieAuthed(request: Request): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match ? match[1] === expectedToken(secret) : false;
}

/** Check body-based auth (CLI / curl). */
function bodyAuthed(secret: unknown): boolean {
  const s = adminSecret();
  return !!s && secret === s;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return badRequest('Invalid JSON');

  const { slug, score, authorNote, adminSecret: bodySecret } = body;

  if (!cookieAuthed(request) && !bodyAuthed(bodySecret)) return forbidden();
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (!validScore(score)) return badRequest('score must be integer 1–10');
  if (!authorNote || typeof authorNote !== 'string' || !authorNote.trim()) {
    return badRequest('authorNote is required');
  }
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  try {
    const entry = sealConviction(slug, score, authorNote.trim());
    // Broadcast conviction:sealed so live-conviction-hero.ts can update open tabs.
    broadcastNamed('conviction:sealed', { slug, score: entry.conviction_score });
    return json({
      hash: entry.hash,
      sealedAt: entry.timestamp,
      score: entry.conviction_score,
      authorNote: entry.author_note,
    });
  } catch (err) {
    if (err instanceof ConvictionAlreadySealedError) {
      return json({ error: 'Already sealed', entry: getSealEntry(slug) }, 409);
    }
    throw err;
  }
};

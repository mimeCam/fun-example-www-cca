// src/pages/api/seal-prediction.ts
// POST endpoint — admin seals a verdict for one prediction.
// Mirrors verdict-resolve.ts exactly: cookie auth, HMAC, INSERT OR IGNORE.
// Two sources of truth: DB is the audit proof; frontmatter remains canonical display source.
// After sealing via this endpoint, admin updates the frontmatter verdict field manually.
//
// Request body: { slug, prediction_id, verdict: 'correct'|'incorrect'|'partial', adminSecret? }
// Response: { ok, slug, prediction_id, verdict, hmac, sealedAt }
//
// Credits: Mike (arch spec §Route-Layer §4), Tanya (UX §5 admin page)

import type { APIRoute } from 'astro';
import { createHmac } from 'crypto';
import { getCollection } from 'astro:content';
import { predDb } from '../../lib/prediction-engine';

export const prerender = false;

const VALID_VERDICTS = new Set(['correct', 'incorrect', 'partial']);

// ---------------------------------------------------------------------------
// Auth helpers — identical to verdict-resolve.ts (same ADMIN_SECRET surface)
// ---------------------------------------------------------------------------

function adminSecret(): string { return process.env.ADMIN_SECRET ?? ''; }

function expectedToken(secret: string): string {
  return createHmac('sha256', secret).update('admin-session').digest('hex');
}

function cookieAuthed(request: Request): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') ?? '';
  const match  = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
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

function sealHmac(slug: string, predId: string, verdict: string, secret: string): string {
  return createHmac('sha256', secret).update(`${slug}:${predId}:${verdict}`).digest('hex');
}

async function predictionExists(slug: string, predId: string): Promise<boolean> {
  const posts = await getCollection('blog');
  const post  = posts.find(p => p.slug === slug);
  if (!post) return false;
  return (post.data.predictions ?? []).some((p: { id: string }) => p.id === predId);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const { slug, prediction_id, verdict, adminSecret: bodySecret } = body;

  if (!cookieAuthed(request) && !bodyAuthed(bodySecret)) return json({ error: 'Forbidden' }, 403);
  if (!slug || typeof slug !== 'string')              return json({ error: 'Missing slug' }, 400);
  if (!prediction_id || typeof prediction_id !== 'string') return json({ error: 'Missing prediction_id' }, 400);
  if (!verdict || !VALID_VERDICTS.has(verdict as string))  return json({ error: 'verdict must be: correct | incorrect | partial' }, 400);
  if (!(await predictionExists(slug, prediction_id))) return json({ error: 'Unknown prediction' }, 404);

  const db = predDb();
  if (!db) return json({ error: 'DB unavailable' }, 503);

  const secret   = adminSecret();
  const hmac     = sealHmac(slug, prediction_id, verdict as string, secret);
  const sealedAt = Date.now();

  const result = db.prepare(
    `INSERT OR IGNORE INTO predictions_ledger (slug, prediction_id, verdict, sealed_at, hmac)
     VALUES (?, ?, ?, ?, ?)`
  ).run(slug, prediction_id, verdict, sealedAt, hmac);

  if (result.changes === 0) {
    return json({ ok: false, alreadySealed: true, error: 'Prediction already sealed' }, 409);
  }

  return json({ ok: true, slug, prediction_id, verdict, hmac, sealedAt });
};

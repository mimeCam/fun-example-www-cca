// src/pages/api/seal-self.ts
// POST /api/seal-self — self-service conviction seal. No ADMIN_SECRET required.
// Auth: single-use HMAC capability token from /api/author-token.
//
// Body:     { slug, score, authorNote, authorSlug, token }
// Response: identical shape to /api/conviction-seal for full API parity.
//           Existing CLI, audit routes, and API consumers are unmodified.
//
// Credits: Mike (self-service seal spec, API parity requirement)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  sealConviction,
  getSealEntry,
  updateAnchor,
  updateOtsProof,
  ConvictionAlreadySealedError,
} from '../../lib/conviction-ledger';
import { validateAndConsume }   from '../../lib/author-token';
import { anchorConviction }     from '../../lib/conviction-anchor';
import { hashContent }          from '../../lib/rfc3161-client';
import { storeTst }             from '../../lib/timestamp-store';
import { stampAll }             from '../../lib/timestamp-facade';
import { broadcastNamed }       from '../../lib/heartbeat';

export const prerender = false;

// ---------------------------------------------------------------------------
// Small pure helpers — each ≤ 6 lines
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

function validSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG_RE.test(s);
}

function validScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 10;
}

async function postSlugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

// ---------------------------------------------------------------------------
// Side-effect helpers — anchor + stamp, both fail-open
// ---------------------------------------------------------------------------

async function tryAnchor(entry: ReturnType<typeof sealConviction>): Promise<string | null> {
  const pat = process.env.GITHUB_PAT;
  if (!pat || !entry.hmac_seal) return null;
  try {
    const r = await anchorConviction(
      entry.post_slug, entry.conviction_score!, entry.hmac_seal, entry.timestamp, pat,
    );
    updateAnchor(entry.hash, r.gistId, r.url, r.rawUrl);
    return r.url;
  } catch { return null; }
}

async function tryStamp(entry: ReturnType<typeof sealConviction>): Promise<string | null> {
  try {
    const preimage  = `${entry.post_slug}:${entry.conviction_score}:${entry.timestamp}`;
    const composite = await stampAll(hashContent(preimage));
    if (composite.rfc3161) storeTst(entry.hash, composite.rfc3161.token, composite.tsaName);
    if (composite.ots) updateOtsProof(entry.hash, composite.ots.proofBytes, 'pending', composite.ots.calendarUrl);
    if (composite.errors.length) console.warn('[seal-self] stamp errors (seal valid):', composite.errors);
    return composite.rfc3161?.token ?? null;
  } catch (err) {
    console.warn('[seal-self] stampAll failed (seal valid):', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const { slug, score, authorNote, authorSlug, token } = body;

  if (!validSlug(slug))       return json({ error: 'Invalid slug' }, 400);
  if (!validScore(score))     return json({ error: 'score must be integer 1–10' }, 400);
  if (!authorNote || typeof authorNote !== 'string' || !authorNote.trim())
    return json({ error: 'authorNote is required' }, 400);
  if (!validSlug(authorSlug)) return json({ error: 'Invalid authorSlug' }, 400);
  if (typeof token !== 'string') return json({ error: 'token required' }, 400);

  if (!validateAndConsume(token, authorSlug as string, slug as string))
    return json({ error: 'Invalid, expired, or already-used token' }, 403);
  if (!(await postSlugExists(slug as string))) return json({ error: 'Unknown slug' }, 404);

  try {
    const entry     = sealConviction(slug as string, score, (authorNote as string).trim(), authorSlug as string);
    const anchorUrl = await tryAnchor(entry);
    const tstToken  = await tryStamp(entry);

    broadcastNamed('conviction:sealed', { slug, score: entry.conviction_score });

    return json({
      postSlug:       slug,
      hash:           entry.hash,
      sealedAt:       entry.timestamp,
      score:          entry.conviction_score,
      authorNote:     entry.author_note,
      authorSlug:     entry.author_slug,
      anchorUrl,
      tst_token:      tstToken,
      ceremony_phase: 4,
    });
  } catch (err) {
    if (err instanceof ConvictionAlreadySealedError)
      return json({ error: 'Already sealed', entry: getSealEntry(slug as string) }, 409);
    throw err;
  }
};

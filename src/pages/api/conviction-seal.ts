// src/pages/api/conviction-seal.ts
// POST endpoint — author seals conviction score at publish time.
// Called once per post via cli/seal-conviction.mjs. Double-seal returns 409.
// Guards: ADMIN_SECRET env var, slug existence, score range 1-10.
//
// Auth paths (both supported):
//   1. Body: { slug, score, authorNote, adminSecret }  — CLI / curl
//   2. Cookie: admin_token=<hmac>                       — Admin web UI
//
// Response: { hash, sealedAt, score, authorNote, anchorUrl }
//   anchorUrl is null when GITHUB_PAT is absent or GitHub is unreachable (fail-open).

import type { APIRoute } from 'astro';
import { createHmac } from 'crypto';
import { getCollection } from 'astro:content';
import { broadcastNamed } from '../../lib/heartbeat';
import {
  sealConviction,
  getSealEntry,
  updateAnchor,
  ConvictionAlreadySealedError,
} from '../../lib/conviction-ledger';
import { anchorConviction }     from '../../lib/conviction-anchor';
import { hashContent }           from '../../lib/rfc3161-client';
import { storeTst }              from '../../lib/timestamp-store';
import { stampAll }              from '../../lib/timestamp-facade';
import { updateOtsProof }        from '../../lib/conviction-ledger';

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

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

function validAuthorSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG_RE.test(s);
}

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

  const { slug, score, authorNote, adminSecret: bodySecret, author_slug: rawAuthorSlug } = body;

  if (!cookieAuthed(request) && !bodyAuthed(bodySecret)) return forbidden();
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (!validScore(score)) return badRequest('score must be integer 1–10');
  if (!authorNote || typeof authorNote !== 'string' || !authorNote.trim()) {
    return badRequest('authorNote is required');
  }
  // author_slug is optional; if provided it must be slug-safe (prevents injection).
  if (rawAuthorSlug !== undefined && !validAuthorSlug(rawAuthorSlug)) {
    return badRequest('author_slug must be lowercase alphanumeric with hyphens, 2–32 chars');
  }
  const authorSlug = (rawAuthorSlug as string | undefined) ?? 'host';
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  try {
    const entry = sealConviction(slug, score, authorNote.trim(), authorSlug);

    // Anchor to GitHub Gist — fail-open: local seal is the source of truth.
    let anchorUrl: string | null = null;
    const pat = process.env.GITHUB_PAT;
    if (pat && entry.hmac_seal) {
      try {
        const receipt = await anchorConviction(
          slug, entry.conviction_score!, entry.hmac_seal, entry.timestamp, pat,
        );
        updateAnchor(entry.hash, receipt.gistId, receipt.url, receipt.rawUrl);
        anchorUrl = receipt.url;
      } catch { /* GitHub down or PAT invalid — anchor pending, seal still valid */ }
    }

    // Dual timestamp: RFC 3161 (instant) + OTS Bitcoin anchor (~60 min) — both fail-open.
    let tstToken: string | null = null;
    try {
      const preimage    = `${slug}:${entry.conviction_score}:${entry.timestamp}`;
      const contentHash = hashContent(preimage);
      const composite   = await stampAll(contentHash);
      if (composite.rfc3161) {
        storeTst(entry.hash, composite.rfc3161.token, composite.tsaName);
        tstToken = composite.rfc3161.token;
      }
      if (composite.ots) {
        updateOtsProof(entry.hash, composite.ots.proofBytes, 'pending', composite.ots.calendarUrl);
      }
      if (composite.errors.length) {
        console.warn('[conviction-seal] stamp errors (seal still valid):', composite.errors);
      }
    } catch (tstErr) {
      console.warn('[conviction-seal] stampAll failed (seal still valid):', tstErr);
    }

    // Broadcast conviction:sealed so live-conviction-hero.ts can update open tabs.
    broadcastNamed('conviction:sealed', { slug, score: entry.conviction_score });
    return json({
      postSlug:        slug,               // receipt download + audit link
      hash:            entry.hash,
      sealedAt:        entry.timestamp,
      score:           entry.conviction_score,
      authorNote:      entry.author_note,
      authorSlug:      entry.author_slug,
      anchorUrl,
      tst_token:       tstToken,
      ceremony_phase:  4,  // client uses this to advance to receipt phase
    });
  } catch (err) {
    if (err instanceof ConvictionAlreadySealedError) {
      return json({ error: 'Already sealed', entry: getSealEntry(slug) }, 409);
    }
    throw err;
  }
};

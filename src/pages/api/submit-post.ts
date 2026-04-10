// src/pages/api/submit-post.ts
// POST /api/submit-post — accepts a community article after PoW verification.
// Validates schema, verifies SHA-256 PoW (difficulty 4), inserts into DB.
// Returns a JSON receipt on success; JSON error objects on failure.
// Rate-limited to 1 submission per IP per 60 seconds (in-memory, per-process).

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';
import { insertPost } from '../../lib/communityPosts';

export const prerender = false;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIFFICULTY    = '0000';
const MIN_WORDS     = 50;
const MAX_TITLE_LEN = 200;
const MAX_AUTHOR_LEN = 60;
const RATE_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function contentHash(title: string, body: string): string {
  return sha256hex(title + '\n' + body);
}

function verifyPoW(title: string, body: string, nonce: number, hash: string): boolean {
  const expected = sha256hex(contentHash(title, body) + ':' + nonce);
  return expected === hash && hash.startsWith(DIFFICULTY);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface SubmitData {
  title: string;
  body: string;
  author_label: string | null;
  pow_nonce: number;
  pow_hash: string;
}

/** Returns an error key string on failure, null on success. */
function validateFields(b: Record<string, unknown>): string | null {
  if (!b.title || typeof b.title !== 'string' || !b.title.trim()) return 'title_required';
  if ((b.title as string).trim().length > MAX_TITLE_LEN)           return 'title_too_long';
  if (!b.body  || typeof b.body  !== 'string')                      return 'body_required';
  if (wordCount(b.body as string) < MIN_WORDS)                      return 'body_too_short';
  const al = b.author_label;
  if (al != null && typeof al === 'string' && al.length > MAX_AUTHOR_LEN) return 'author_label_too_long';
  if (typeof b.pow_nonce !== 'number' || !Number.isInteger(b.pow_nonce) || b.pow_nonce < 0) return 'pow_nonce_invalid';
  if (!b.pow_hash || typeof b.pow_hash !== 'string')                return 'pow_hash_required';
  return null;
}

function parseData(b: Record<string, unknown>): SubmitData {
  return {
    title:        (b.title as string).trim(),
    body:         b.body as string,
    author_label: (typeof b.author_label === 'string' && b.author_label) ? b.author_label.trim() : null,
    pow_nonce:    b.pow_nonce as number,
    pow_hash:     b.pow_hash as string,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory; resets on container restart — intentional for MVP)
// ---------------------------------------------------------------------------

const _ipStamps = new Map<string, number>();

function canSubmit(ip: string): boolean {
  const last = _ipStamps.get(ip) ?? 0;
  return Date.now() - last >= RATE_WINDOW_MS;
}

function recordSubmission(ip: string): void {
  _ipStamps.set(ip, Date.now());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
}

function generateSlug(): string {
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 5);
  return `community-${ts}-${rand}`;
}

function jsonErr(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);
  if (!canSubmit(ip)) return jsonErr(429, 'rate_limited');

  let raw: Record<string, unknown>;
  try { raw = await request.json(); }
  catch { return jsonErr(400, 'invalid_json'); }

  const fieldErr = validateFields(raw);
  if (fieldErr) return jsonErr(400, fieldErr);

  const data = parseData(raw);
  if (!verifyPoW(data.title, data.body, data.pow_nonce, data.pow_hash)) {
    return jsonErr(400, 'pow_invalid');
  }

  const slug = generateSlug();
  const post = insertPost({ slug, ...data });

  recordSubmission(ip);

  return jsonOk({
    ok:          true,
    postId:      post.slug,
    title:       post.title,
    proofHash:   post.pow_hash,
    publishedAt: new Date(post.submitted_at).toISOString(),
  });
};

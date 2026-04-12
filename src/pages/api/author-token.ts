// src/pages/api/author-token.ts
// POST /api/author-token — issue a single-use capability token for self-service sealing.
// Body:     { postSlug: string, authorSlug: string }
// Response: { token: string, expiresAt: number }
//
// Security model: HMAC-signed by server secret; single-use via author_tokens table.
// Author identity = content ownership (they know the post slug and claim the author slug).
// No ADMIN_SECRET needed — the token becomes the auth layer consumed by seal-self.ts.
//
// Credits: Mike (self-service seal architecture)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { issueToken } from '../../lib/author-token';

export const prerender = false;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG_RE.test(s);
}

async function postSlugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const { postSlug, authorSlug } = body;
  if (!validSlug(postSlug))   return json({ error: 'Invalid postSlug' }, 400);
  if (!validSlug(authorSlug)) return json({ error: 'Invalid authorSlug' }, 400);
  if (!(await postSlugExists(postSlug as string))) return json({ error: 'Unknown post' }, 404);

  const result = issueToken(authorSlug as string, postSlug as string);
  return json(result);
};

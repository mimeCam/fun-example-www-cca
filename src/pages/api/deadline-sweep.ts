// src/pages/api/deadline-sweep.ts
// POST /api/deadline-sweep — sweep all expired-unsealed posts, auto-seal as 'abandoned'.
// Auth: Authorization: Bearer <ADMIN_SECRET> header.
// Idempotent: repeated calls produce the same result (already-sealed → skipped).
// Add to deploy.sh: curl -X POST /api/deadline-sweep -H "Authorization: Bearer $ADMIN_SECRET"
// Credits: Mike (architecture spec §deadline-sweep endpoint)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { findExpiredUnsealed, autoSealExpired } from '../../lib/deadline-enforcer';
import type { PostDeadlineRecord } from '../../lib/deadline-enforcer';

export const prerender = false;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function adminSecret(): string { return process.env.ADMIN_SECRET ?? ''; }

function isAuthorized(request: Request): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const auth = request.headers.get('Authorization') ?? '';
  return auth === `Bearer ${secret}`;
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

async function loadPostRecords(): Promise<PostDeadlineRecord[]> {
  const posts = await getCollection('blog');
  return posts.map(p => ({
    slug: p.slug,
    data: { resolution_deadline: p.data.resolution_deadline, pubDate: p.data.pubDate },
  }));
}

function tally(results: ReturnType<typeof autoSealExpired>[], outcome: string): number {
  return results.filter(r => r.outcome === outcome).length;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) return json({ error: 'Forbidden' }, 403);

  const secret  = adminSecret();
  const records = await loadPostRecords();
  const expired = findExpiredUnsealed(records);
  const results = expired.map(p => autoSealExpired(p.slug, secret));

  return json({
    ok:      true,
    swept:   tally(results, 'sealed'),
    skipped: tally(results, 'skipped'),
    errors:  tally(results, 'error'),
    results,
  });
};

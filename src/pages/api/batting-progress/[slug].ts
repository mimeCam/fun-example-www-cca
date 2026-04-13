// src/pages/api/batting-progress/[slug].ts
// GET /api/batting-progress/:authorSlug
// Public — no auth required. Returns unlock progress for an author.
// API parity rule: external consumers get the same data the ring renders from.
//
// Shape: { authorSlug, resolved, required, pct, unlocked, recentVerdicts[] }
// Cache: 60s max-age, 300s stale-while-revalidate (progress ticks infrequently).
//
// Credits: Mike Koch (napkin spec §1 batting-progress endpoint)

import type { APIRoute } from 'astro';
import { getUnlockProgress } from '../../../lib/batting-average';
import { getAllAuthorSlugs, getVerdictsByAuthorRecent } from '../../../lib/conviction-ledger';

export const prerender = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentVerdict {
  postSlug:   string;
  state:      'upheld' | 'overturned';
  resolvedAt: number;  // unix ms
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictToState(payloadJson: string | null): 'upheld' | 'overturned' {
  try {
    const p = payloadJson ? JSON.parse(payloadJson) as Record<string, unknown> : {};
    return p.verdict === 'still-true' ? 'upheld' : 'overturned';
  } catch { return 'overturned'; }
}

function toRecentVerdicts(
  rows: { post_slug: string; payload_json: string | null; timestamp: number }[],
): RecentVerdict[] {
  return rows.map(r => ({
    postSlug:   r.post_slug,
    state:      verdictToState(r.payload_json),
    resolvedAt: r.timestamp,
  }));
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: 'Author not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function okJson(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const GET: APIRoute = ({ params }) => {
  const slug = params.slug ?? '';
  if (!slug) return notFound();

  const known = getAllAuthorSlugs();
  if (!known.includes(slug)) return notFound();

  const progress = getUnlockProgress(slug);
  const recent   = getVerdictsByAuthorRecent(slug, 5);

  return okJson({ ...progress, recentVerdicts: toRecentVerdicts(recent) });
};

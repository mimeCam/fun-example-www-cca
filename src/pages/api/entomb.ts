// src/pages/api/entomb.ts
// POST endpoint: record the first entombment timestamp for a post.
// Idempotent — calling twice for the same slug is safe (COALESCE in DB).
// In-memory Set caches slugs already confirmed entombed this process lifetime,
// cutting DB WAL writes under sustained load.
//
// Called by the client revival engine when it detects a post crossing
// the entombment threshold for the first time.
//
// Credits: Mike (architecture — "Honest Graveyard" napkin plan)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { entombPost, getRevivalCount, getReadingSeconds, setCauseOfDeath } from '../../lib/collectiveMemory';
import { appendResonance, getSealEntry } from '../../lib/conviction-ledger';
import { getStanceDistribution } from '../../lib/stance-ledger';
import { computeTension } from '../../lib/tension-score';
import { computeCauseOfDeath } from '../../lib/cause-of-death';

export const prerender = false;

// ---------------------------------------------------------------------------
// In-memory idempotency cache — avoids redundant WAL writes per process
// ---------------------------------------------------------------------------

const _confirmed = new Set<string>();

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('Invalid JSON');

  const { slug } = body;
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (_confirmed.has(slug)) return jsonOk({ ok: true, cached: true });
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  entombPost(slug);
  _confirmed.add(slug);

  // Compute and persist cause of death (fire-and-forget; COALESCE — first-write wins)
  try {
    const cause = computeCauseOfDeath(buildCauseData(slug));
    setCauseOfDeath(slug, cause);
  } catch { /* best-effort; cause visible on next SSR render */ }

  // Append death event to conviction ledger (non-blocking)
  try {
    const finalRevivalCount = getRevivalCount(slug);
    appendResonance(slug, 'death', { revivalCount: finalRevivalCount });
  } catch { /* ledger append is best-effort */ }

  return jsonOk({ ok: true, cached: false });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Gather the data needed for cause-of-death classification (pure → DB boundary). */
function buildCauseData(slug: string) {
  const dist    = getStanceDistribution(slug);
  const tension = dist.total >= 3 ? computeTension(dist).score / 100 : null;
  return {
    convictionSealed: getSealEntry(slug) !== null,
    revivalCount:     getRevivalCount(slug),
    readingSeconds:   getReadingSeconds(slug),
    tensionScore:     tension,
    authorRetired:    false,   // future: read from post frontmatter
  };
}

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try { return await req.json(); }
  catch { return null; }
}

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

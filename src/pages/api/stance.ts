// src/pages/api/stance.ts
// POST /api/stance — record reader stance (agree | torn | disagree) after revival.
// Same guard pattern as revive.ts. Non-blocking conviction ledger append.
// Returns tensionScore so the client can update TensionBadge immediately.
// Credits: Mike (arch spec), Tanya (UX §5.2 post-action stance chips)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { recordStance, stanceAlreadyRecorded, getStanceDistribution } from '../../lib/stance-ledger';
import type { StanceValue } from '../../lib/stance-ledger';
import { computeTension } from '../../lib/tension-score';
import { broadcastNamed } from '../../lib/heartbeat';
import { appendResonance } from '../../lib/conviction-ledger';

export const prerender = false;

const VALID_STANCES = new Set<StanceValue>(['agree', 'torn', 'disagree']);

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function isValidStance(v: unknown): v is StanceValue {
  return typeof v === 'string' && VALID_STANCES.has(v as StanceValue);
}

function isValidScore(v: unknown): v is number {
  return v === undefined || (typeof v === 'number' && v >= 1 && v <= 5);
}

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return badRequest('Invalid JSON');

  const { slug, stance, score } = body;
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (!isValidStance(stance)) return badRequest('Invalid stance — must be agree | torn | disagree');
  if (!isValidScore(score)) return badRequest('Invalid score — must be 1–5');

  const sessionId = request.headers.get('x-session-id');
  if (!sessionId) return badRequest('Missing x-session-id header');

  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  // Idempotent: return current tension without error if already recorded.
  if (stanceAlreadyRecorded(slug, sessionId)) {
    const dist = getStanceDistribution(slug);
    const tensionScore = computeTension(dist);
    return jsonOk({ ok: false, alreadyRecorded: true, tensionScore });
  }

  const recorded = recordStance(slug, sessionId, stance, score ?? 3);
  const dist      = getStanceDistribution(slug);
  const tensionScore = computeTension(dist);

  // Non-blocking ledger append — never break stance recording on ledger failure.
  try {
    appendResonance(slug, 'revival', {
      stance,
      score: score ?? 3,
      tensionLabel: tensionScore.label,
    });
  } catch { /* best-effort */ }

  // Broadcast tension update to all SSE clients watching this post.
  broadcastNamed('tension:updated', { slug, ...tensionScore });

  return jsonOk({ ok: recorded, tensionScore });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try { return await req.json(); }
  catch { return null; }
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

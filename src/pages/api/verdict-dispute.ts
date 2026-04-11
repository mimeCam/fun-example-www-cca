// src/pages/api/verdict-dispute.ts
// POST — reader files a formal dispute against an author's sealed verdict.
// Only readers who staked 'disagree' before the verdict was sealed may dispute.
// Idempotent: double-submit returns current state without error.
// Auth: X-Session-Id header (same fingerprint used by revival + stance APIs).
//
// Request:  { slug: string, reason?: string }
// Response: { ok, disputed?, alreadyDisputed?, state, summary }
//   state   — DisputeState from verdict-dispute.ts (clean | contested | …)
//   summary — DisputeSummary from dispute-quorum.ts (challenges, threshold, ratio)
//
// Credits: Mike (napkin plan §verdict-dispute-hardening, §quorum-math-is-tunable),
//          Paul Kim (Challenge Moment as must-have #3)

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getStanceForSession } from '../../lib/stance-ledger';
import { recordDispute, disputeAlreadyRecorded, getDisputeState } from '../../lib/verdict-dispute';
import { getDisputeSummary } from '../../lib/dispute-quorum';
import { SESSION_HEADER } from '../../lib/sessionToken';

export const prerender = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(msg: string): Response { return json({ ok: false, error: msg }, 400); }
function forbidden(msg: string):  Response { return json({ ok: false, error: msg }, 403); }

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

function sessionId(request: Request): string | null {
  return request.headers.get(SESSION_HEADER) ?? null;
}

function buildReply(ok: boolean, extra: Record<string, unknown>, slug: string): Response {
  const state   = getDisputeState(slug);
  const summary = getDisputeSummary(slug);
  return json({ ok, ...extra, state, summary });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return badRequest('Invalid JSON');

  const { slug } = body;
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');

  const sid = sessionId(request);
  if (!sid) return forbidden('Missing X-Session-Id header');

  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  const stance = getStanceForSession(slug, sid);
  if (stance !== 'disagree') return forbidden('Only readers who disagreed may challenge');

  const state = getDisputeState(slug);
  if (state.status === 'no-verdict') return badRequest('Verdict not yet sealed — nothing to dispute');

  if (disputeAlreadyRecorded(slug, sid)) {
    return buildReply(true, { alreadyDisputed: true }, slug);
  }

  recordDispute(slug, sid);
  return buildReply(true, { disputed: true }, slug);
};

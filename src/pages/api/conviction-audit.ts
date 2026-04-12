// src/pages/api/conviction-audit.ts
// GET endpoint — public conviction timeline for a post.
// Chain verification dropped (Elon §blockchain cosplay); returns honest entry list.
//
// Query: ?slug=the-decay-theory
// Response: { sealedScore, sealedAt, authorNote, entries[] }

import type { APIRoute } from 'astro';
import { getEntriesForSlug } from '../../lib/conviction-ledger';
import type { LedgerEntry } from '../../lib/conviction-ledger';
import { getVerdictDisplay } from '../../lib/verdict-display';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function formatEntry(e: LedgerEntry): Record<string, unknown> {
  return {
    id: e.id,
    event_type: e.event_type,
    conviction_score: e.conviction_score,
    author_note: e.author_note,
    revival_count: e.revival_count,
    reader_seconds: e.reader_seconds,
    timestamp: new Date(e.timestamp).toISOString(),
    hash: e.hash,
    prev_hash: e.prev_hash,
  };
}

function buildResponse(slug: string, entries: LedgerEntry[]): Record<string, unknown> {
  const seal    = entries.find(e => e.event_type === 'seal');
  const verdict = getVerdictDisplay(slug);
  return {
    sealedScore: seal?.conviction_score ?? null,
    sealedAt:    seal ? new Date(seal.timestamp).toISOString() : null,
    authorNote:  seal?.author_note ?? null,
    entries:     entries.map(formatEntry),
    verdict: {
      verdict:        verdict.verdict,
      verdictLabel:   verdict.verdictLabel,
      declaredAt:     verdict.declaredAt ? new Date(verdict.declaredAt).toISOString() : null,
      isContested:    verdict.isContested,
      disputeState:   verdict.disputeState,
      challengeShare: verdict.challengeShare,
      scoreContrib:   verdict.scoreContrib,
    },
  };
}

export const GET: APIRoute = ({ url }) => {
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'Missing slug' }, 400);

  try {
    const entries = getEntriesForSlug(slug);
    return json(buildResponse(slug, entries));
  } catch {
    return json({ error: 'Ledger unavailable' }, 503);
  }
};

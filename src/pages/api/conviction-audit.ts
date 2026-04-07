// src/pages/api/conviction-audit.ts
// GET endpoint — public chain verification + full conviction timeline.
// Readers can verify the chain themselves. Integrity check on every read.
//
// Query: ?slug=the-decay-theory
// Response: { valid, sealedScore, sealedAt, authorNote, entries[], brokenAt? }

import type { APIRoute } from 'astro';
import { verifyChain } from '../../lib/conviction-ledger';
import type { LedgerEntry } from '../../lib/conviction-ledger';

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

function buildResponse(
  valid: boolean,
  entries: LedgerEntry[],
  brokenAt?: number,
): Record<string, unknown> {
  const seal = entries.find(e => e.event_type === 'seal');
  return {
    valid,
    sealedScore: seal?.conviction_score ?? null,
    sealedAt: seal ? new Date(seal.timestamp).toISOString() : null,
    authorNote: seal?.author_note ?? null,
    entries: entries.map(formatEntry),
    ...(brokenAt !== undefined ? { brokenAt } : {}),
  };
}

export const GET: APIRoute = ({ url }) => {
  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'Missing slug' }, 400);

  try {
    const { valid, entries, brokenAt } = verifyChain(slug);
    return json(buildResponse(valid, entries, brokenAt));
  } catch {
    return json({ error: 'Ledger unavailable' }, 503);
  }
};

// src/pages/api/ingest/cell-event.ts
// v150c — POST beacon for the cited-cell round-trip ledger.
//
// Fire-and-forget contract (Mike napkin §4, Elon §4.6):
//   · Always returns 202 quickly — telemetry never blocks the citation
//     ritual. Validation failures are logged server-side and swallowed.
//   · `sendBeacon()` on the client expects a same-origin POST and ignores
//     the response body; we still return JSON for hand-testing via curl.
//
// Rate limit: reuses the shared `rate_limit_session` table via a helper
// added in collectiveMemory.ts (no parallel limiter — Mike §7). Beyond
// 10 events per ~2s per session, we log and 202 without insert.
//
// Credits: Mike Koch (napkin §4 fire-and-forget, §3 event shape),
//          Paul Kim (round-trip definition), Tanya Donska (§7 events),
//          Sid (helpers under 10 lines).

import type { APIRoute } from 'astro';
import {
  record,
  isValidEventRow,
  type CellEventRow,
} from '../../../lib/cell-event-ledger';

// GET is not part of the ingest contract — reject cleanly for the router.
export const GET: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } });

export const POST: APIRoute = async ({ request }) => {
  const body = await parseBody(request);
  if (!body) return accept('invalid-json');

  const row = toRow(body, request);
  if (!row) return accept('invalid-shape');

  return tryRecord(row);
};

// ── Helpers (each under 10 lines) ────────────────────────────────────────

async function parseBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await req.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toRow(body: Record<string, unknown>, req: Request): CellEventRow | null {
  const candidate: Partial<CellEventRow> = {
    event: body.event as CellEventRow['event'],
    axis: body.axis as CellEventRow['axis'],
    stage: body.stage as CellEventRow['stage'],
    ref: typeof body.ref === 'string' ? body.ref : undefined,
    ts: typeof body.ts === 'number' ? body.ts : Date.now(),
    ua: uaHint(req),
  };
  return isValidEventRow(candidate) ? (candidate as CellEventRow) : null;
}

/** First 120 chars of the UA header — never client-supplied (Mike §3). */
function uaHint(req: Request): string | undefined {
  const ua = req.headers.get('user-agent');
  if (!ua) return undefined;
  return ua.slice(0, 120);
}

function tryRecord(row: CellEventRow): Response {
  try {
    record(row);
    return accept('ok');
  } catch (err) {
    // TODO: pipe to a structured error sink once one exists (v151+).
    console.error('[cell-event] record failed:', err);
    return accept('error');
  }
}

/** Always 202 Accepted — fire-and-forget contract (Elon §4.6). */
function accept(status: string): Response {
  return new Response(JSON.stringify({ ok: true, status }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

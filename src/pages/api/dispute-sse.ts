// src/pages/api/dispute-sse.ts
// SSE endpoint — pushes live dispute tally to connected clients.
// GET /api/dispute-sse?slug=X
// Emits DisputeSummary JSON every 3 seconds; auto-closes after 90 seconds.
// Mirror pattern: /api/heartbeat.ts + /api/presence.ts
//
// Credits: Mike (napkin plan §dispute-sse, §SSE-follows-existing-pattern)

import type { APIRoute } from 'astro';
import { getDisputeSummary } from '../../lib/dispute-quorum';

export const prerender = false;

const POLL_MS    = 3_000;
const TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseHeaders(): HeadersInit {
  return {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

function frame(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function emit(ctrl: ReadableStreamDefaultController<Uint8Array>, slug: string): void {
  try { ctrl.enqueue(frame(getDisputeSummary(slug))); }
  catch { /* client disconnected — interval will be cleared on cancel */ }
}

// ---------------------------------------------------------------------------
// Stream factory
// ---------------------------------------------------------------------------

function makeStream(slug: string): ReadableStream<Uint8Array> {
  let poll: ReturnType<typeof setInterval>;
  let kill: ReturnType<typeof setTimeout>;
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      emit(ctrl, slug);  // immediate snapshot on connect
      poll = setInterval(() => emit(ctrl, slug), POLL_MS);
      kill = setTimeout(() => { clearInterval(poll); try { ctrl.close(); } catch { /* noop */ } }, TIMEOUT_MS);
    },
    cancel() { clearInterval(poll); clearTimeout(kill); },
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const GET: APIRoute = ({ url }) => {
  const slug = url.searchParams.get('slug') ?? '';
  if (!slug) return new Response('Missing slug', { status: 400 });
  return new Response(makeStream(slug), { headers: sseHeaders() });
};

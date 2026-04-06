// src/pages/api/heartbeat.ts
// SSE endpoint for real-time heartbeat events.
// GET /api/heartbeat — opens an event stream, pushes revival pulses.
// Auto-reconnect is handled by the browser's native EventSource API.

import type { APIRoute } from 'astro';
import { register, sseNamedFrame } from '../../lib/heartbeat';
import { presenceSnapshot } from '../../lib/presenceStats';
// QUARANTINED: Ambient Life Engine — phantom pulses contradict honest presence.
// Kept for rollback per AGENTS.md policy. See presence-hub.ts for replacement.
// import { startAmbientLife } from '../../lib/ambientLife';
// startAmbientLife();

export const prerender = false;

/** SSE response headers. */
function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

/** Build the streaming SSE response. */
function createStream(reg: ReturnType<typeof register>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      reg.start(controller);
      sendWelcome(controller);
      sendPresence(controller);
    },
    cancel() {
      reg.cleanup();
    },
  });
}

/** Send an initial comment so the client knows the stream is alive. */
function sendWelcome(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    ctrl.enqueue(new TextEncoder().encode(': connected\n\n'));
  } catch { /* client already gone */ }
}

/** Send presence snapshot so the client has live data immediately. */
function sendPresence(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    const snap = presenceSnapshot();
    ctrl.enqueue(sseNamedFrame('presence', snap));
  } catch { /* client already gone */ }
}

/** Parse visit count from ?fvh= query param. Returns 0 if absent. */
function parseVisitCount(url: URL): number {
  const raw = url.searchParams.get('fvh');
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Is this a "quiet mode" connection (new visitor, < 3 visits)? */
function isQuietConnection(url: URL): boolean {
  return parseVisitCount(url) < 3;
}

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const quiet = isQuietConnection(url);
  const reg = register(quiet);
  const stream = createStream(reg);
  return new Response(stream, { headers: sseHeaders() });
};

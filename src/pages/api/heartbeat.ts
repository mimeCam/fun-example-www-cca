// src/pages/api/heartbeat.ts
// SSE endpoint for real-time heartbeat events.
// GET /api/heartbeat — opens an event stream, pushes revival pulses.
// Auto-reconnect is handled by the browser's native EventSource API.

import type { APIRoute } from 'astro';
import { register, sseNamedFrame } from '../../lib/heartbeat';
import { presenceSnapshot } from '../../lib/presenceStats';
import { startAmbientLife } from '../../lib/ambientLife';

// Boot the Ambient Life Engine once on first module import.
// Seeds revival counts + starts phantom pulse timer.
startAmbientLife();

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

export const GET: APIRoute = () => {
  const reg = register();
  const stream = createStream(reg);
  return new Response(stream, { headers: sseHeaders() });
};

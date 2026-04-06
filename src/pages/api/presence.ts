// src/pages/api/presence.ts
// SSE endpoint for honest reader presence on a specific blog post.
// GET /api/presence?slug=xxx — opens a per-slug event stream.
// Streams: { readers: N } on join/leave, { slug, ts } on foreign revival.
// Zero phantoms. Zero readers = zero. That's the point.
//
// Credits: Mike (architecture), Elon (honest-zero philosophy)

import type { APIRoute } from 'astro';
import { join, getCount } from '../../lib/presence-hub';

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

/** Extract and validate slug from query string. */
function parseSlug(url: URL): string | null {
  const slug = url.searchParams.get('slug');
  if (!slug || typeof slug !== 'string') return null;
  return slug.trim() || null;
}

/** Encode an SSE frame. */
function sseFrame(event: string, data: unknown): Uint8Array {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(line);
}

/** Send initial connection comment. */
function sendWelcome(ctrl: ReadableStreamDefaultController<Uint8Array>): void {
  try { ctrl.enqueue(new TextEncoder().encode(': connected\n\n')); }
  catch { /* client gone */ }
}

/** Send current reader count so client has data immediately. */
function sendInitialCount(ctrl: ReadableStreamDefaultController<Uint8Array>, slug: string): void {
  try { ctrl.enqueue(sseFrame('presence', { readers: getCount(slug) })); }
  catch { /* client gone */ }
}

/** Initialize stream: register, welcome, send count. */
function onStreamStart(reg: ReturnType<typeof join>, slug: string, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
  reg.start(ctrl);
  sendWelcome(ctrl);
  sendInitialCount(ctrl, slug);
}

/** Build the streaming SSE response for a slug. */
function createStream(slug: string): ReadableStream<Uint8Array> {
  const reg = join(slug);
  return new ReadableStream<Uint8Array>({
    start: (ctrl) => onStreamStart(reg, slug, ctrl),
    cancel: () => reg.cleanup(),
  });
}

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const slug = parseSlug(url);
  if (!slug) return new Response('Missing slug', { status: 400 });
  const stream = createStream(slug);
  return new Response(stream, { headers: sseHeaders() });
};

// src/pages/api/presence.ts
// SSE endpoint for honest reader presence.
// GET /api/presence?slug=xxx  — per-slug event stream (blog posts).
// GET /api/presence?scope=global — aggregate site-wide stream (homepage).
// Streams: { readers: N } on join/leave, { slug, ts } on foreign revival.
// Zero phantoms. Zero readers = zero. That's the point.
//
// Credits: Mike (architecture), Elon (honest-zero philosophy)

import type { APIRoute } from 'astro';
import { join, joinGlobal, getCount, getGlobalCount } from '../../lib/presence-hub';

export const prerender = false;

type Controller = ReadableStreamDefaultController<Uint8Array>;

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

/** Check if request is for global scope. */
function isGlobalScope(url: URL): boolean {
  return url.searchParams.get('scope') === 'global';
}

/** Encode an SSE frame. */
function sseFrame(event: string, data: unknown): Uint8Array {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(line);
}

/** Send initial connection comment. */
function sendWelcome(ctrl: Controller): void {
  try { ctrl.enqueue(new TextEncoder().encode(': connected\n\n')); }
  catch { /* client gone */ }
}

/** Send current reader count for a slug. */
function sendSlugCount(ctrl: Controller, slug: string): void {
  try { ctrl.enqueue(sseFrame('presence', { readers: getCount(slug) })); }
  catch { /* client gone */ }
}

/** Send current global reader count. */
function sendGlobalCount(ctrl: Controller): void {
  try { ctrl.enqueue(sseFrame('presence', { readers: getGlobalCount() })); }
  catch { /* client gone */ }
}

/** Build SSE stream for a specific slug. */
function createSlugStream(slug: string): ReadableStream<Uint8Array> {
  const reg = join(slug);
  return new ReadableStream<Uint8Array>({
    start: (ctrl) => { reg.start(ctrl); sendWelcome(ctrl); sendSlugCount(ctrl, slug); },
    cancel: () => reg.cleanup(),
  });
}

/** Build SSE stream for global (homepage) scope. */
function createGlobalStream(): ReadableStream<Uint8Array> {
  const reg = joinGlobal();
  return new ReadableStream<Uint8Array>({
    start: (ctrl) => { reg.start(ctrl); sendWelcome(ctrl); sendGlobalCount(ctrl); },
    cancel: () => reg.cleanup(),
  });
}

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);

  if (isGlobalScope(url)) {
    return new Response(createGlobalStream(), { headers: sseHeaders() });
  }

  const slug = parseSlug(url);
  if (!slug) return new Response('Missing slug', { status: 400 });
  return new Response(createSlugStream(slug), { headers: sseHeaders() });
};

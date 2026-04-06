// src/pages/api/echo-hint.ts
// POST endpoint for First Revival Echo hints.
// Called by firstEchoClient when a first-time visitor completes their
// first revival. Schedules a delayed phantom broadcast on a linked post.
// Lightweight: no DB writes, no rate limiting (one-shot client gate).

import type { APIRoute } from 'astro';
import { scheduleEcho } from '../../lib/firstEcho';

export const prerender = false;

/** Extract session ID from request headers. */
function sessionId(request: Request): string | null {
  return request.headers.get('x-session-id');
}

/** Validate the request body shape. */
async function parseSlug(request: Request): Promise<string | null> {
  try {
    const body = await request.json();
    if (typeof body?.slug === 'string' && body.slug) return body.slug;
    return null;
  } catch { return null; }
}

export const POST: APIRoute = async ({ request }) => {
  const echoHeader = request.headers.get('x-first-echo');
  if (echoHeader !== '1') return badRequest('Missing echo header');

  const slug = await parseSlug(request);
  if (!slug) return badRequest('Missing slug');

  const sid = sessionId(request);
  if (!sid) return badRequest('Missing session');

  const scheduled = await scheduleEcho(slug, sid);
  return jsonOk({ scheduled });
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

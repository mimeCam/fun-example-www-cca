// src/pages/api/leaderboard.ts
// GET /api/leaderboard           → full ranked list
// GET /api/leaderboard?author=X  → single author stats (404 if not found)
// Public read — no auth. Content-Type: application/json.
//
// Credits: Mike (arch spec §API parity — every UI action available via API)

import type { APIRoute } from 'astro';
import { getLeaderboard, getAuthorStats } from '../../lib/leaderboard';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFound(msg: string): Response { return json({ error: msg }, 404); }

export const GET: APIRoute = ({ url }) => {
  const authorParam = url.searchParams.get('author');

  if (authorParam) {
    const stats = getAuthorStats(authorParam);
    if (!stats) return notFound(`Author '${authorParam}' not found`);
    return json({ author: stats });
  }

  const authors = getLeaderboard();
  return json({ authors, generatedAt: new Date().toISOString() });
};

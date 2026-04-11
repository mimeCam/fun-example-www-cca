// src/pages/api/graveyard-page.ts
// GET /api/graveyard-page?page=1&pageSize=20
// Returns paginated LedgerEntry[] for the graveyard stage.
// Page size capped at 50 server-side. Cache-Control: no-store (live revival counts).
// Credits: Mike (arch §4.3 — napkin plan API)

export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection }       from 'astro:content';
import { allPostDisplayData }  from '../../lib/postMeta';
import { getEntombedLedger }   from '../../lib/graveyard-ledger';
import { paginate, parsePage } from '../../lib/pagination';
import type { PaginationMeta } from '../../lib/pagination';
import type { LedgerEntry }    from '../../lib/graveyard-ledger';

const PAGE_SIZE_MAX = 50;
const PAGE_SIZE_DEFAULT = 20;

interface GraveyardPageResponse {
  posts:      LedgerEntry[];
  pagination: PaginationMeta;
}

function parsePageSize(raw: string | null): number {
  const n = parseInt(raw ?? String(PAGE_SIZE_DEFAULT), 10);
  const safe = Number.isFinite(n) && n > 0 ? n : PAGE_SIZE_DEFAULT;
  return Math.min(safe, PAGE_SIZE_MAX);
}

function jsonResponse(body: GraveyardPageResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store',   // revival counts are real-time
    },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const posts        = await getCollection('blog');
  const displayPosts = allPostDisplayData(posts);
  const entombed     = displayPosts.filter(p => p.entombed);

  const pageSize  = parsePageSize(url.searchParams.get('pageSize'));
  const totalPages = Math.max(1, Math.ceil(entombed.length / pageSize));
  const page      = parsePage(url.searchParams.get('page'), totalPages);

  const { pagination } = paginate(entombed, page, pageSize);
  const ledgerEntries  = getEntombedLedger(entombed, page, pageSize);

  return jsonResponse({ posts: ledgerEntries, pagination });
};

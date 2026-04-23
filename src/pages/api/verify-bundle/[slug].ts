// src/pages/api/verify-bundle/[slug].ts
// GET /api/verify-bundle/:slug — canonical proof bundle for the /verify page.
//
// The page's island fetches this DTO, then verifies in the browser using the
// shared `verify-iso.ts` shim. `curl` returns *byte-identical* JSON the island
// just consumed — the API/UI parity contract Tanya §7 names load-bearing.
//
// Fail-open envelope (Mike §6.3):
//   · slug exists, no seal → { sealed: false, status: 'unsealed' }     (200)
//   · slug exists, sealed, no OTS → { sealed: true, status: 'pending' } (200)
//   · slug exists, sealed, OTS present → full bundle                    (200)
//   · slug missing entirely is NOT 404 — we still return the empty shape
//     so the verify page can render a "no proof yet" receipt for any token.
//
// Cache: immutable when status='verified' (the bytes are content-addressed
// by score+timestamp). 60s public cache otherwise.
//
// Credits: Mike Koch (napkin §3 row 3 — DTO scope), Tanya (§7 API parity),
//          Sid (≤-10 LOC per helper).
//          2026-04-23.

export const prerender = false;

import type { APIRoute } from 'astro';
import { readBundleDirect } from '../../../lib/verify-bundle-shared';
import type { VerifyBundleDto } from '../../../lib/verify-bundle-shared';

export type { VerifyBundleDto };

function cacheHeaders(dto: VerifyBundleDto): Record<string, string> {
  const cache = dto.status === 'verified'
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=60';
  return {
    'Content-Type':    'application/json; charset=utf-8',
    'Cache-Control':   cache,
    'X-Verify-Status': dto.status,
  };
}

export const GET: APIRoute = ({ params, request }) => {
  const slug = params.slug;
  if (!slug) return new Response('Missing slug.', { status: 400 });
  const base = new URL(request.url).origin;
  const dto  = readBundleDirect(slug, base);
  return new Response(JSON.stringify(dto, null, 2), { headers: cacheHeaders(dto) });
};

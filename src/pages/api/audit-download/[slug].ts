// src/pages/api/audit-download/[slug].ts
// Serve raw RFC 3161 (.tsr) and OpenTimestamps (.ots) proof files for download.
// ?type=tsr → DER bytes, application/timestamp-reply
// ?type=ots → OTS blob, application/octet-stream
// No streaming — blobs are small (~2 KB TSR, ~200 B OTS). Pure Response, zero deps.
//
// Credits: Mike (napkin plan §Download API Route, §Points-of-Interest §4)

export const prerender = false;

import type { APIRoute } from 'astro';
import { getTstForSeal }           from '../../../lib/timestamp-store';
import { getOtsProof }             from '../../../lib/conviction-ledger';
import { readBundleDirect }        from '../../../lib/verify-bundle-shared';

// ---------------------------------------------------------------------------
// Handlers — one function per file type, each ≤ 10 lines
// ---------------------------------------------------------------------------

function serveTsr(slug: string): Response {
  const tst = getTstForSeal(slug);
  if (!tst) return new Response('No TSR available for this slug.', { status: 404 });
  const buf = Buffer.from(tst.tst_token, 'base64');
  return new Response(buf, {
    headers: {
      'Content-Type':        'application/timestamp-reply',
      'Content-Disposition': `attachment; filename="conviction-${slug}.tsr"`,
      'Content-Length':      String(buf.length),
      'Cache-Control':       'public, max-age=31536000, immutable',
    },
  });
}

function serveOts(slug: string): Response {
  const ots = getOtsProof(slug);
  if (!ots) return new Response('No OTS proof available for this slug.', { status: 404 });
  return new Response(ots.proof, {
    headers: {
      'Content-Type':        'application/octet-stream',
      'Content-Disposition': `attachment; filename="conviction-${slug}.ots"`,
      'Content-Length':      String(ots.proof.length),
      'Cache-Control':       'public, max-age=300, stale-while-revalidate=60',
    },
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/** ?type=bundle → alias for /api/verify-bundle/:slug so this route stays the one
 *  canonical download surface. Mike §3 row 8. */
function serveBundle(slug: string, base: string): Response {
  const dto = readBundleDirect(slug, base);
  return new Response(JSON.stringify(dto, null, 2), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}

export const GET: APIRoute = ({ params, request }) => {
  const { slug } = params;
  if (!slug) return new Response('Missing slug.', { status: 400 });

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (type === 'tsr') return serveTsr(slug);
  if (type === 'ots') return serveOts(slug);
  if (type === 'bundle') return serveBundle(slug, url.origin);

  return new Response('Bad request: ?type=tsr|ots|bundle required.', { status: 400 });
};

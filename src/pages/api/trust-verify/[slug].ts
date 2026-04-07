// src/pages/api/trust-verify/[slug].ts
// GET /api/trust-verify/:slug — live RFC 3161 CMS signature re-verification.
// Fail-safe: 200 with { verified: false } when no TST exists (unsealed post).
// Used by future admin tooling; not required for the TrustBadge on post pages.
//
// Credits: Mike (arch §Modules — trust-verify endpoint)

import type { APIRoute } from 'astro';
import { getTstForSeal } from '../../../lib/timestamp-store';
import { verifyToken }   from '../../../lib/rfc3161-verifier';

export const prerender = false;

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function noTst(slug: string): Response {
  return json({ verified: false, timestamp: null, tsaName: 'FreeTSA.org', slug });
}

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) return noTst('');

  try {
    const tst = getTstForSeal(slug);
    if (!tst) return noTst(slug);

    const result = await verifyToken(tst.tst_token);
    return json({
      verified:  result.verified,
      timestamp: result.timestamp?.toISOString() ?? null,
      tsaName:   result.tsaName,
      slug,
    });
  } catch {
    return noTst(slug);
  }
};

// src/pages/api/trust-verify/[slug].ts
// GET /api/trust-verify/:slug — live RFC 3161 + OTS verification.
// Fail-safe: 200 with { verified: false } when no TST exists (unsealed post).
//
// Credits: Mike (arch §Modules — trust-verify endpoint)

import type { APIRoute }    from 'astro';
import { getTstForSeal }    from '../../../lib/timestamp-store';
import { verifyToken }      from '../../../lib/rfc3161-verifier';
import { getOtsProof }      from '../../../lib/conviction-ledger';
import { verify as otsVerify } from '../../../lib/ots-verifier';
import { hashContent }      from '../../../lib/rfc3161-client';
import { getSealEntry }     from '../../../lib/conviction-ledger';

export const prerender = false;

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function noTst(slug: string): Response {
  return json({ verified: false, timestamp: null, tsaName: 'FreeTSA.org', slug, ots: null });
}

async function verifyOts(slug: string): Promise<object | null> {
  const otsData = getOtsProof(slug);
  if (!otsData) return null;
  if (otsData.status === 'pending') return { status: 'pending', calendarUrl: otsData.calendarUrl };
  if (otsData.status !== 'confirmed') return { status: otsData.status };
  const seal = getSealEntry(slug);
  if (!seal) return { status: 'unverifiable' };
  const preimage     = `${slug}:${seal.conviction_score}:${seal.timestamp}`;
  const originalHash = hashContent(preimage);
  const result       = await otsVerify(otsData.proof, originalHash);
  return result;
}

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) return noTst('');
  try {
    const tst = getTstForSeal(slug);
    if (!tst) return noTst(slug);
    const [rfc3161Result, otsResult] = await Promise.allSettled([
      verifyToken(tst.tst_token),
      verifyOts(slug),
    ]);
    const rfc3161 = rfc3161Result.status === 'fulfilled' ? rfc3161Result.value : null;
    const ots     = otsResult.status === 'fulfilled'     ? otsResult.value     : null;
    return json({
      verified:  rfc3161?.verified ?? false,
      timestamp: rfc3161?.timestamp?.toISOString() ?? null,
      tsaName:   rfc3161?.tsaName ?? 'FreeTSA.org',
      slug,
      ots,
    });
  } catch {
    return noTst(slug);
  }
};

// src/pages/api/ots-upgrade.ts
// POST /api/ots-upgrade — admin-only batch upgrade of pending OTS proofs.
// Idempotent: safe to call repeatedly (already-confirmed rows are skipped by DB query).
// Intended for cron: call every ~60 minutes after seals are created.
//
// Auth: Authorization: Bearer <ADMIN_SECRET>
// Body: { limit?: number }  (default 20)
// Response: { upgraded, stillPending, failed, errors }
//
// Credits: Mike (arch §ots-upgrade)

import type { APIRoute } from 'astro';
import { hashContent }   from '../../lib/rfc3161-client';
import { upgrade }       from '../../lib/ots-client';
import { verify }        from '../../lib/ots-verifier';
import { getPendingOtsSeals, updateOtsProof } from '../../lib/conviction-ledger';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function authorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET ?? '';
  if (!secret) return false;
  const header = request.headers.get('Authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function upgradeOneSeal(
  hash: string, slug: string, score: number, timestamp: number,
  pendingProof: Buffer, calendarUrl: string,
): Promise<'upgraded' | 'pending' | 'failed'> {
  try {
    const originalHash = hashContent(`${slug}:${score}:${timestamp}`);
    const result = await upgrade(originalHash, pendingProof, calendarUrl);
    if (!result) return 'pending'; // calendar not yet confirmed — retry next cycle
    const verification = await verify(result.proofBytes, originalHash);
    const status = verification.status === 'confirmed' ? 'confirmed' : 'pending';
    updateOtsProof(hash, result.proofBytes, status as 'confirmed' | 'pending');
    return status === 'confirmed' ? 'upgraded' : 'pending';
  } catch {
    return 'failed';
  }
}

export const POST: APIRoute = async ({ request }) => {
  if (!authorized(request)) return json({ error: 'Forbidden' }, 403);
  const body   = await request.json().catch(() => ({})) as { limit?: number };
  const limit  = Math.min(body.limit ?? 20, 100);
  const seals  = getPendingOtsSeals(limit);
  const errors: string[] = [];
  let upgraded = 0, stillPending = 0, failed = 0;
  for (const seal of seals) {
    const result = await upgradeOneSeal(
      seal.hash, seal.post_slug, seal.conviction_score,
      seal.timestamp, seal.ots_proof, seal.ots_calendar_url,
    );
    if (result === 'upgraded')    upgraded++;
    else if (result === 'pending') stillPending++;
    else { failed++; errors.push(`${seal.post_slug}: upgrade failed`); }
  }
  return json({ upgraded, stillPending, failed, errors });
};

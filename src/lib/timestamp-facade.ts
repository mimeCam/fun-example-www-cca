// src/lib/timestamp-facade.ts
// Single call-site for belt-and-suspenders timestamping: RFC 3161 + OTS in parallel.
// Partial success semantics — one failure never blocks the other.
// Credits: Mike (arch §timestamp-facade, "no polymorphism in stampAll")

import { stamp, hashContent } from './rfc3161-client';
import type { TstResult }     from './rfc3161-client';
import { submit }             from './ots-client';
import type { OtsPendingResult } from './ots-client';

export interface CompositeStampResult {
  rfc3161:    TstResult | null;
  ots:        OtsPendingResult | null;
  tsaName:    string;
  errors:     string[];
}

function unwrapSettled<T>(result: PromiseSettledResult<T>, errors: string[], label: string): T | null {
  if (result.status === 'fulfilled') return result.value;
  errors.push(`${label}: ${(result as PromiseRejectedResult).reason}`);
  return null;
}

/**
 * Run RFC 3161 (FreeTSA) + OpenTimestamps in parallel against the same hash.
 * Neither blocks the other. Conviction seal proceeds even if both fail.
 * Mike: "No polymorphism. Two concrete calls, Promise.allSettled, inline destructure."
 */
export async function stampAll(hash: Buffer): Promise<CompositeStampResult> {
  const errors: string[] = [];
  const [rfc3161Result, otsResult] = await Promise.allSettled([
    stamp(hash),
    submit(hash),
  ]);
  const rfc3161 = unwrapSettled(rfc3161Result, errors, 'RFC 3161');
  const ots     = unwrapSettled(otsResult, errors, 'OTS');
  return { rfc3161, ots, tsaName: rfc3161?.tsaName ?? 'FreeTSA.org', errors };
}

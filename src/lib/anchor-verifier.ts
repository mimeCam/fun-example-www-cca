// src/lib/anchor-verifier.ts
// Live cross-verification of GitHub Gist anchor against local conviction ledger.
// Called only at audit page render time — never in hot paths (API or SSE).
// Fetches the raw Gist JSON, compares its hmac field to the locally stored HMAC.
// A 'mismatch' result surfaces visibly on the audit page — not suppressed.
//
// Credits: Mike (Conviction Anchor Pipeline spec)

import { getAnchorData, getSealEntry } from './conviction-ledger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnchorVerification {
  status: 'verified' | 'mismatch' | 'unreachable' | 'no-anchor';
  localHmac: string | null;
  remoteHmac: string | null;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function noAnchor(): AnchorVerification {
  return { status: 'no-anchor', localHmac: null, remoteHmac: null, fetchedAt: Date.now() };
}

function unreachable(localHmac: string | null): AnchorVerification {
  return { status: 'unreachable', localHmac, remoteHmac: null, fetchedAt: Date.now() };
}

function buildResult(localHmac: string | null, remoteHmac: string): AnchorVerification {
  const status = localHmac && remoteHmac === localHmac ? 'verified' : 'mismatch';
  return { status, localHmac, remoteHmac, fetchedAt: Date.now() };
}

async function fetchRemoteHmac(rawUrl: string): Promise<string | null> {
  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json() as { hmac?: string };
  return data.hmac ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify the live GitHub Gist anchor for a sealed post.
 * Returns 'no-anchor' if no Gist was ever posted (pre-anchor era or PAT absent).
 * Returns 'unreachable' on network failure — not treated as tampering.
 * Returns 'mismatch' when Gist HMAC diverges from local DB — surfaces as red flag.
 */
export async function verifyAnchor(slug: string): Promise<AnchorVerification> {
  const anchorData = getAnchorData(slug);
  if (!anchorData?.rawUrl) return noAnchor();

  const sealEntry = getSealEntry(slug);
  const localHmac = sealEntry?.hmac_seal ?? null;

  try {
    const remoteHmac = await fetchRemoteHmac(anchorData.rawUrl);
    if (remoteHmac === null) return unreachable(localHmac);
    return buildResult(localHmac, remoteHmac);
  } catch {
    return unreachable(localHmac);
  }
}

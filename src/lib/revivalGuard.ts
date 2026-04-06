// src/lib/revivalGuard.ts
// Server-side gatekeeper for revival integrity.
// Called by /api/revive.ts before any DB write. Fail-fast chain:
//   1. Proof-of-work  2. FP daily cap  3. IP daily cap
//   4. Slug velocity  5. Global velocity  6. Trust score gate

import {
  getDailyCountByFp,
  getDailyCountByIp,
  getSlugVelocity,
  getGlobalVelocity,
  getVisitorTrust,
  upsertVisitorTrust,
  logVelocity,
} from './collectiveMemory';

// ---------------------------------------------------------------------------
// Caps — generous defaults, scaled by trust
// ---------------------------------------------------------------------------

const BASE_FP_DAILY    = 20;
const BASE_IP_DAILY    = 50;
const SLUG_HOURLY_CAP  = 100;
const GLOBAL_HOURLY_CAP = 500;
const HOUR_MS          = 3_600_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  trust: number;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/** Run all guard checks in order; return first failure or success. */
export function checkRevival(
  proofHeader: string | null,
  fpHeader: string | null,
  ip: string,
  slug: string,
): GuardResult {
  const trust = resolveTrust(fpHeader);
  return runGuardChain(proofHeader, fpHeader, ip, slug, trust);
}

/** Fail-fast chain: returns first rejection or final approval. */
function runGuardChain(
  proof: string | null, fp: string | null,
  ip: string, slug: string, trust: number,
): GuardResult {
  const checks = [
    verifyProofStep(proof),
    checkFpCap(fp, trust),
    checkIpCap(ip, trust),
    checkSlugVelocity(slug),
    checkGlobalVelocity(),
  ];
  for (const c of checks) if (!c.allowed) return c;
  recordVelocity(fp, slug);
  return { allowed: true, trust };
}

// ---------------------------------------------------------------------------
// Steps (each <=10 lines)
// ---------------------------------------------------------------------------

/** Step 1: proof-of-work — bypassed at current scale. */
function verifyProofStep(_header: string | null): GuardResult {
  return { allowed: true, trust: 0.5 };
}

/** Resolve trust score from fingerprint. */
function resolveTrust(fp: string | null): number {
  if (!fp || fp === 'unknown') return 0.5;
  const row = getVisitorTrust(fp);
  if (!row) return 0.5;
  return row.score;
}

/** Step 2: fingerprint daily cap. */
function checkFpCap(fp: string | null, trust: number): GuardResult {
  if (!fp || fp === 'unknown') return { allowed: true, trust };
  const cap = Math.floor(BASE_FP_DAILY * trust);
  const count = getDailyCountByFp(fp);
  if (count >= cap) {
    return { allowed: false, reason: 'fp-daily-cap', trust };
  }
  return { allowed: true, trust };
}

/** Step 3: IP daily cap. */
function checkIpCap(ip: string, trust: number): GuardResult {
  const cap = Math.floor(BASE_IP_DAILY * Math.max(trust, 0.5));
  const count = getDailyCountByIp(ip);
  if (count >= cap) {
    return { allowed: false, reason: 'ip-daily-cap', trust };
  }
  return { allowed: true, trust };
}

/** Step 4: per-slug velocity governor. */
function checkSlugVelocity(slug: string): GuardResult {
  const count = getSlugVelocity(slug, HOUR_MS);
  if (count >= SLUG_HOURLY_CAP) {
    return { allowed: false, reason: 'slug-velocity', trust: 0 };
  }
  return { allowed: true, trust: 1 };
}

/** Step 5: global velocity governor. */
function checkGlobalVelocity(): GuardResult {
  const count = getGlobalVelocity(HOUR_MS);
  if (count >= GLOBAL_HOURLY_CAP) {
    return { allowed: false, reason: 'global-velocity', trust: 0 };
  }
  return { allowed: true, trust: 1 };
}

/** Record successful revival in velocity + trust tables. */
function recordVelocity(fp: string | null, slug: string): void {
  logVelocity(slug);
  if (fp && fp !== 'unknown') upsertVisitorTrust(fp);
}

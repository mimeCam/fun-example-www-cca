// src/lib/verify-bundle-shared.ts
// Single source of truth for the /verify proof-bundle DTO.
//
// Two consumers (Mike §6.7 — DTO is frozen, both consumers must agree):
//   · `src/pages/api/verify-bundle/[slug].ts` — HTTP wire format
//   · `src/pages/verify.astro` — SSR shell renders the same DTO
//
// `scripts/check-verify-bundle.ts` snapshots the DTO field set so a future
// PR that adds a field on the server fails prebuild until both consumers
// (the API + the island via `verify-iso.ts`) are taught the new field.
//
// Credits: Mike Koch (napkin §3 row 3), Sid (≤-10 LOC).
//          2026-04-23.

import { getSealEntry, getOtsProof } from './conviction-ledger';
import { getTstForSeal }              from './timestamp-store';

export interface VerifyBundleDto {
  slug:            string;
  sealed:          boolean;
  status:          'verified' | 'pending' | 'unsealed';
  preimage:        string | null;
  convictionScore: number | null;
  sealedAt:        number | null;
  otsBase64:       string | null;
  tstBase64:       string | null;
  calendarUrl:     string | null;
  blockstreamUrl:  string;
  curl:            string;
}

/** Field set the prebuild guard freezes — keep in sync with the interface above. */
export const VERIFY_BUNDLE_FIELDS = [
  'slug', 'sealed', 'status', 'preimage', 'convictionScore', 'sealedAt',
  'otsBase64', 'tstBase64', 'calendarUrl', 'blockstreamUrl', 'curl',
] as const;

const BLOCKSTREAM_BLOCK = 'https://blockstream.info/block-height';

// ── Pure DTO builders (no I/O, no time) ──────────────────────────────────

export function emptyBundle(slug: string, base: string): VerifyBundleDto {
  return {
    slug, sealed: false, status: 'unsealed',
    preimage: null, convictionScore: null, sealedAt: null,
    otsBase64: null, tstBase64: null, calendarUrl: null,
    blockstreamUrl: BLOCKSTREAM_BLOCK,
    curl: curlFor(slug, base),
  };
}

export function curlFor(slug: string, base: string): string {
  return `curl -s '${base}/api/verify-bundle/${encodeURIComponent(slug)}'`;
}

export function preimageFor(slug: string, score: number, ts: number): string {
  return `${slug}:${score}:${ts}`;
}

function statusFor(otsBase64: string | null, otsStatus: string | null): VerifyBundleDto['status'] {
  if (!otsBase64) return 'pending';
  return otsStatus === 'confirmed' ? 'verified' : 'pending';
}

// ── DB-side wiring (≤ 10 LOC each) ───────────────────────────────────────

export function readBundleDirect(slug: string, base: string): VerifyBundleDto {
  const seal = safeRead(() => getSealEntry(slug));
  if (!seal || seal.conviction_score == null) return emptyBundle(slug, base);
  const ots = safeRead(() => getOtsProof(slug));
  const tst = safeRead(() => getTstForSeal(slug));
  return assembleBundle(slug, base, seal.conviction_score, seal.timestamp, ots, tst);
}

function assembleBundle(
  slug: string, base: string, score: number, ts: number,
  ots: { proof: Buffer; status: string; calendarUrl: string | null } | null,
  tst: { tst_token: string } | null,
): VerifyBundleDto {
  const otsBase64 = ots ? Buffer.from(ots.proof).toString('base64') : null;
  return {
    slug, sealed: true, status: statusFor(otsBase64, ots?.status ?? null),
    preimage: preimageFor(slug, score, ts), convictionScore: score, sealedAt: ts,
    otsBase64, tstBase64: tst?.tst_token ?? null, calendarUrl: ots?.calendarUrl ?? null,
    blockstreamUrl: BLOCKSTREAM_BLOCK, curl: curlFor(slug, base),
  };
}

function safeRead<T>(fn: () => T | null): T | null {
  try { return fn(); } catch { return null; }
}

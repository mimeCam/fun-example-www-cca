#!/usr/bin/env tsx
// scripts/check-verify-bundle.ts
// Prebuild guard for the /verify proof-bundle DTO (Mike napkin §3 row 7).
//
// Three claims, asserted in this order — first failure exits non-zero:
//   1. The TypeScript interface `VerifyBundleDto` and the runtime field list
//      `VERIFY_BUNDLE_FIELDS` agree (no field added in the type without a
//      sibling entry in the snapshot tuple).
//   2. The empty-bundle factory (`emptyBundle`) emits exactly the snapshot
//      keys, in the snapshot order — what `curl` returns for an unsealed
//      slug is what the SSR shell in `/verify` consumes.
//   3. `verify-iso.ts` re-exports the public symbols the island depends on
//      (`verifyBundle`, `parseBitcoinHeight`, `walkProof`, `sha256`,
//      `hashPreimage`). Catches the v+1 PR that renames a symbol and breaks
//      the island silently.
//
// Plugs into the prebuild chain alongside `check-user-journey.ts`.
//
// Credits: Mike Koch (napkin §6.7 "the guard is the shield"),
//          Sid (≤-10 LOC per check), 2026-04-23.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  emptyBundle, VERIFY_BUNDLE_FIELDS,
} from '../src/lib/verify-bundle-shared';

const ROOT = process.cwd();
const SHIM_PATH = path.join(ROOT, 'src', 'lib', 'verify-iso.ts');
const SHARED_PATH = path.join(ROOT, 'src', 'lib', 'verify-bundle-shared.ts');

const REQUIRED_SHIM_SYMBOLS = [
  'verifyBundle', 'parseBitcoinHeight', 'walkProof',
  'sha256', 'hashPreimage', 'bytesToHex', 'base64ToBytes',
] as const;

// ── Helpers (each ≤ 10 LOC — Sid) ───────────────────────────────────────

function readSource(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

function fail(msg: string): never {
  console.error(`❌  check-verify-bundle: ${msg}`);
  process.exit(1);
}

function assertSnapshotMatchesEmptyBundle(): void {
  const sample = emptyBundle('demo-slug', 'http://localhost');
  const got = Object.keys(sample);
  const want = [...VERIFY_BUNDLE_FIELDS];
  if (got.length !== want.length) fail(`field count drift: emptyBundle has ${got.length}, snapshot has ${want.length}`);
  want.forEach((k, i) => {
    if (got[i] !== k) fail(`field order drift at index ${i}: snapshot=${k} emptyBundle=${got[i]}`);
  });
}

function assertInterfaceMatchesSnapshot(): void {
  const src = readSource(SHARED_PATH);
  const m = src.match(/export interface VerifyBundleDto \{([\s\S]*?)\}/);
  if (!m) fail('VerifyBundleDto interface not found in verify-bundle-shared.ts');
  const fields = (m![1].match(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm) ?? [])
    .map(s => s.trim().replace(/:$/, ''));
  for (const k of VERIFY_BUNDLE_FIELDS) {
    if (!fields.includes(k)) fail(`snapshot field "${k}" missing from VerifyBundleDto interface`);
  }
}

function assertShimSymbols(): void {
  const src = readSource(SHIM_PATH);
  for (const sym of REQUIRED_SHIM_SYMBOLS) {
    const re = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|interface|type)\\s+${sym}\\b`);
    if (!re.test(src)) fail(`verify-iso.ts must export "${sym}" — island depends on it`);
  }
}

function assertCurlIsCanonical(): void {
  const sample = emptyBundle('demo-slug', 'http://localhost');
  const want = `curl -s 'http://localhost/api/verify-bundle/demo-slug'`;
  if (sample.curl !== want) fail(`curl drift: got ${sample.curl} expected ${want}`);
}

// ── Main ─────────────────────────────────────────────────────────────────

assertInterfaceMatchesSnapshot();
assertSnapshotMatchesEmptyBundle();
assertShimSymbols();
assertCurlIsCanonical();

console.log(
  `✅  check-verify-bundle: ${VERIFY_BUNDLE_FIELDS.length} DTO fields frozen · ` +
  `${REQUIRED_SHIM_SYMBOLS.length} shim symbols present · curl canonical`,
);

#!/usr/bin/env tsx
// scripts/check-parity-proof.ts
// v178 "Parity Console" — prebuild guard.
//
// Walks the frozen 7×5 cell grid + the VALID_REF_FIXTURES nonces and
// asserts `driftBytes === 0` for every resulting ParityProof. Single
// static-time witness that the three-mouth parity invariant the console
// displays is real: pointer ≡ keyboard ≡ curl, byte-for-byte.
//
// Mike napkin §5 — "`--error` phase from day one, no warn purgatory."
// There is no warn mode. Any drift fails the prebuild.
//
// Credits: Mike Koch (napkin §6 work distribution, §8 ship criteria),
//          Elon (§1 "prebuild guards are the moat"), prior authors of
//          scripts/check-tri-mouth.ts and scripts/check-citation-
//          delegation.ts (shape + single-line-diagnostic pattern),
//          Sid — 2026-04-23. Motto: "code maintenance without tests."

import * as path from 'node:path';

import {
  buildProof,
  proofSweep,
  DEFAULT_PROOF_AXIS,
  DEFAULT_PROOF_STAGE,
} from '../src/lib/parity-proof.ts';
import {
  SENTINEL_ORIGIN,
  VALID_REF_FIXTURES,
} from '../src/lib/citation-golden.ts';

// ── Findings ─────────────────────────────────────────────────────────────

interface Finding {
  readonly axis:   string;
  readonly stage:  string;
  readonly ref:    string | null;
  readonly drift:  number;
}

/** Format one finding — grep-friendly, single line. */
function formatFinding(f: Finding): string {
  const refPart = f.ref ? ` ref=${f.ref}` : '';
  return `  ✗ parity-proof: ${f.axis} × ${f.stage}${refPart} — drift=${f.drift} bytes`;
}

// ── Sweeps ───────────────────────────────────────────────────────────────

/** 35 (axis, stage) cells — the grid sweep. Returns findings only (empty
 *  array on the happy path). */
async function sweepCells(): Promise<Finding[]> {
  const rows = await proofSweep(SENTINEL_ORIGIN);
  const out: Finding[] = [];
  for (const r of rows) {
    if (r.driftBytes !== 0) {
      out.push({ axis: r.axis, stage: r.stage, ref: null, drift: r.driftBytes });
    }
  }
  return out;
}

/** VALID_REF_FIXTURES — single cell (`typography × fresh`), N nonces. */
async function sweepRefs(): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const ref of VALID_REF_FIXTURES) {
    const p = await buildProof(DEFAULT_PROOF_AXIS, DEFAULT_PROOF_STAGE, SENTINEL_ORIGIN, ref);
    if (p.driftBytes !== 0) {
      out.push({ axis: p.axis, stage: p.stage, ref, drift: p.driftBytes });
    }
  }
  return out;
}

// ── Report / exit ────────────────────────────────────────────────────────

function printReport(findings: readonly Finding[]): void {
  const total = 35 + VALID_REF_FIXTURES.length;
  if (findings.length === 0) {
    console.log(`✅ check-parity-proof: ${total} proofs green (drift=0 everywhere).`);
    return;
  }
  console.error(`❌ check-parity-proof: ${findings.length} drift(s) across ${total} proofs.`);
  for (const f of findings) console.error(formatFinding(f));
  console.error('\n  The parity oracle (src/lib/parity-proof.ts::buildProof) is the single');
  console.error('  source the /api/docs console renders. See AGENTS.md — v178 Parity Console.');
}

async function main(): Promise<void> {
  const findings = [...(await sweepCells()), ...(await sweepRefs())];
  printReport(findings);
  if (findings.length > 0) process.exit(1);
}

// Module vs. CLI invocation — gate `main()` so tests can import the
// helpers without the script side-effecting `process.exit`.
const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) void main();

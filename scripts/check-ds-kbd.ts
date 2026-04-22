// scripts/check-ds-kbd.ts
//
// v152 — source-grep guard for the `.api-docs__kbd → .ds-kbd` PROMOTE
// (Mike napkin "Earn the PROMOTE", Tanya §1.1 visual contract).
//
// Two invariants, stated once, enforced by grep:
//
//   1. ZERO `api-docs__kbd` references anywhere under src/. The rename
//      is atomic; a dangling reference means the promote is half-paid.
//      Any new hit — in a stylesheet, an Astro template, a test — fails
//      the build with a file:line pointer.
//
//   2. The `.ds-kbd` class is defined in ds-kbd.css AND used in BOTH
//      real consumers. Exactly three required sites:
//        · src/styles/ds-kbd.css                   (definition)
//        · src/pages/api/docs.astro                (1st consumer)
//        · src/components/FloatingKeepButton.astro (2nd consumer)
//      A missing one means rule-of-three is no longer satisfied —
//      the promote is premature, or a consumer was lost. Either way,
//      fail loudly before it ships to prod.
//
// Exit codes:
//   0 → all invariants satisfied; one line per kept contract.
//   1 → at least one violation; a teaching message lists the failure.
//
// Design choices (Mike §scope item 11, Sid §every-fn-≤-10-LOC):
//   · Plain TS scanner. Zero dependencies, no AST, no JSDOM.
//   · Read each required file once; cache into a small map.
//   · All assertions go through the same `report` channel so a CI run
//     that fails on three invariants prints all three, not just the
//     first.
//
// Credits: Mike (napkin "check-ds-kbd.ts is a 20-line regex scan"),
//          Tanya (§1.1 single source of pixels), Elon (teaching-contract
//          invariant), Krystle (original source-grep guard pattern),
//          Sid — 2026-04-22. Motto: "Code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(process.cwd(), 'src');
const DEFINITION = 'src/styles/ds-kbd.css';
const CONSUMERS = [
  'src/pages/api/docs.astro',
  'src/components/FloatingKeepButton.astro',
];
const FORBIDDEN = 'api-docs__kbd';
const REQUIRED  = 'ds-kbd';

// ── Pure helpers ──────────────────────────────────────────────────────────

/** List every scannable file under src/ (recursive). */
function listSrcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSrcFiles(p));
    else if (/\.(ts|tsx|js|astro|css|md)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Return true iff `haystack` contains `needle` (whole-word / class-safe). */
function hits(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

/** Read a file; return '' when missing (caller then asserts). */
function readSafe(rel: string): string {
  const abs = path.resolve(process.cwd(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
}

/** Collect every file under src/ that still references FORBIDDEN. */
function findStragglers(): string[] {
  return listSrcFiles(ROOT).filter(p => hits(fs.readFileSync(p, 'utf-8'), FORBIDDEN));
}

// ── Reporter ──────────────────────────────────────────────────────────────

const errors: string[] = [];

function report(ok: boolean, msg: string): void {
  if (!ok) errors.push(msg);
}

// ── Invariant checks ──────────────────────────────────────────────────────

function checkNoStragglers(): void {
  const stragglers = findStragglers();
  for (const p of stragglers) {
    report(false, `  ✗ ${FORBIDDEN} still referenced in ${path.relative(process.cwd(), p)}`);
  }
}

function checkDefinitionPresent(): void {
  const src = readSafe(DEFINITION);
  report(src.length > 0,
    `  ✗ ${DEFINITION} missing — .${REQUIRED} has no owner`);
  report(hits(src, `.${REQUIRED}`),
    `  ✗ ${DEFINITION} does not define .${REQUIRED} selector`);
}

function checkConsumers(): void {
  for (const rel of CONSUMERS) {
    const src = readSafe(rel);
    report(src.length > 0, `  ✗ ${rel} missing`);
    report(hits(src, REQUIRED),
      `  ✗ ${rel} has zero .${REQUIRED} chips — second-consumer rule broken`);
  }
}

// ── Entrypoint ────────────────────────────────────────────────────────────

function main(): void {
  checkNoStragglers();
  checkDefinitionPresent();
  checkConsumers();
  if (errors.length) {
    console.error(`❌  check-ds-kbd: ${errors.length} violation(s)`);
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log(`✅  check-ds-kbd: zero ${FORBIDDEN} stragglers; .${REQUIRED} live in ${CONSUMERS.length + 1} sites.`);
}

main();

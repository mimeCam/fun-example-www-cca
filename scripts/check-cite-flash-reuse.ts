// scripts/check-cite-flash-reuse.ts
//
// v179 "CiteFlash" — prebuild guard. Single source of truth for the
// copy→arrive receipt flash: one `@keyframes cite-flash*` producer
// (src/styles/cite-flash.css) and one JS producer (src/lib/cite-flash.ts).
// Any second file that invents its own receipt keyframe or hand-rolls a
// copy→arrive timer is a drift vector the guard catches.
//
// Invariants (Mike napkin §4 "scripts/check-cite-flash-reuse.ts"):
//
//   (a) Exactly ONE CSS file may define `@keyframes cite-flash` or
//       `@keyframes cite-flash-lit` — and that file is
//       src/styles/cite-flash.css. Additional hits → warn (wedge 1) then
//       error (wedge 2). Flips to --error via CLI flag, same discipline
//       as check-no-raw-now.ts.
//
//   (b) Exactly ONE file may hand-roll a `receipt-*` keyframe. This
//       guards against the next wedge's receipt consolidation (Tanya §5
//       pass 1) from drifting — once the four receipt components collapse
//       onto CiteFlash, any new `@keyframes receipt-*` is a regression.
//
//   (c) Raw-millisecond literals for the cite-flash beat (`200ms` literal
//       in a component script) must not appear outside the pure helper;
//       callers read `CITE_FLASH_DURATION_MS` from src/lib/cite-flash.ts.
//       This invariant ships in WARN mode — the project has many legacy
//       raw-ms literals (check-no-raw-now is also warn-only). Flips
//       together with (a) in the wedge after this one.
//
// Exit codes:
//   0 → no violations (or --warn mode: violations printed to stderr,
//       build continues).
//   1 → violations in --error mode.
//
// CLI:
//   npx tsx scripts/check-cite-flash-reuse.ts            # warn (default)
//   npx tsx scripts/check-cite-flash-reuse.ts --error    # error mode
//
// Design (Sid §every-fn-≤-10-LOC, mirrors check-citation-delegation.ts):
//   · Zero deps. fs + path + regex. No AST.
//   · One pass per file. No recursive descent; an explicit sweep list.
//   · All assertions go through `report()` so a failing build prints
//     every violation (not just the first).
//
// Credits: Mike Koch (napkin §4 file, §6 PoI-8 "mirror check-citation-
//          delegation style"), Tanya Donska (§5 pass 1 — this guard
//          prepares the consolidation), Elon (§3.3 no new token tier —
//          the guard enforces it as a side effect). Sid — 2026-04-23.

import * as fs from 'fs';
import * as path from 'path';

// ── Config ───────────────────────────────────────────────────────────────

/** The ONE canonical source file; other hits are violations. */
const CITE_FLASH_CSS_PRODUCER = 'src/styles/cite-flash.css';
const CITE_FLASH_JS_PRODUCER  = 'src/lib/cite-flash.ts';

/** Directories that get swept for CSS keyframe hits. */
const CSS_ROOTS = ['src/styles', 'src/components', 'src/layouts'];
const JS_ROOTS  = ['src/lib', 'src/components'];

/** Keyframe name patterns we guard. */
const CITE_KEYFRAME_RE    = /@keyframes\s+cite-flash(?:-lit)?\b/;
const RECEIPT_KEYFRAME_RE = /@keyframes\s+receipt-[a-z0-9-]+/;

/** Raw-ms literal near a cite-flash class reference → likely a hand-rolled
 *  dupe of the 200ms beat. A single-line regex; we scan only lines that
 *  mention `cite-flash` so unrelated 200ms literals elsewhere don't nag. */
const RAW_MS_NEAR_FLASH_RE = /cite-flash[^;\n]{0,160}\b\d{2,4}ms\b/;

// ── Pure scanners (easy to unit-test later) ──────────────────────────────

export function hasCiteKeyframe(code: string): boolean {
  return CITE_KEYFRAME_RE.test(code);
}

export function hasReceiptKeyframe(code: string): boolean {
  return RECEIPT_KEYFRAME_RE.test(code);
}

export function hasRawMsNearFlash(code: string): boolean {
  return RAW_MS_NEAR_FLASH_RE.test(code);
}

// ── FS walk — shallow, one-level recursion inside configured roots ──────

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
}

function sweepFiles(roots: readonly string[], exts: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of roots) walk(path.resolve(process.cwd(), r), out);
  return out.filter((p) => exts.some((e) => p.endsWith(e)));
}

// ── Reporter ─────────────────────────────────────────────────────────────

const violations: string[] = [];
function report(ok: boolean, msg: string): void { if (!ok) violations.push(msg); }

function relOf(abs: string): string {
  return path.relative(process.cwd(), abs);
}

// ── Per-file checks (each ≤ 10 lines, Sid rule) ─────────────────────────

function checkCssFile(abs: string): void {
  const rel = relOf(abs);
  const code = fs.readFileSync(abs, 'utf-8');
  if (hasCiteKeyframe(code) && rel !== CITE_FLASH_CSS_PRODUCER) {
    report(false, `  ✗ ${rel}: @keyframes cite-flash* defined outside ${CITE_FLASH_CSS_PRODUCER}`);
  }
  if (hasReceiptKeyframe(code) && rel !== CITE_FLASH_CSS_PRODUCER) {
    report(false, `  ✗ ${rel}: @keyframes receipt-* defined — consolidate onto CiteFlash (Tanya §5 pass 1)`);
  }
}

function checkJsFile(abs: string): void {
  const rel = relOf(abs);
  if (rel === CITE_FLASH_JS_PRODUCER) return;               // pure helper owns the ms literal
  const code = fs.readFileSync(abs, 'utf-8');
  if (hasRawMsNearFlash(code)) {
    report(false, `  ⚠ ${rel}: raw ms literal near a cite-flash reference — import CITE_FLASH_DURATION_MS from ${CITE_FLASH_JS_PRODUCER}`);
  }
}

// ── Entrypoint ───────────────────────────────────────────────────────────

const ERROR_MODE = process.argv.includes('--error');

function main(): void {
  const css = sweepFiles(CSS_ROOTS, ['.css', '.astro']);
  for (const f of css) checkCssFile(f);
  const js  = sweepFiles(JS_ROOTS,  ['.ts', '.astro']);
  for (const f of js) checkJsFile(f);
  if (!violations.length) {
    console.log(`✅  check-cite-flash-reuse: one CSS producer, one JS producer. No drift.`);
    return;
  }
  const header = ERROR_MODE ? '❌' : '⚠ ';
  console.error(`${header}  check-cite-flash-reuse: ${violations.length} violation(s)${ERROR_MODE ? '' : ' (warn mode)'}`);
  for (const v of violations) console.error(v);
  if (ERROR_MODE) process.exit(1);
}

const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) main();

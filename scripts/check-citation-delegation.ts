// scripts/check-citation-delegation.ts
//
// v155 "Citation Golden" — prebuild guard. Static-time witness that the
// three files that touch the citation ritual all delegate to the oracle
// (`cellCitationPayload` / `cellCitationLabel` / `cellAnchorId` in
// `src/lib/stage-axes.ts`) instead of re-implementing the payload shape.
//
// Replaces Mike's v48 postbuild harness (spawn `astro preview`, curl
// three endpoints, diff three strings) with a static equivalent. The
// three-mouth parity is a tautology once the single import is proven —
// the oracle is the same symbol every caller routes through. This guard
// proves the import structure; `citation-golden.test.ts` proves the
// string shape. Between the two there is no runtime drift vector left
// (Elon v155 first-principles §3).
//
// Invariants (stated once, enforced by grep — Mike §5.3):
//
//   (a) Delegation: each target file imports the required oracle
//       symbol(s) from `../stage-axes` (or `../../lib/stage-axes` for
//       the Astro page). A missing import means a caller is free to
//       re-define the payload. Fail.
//
//   (b) No re-implementation template: no target file contains all
//       three of the payload-shape markers (`× `, ` · `, `#axis-`) in
//       code (after stripping // line-comments). The oracle owns the
//       template; any caller that contains the triplet is spelling
//       out the contract itself. Fail.
//
// Exit codes:
//   0 → every target imports the oracle and none re-implements.
//   1 → one or more violations; a single-line diagnostic per breach
//       names file:line (or file: for missing-import violations) so
//       CI output is grep-friendly (Mike §5.3 single-line).
//
// Design (Sid §every-fn-≤-10-LOC, mirrors scripts/check-ds-kbd.ts):
//   · Zero deps. `fs` only. No AST, no ts-morph. Regex + split.
//   · One pass per file. Read once, cache into a map.
//   · All assertions go through `report()` so a CI run failing on
//     three invariants prints all three.
//   · Pure `scanImports()` + `scanReimplementation()` helpers — same
//     functions are unit-tested in `check-citation-delegation.test.ts`
//     against three fixture strings (clean, reimpl, missing-import).
//
// Credits: Mike (v155 napkin §3 table row 4, §5.3 cheap-and-readable),
//          Elon (v155 first-principles §3 static-proof), AGENTS.md
//          (axis freeze, polymorphism-is-a-killer rule), check-ds-kbd
//          (sibling guard style — copy + adapt), Sid — 2026-04-22.
//          Motto: "code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';

// ── Target config ─────────────────────────────────────────────────────────
//
// Each row: the file we scan + the set of oracle symbols at least one of
// which must appear in an `import … from '…stage-axes'` statement. The
// required-symbol sets differ per file because the three mouths use
// different slices of the oracle's public surface (Mike §3 diagram).

interface Target {
  /** Path relative to repo root. */
  readonly rel: string;
  /** Oracle symbols — at least ONE must be imported from stage-axes. */
  readonly requiredSymbols: readonly string[];
  /** Human label in error messages. */
  readonly mouth: string;
}

export const TARGETS: readonly Target[] = [
  { rel: 'src/lib/client/cell-cite.ts',
    requiredSymbols: ['cellCitationPayload'],
    mouth: 'click + keystroke' },
  { rel: 'src/lib/client/matrix-keynav.ts',
    requiredSymbols: ['cellAnchorId', 'cellIdFromHash'],
    mouth: 'keynav' },
  { rel: 'src/pages/api/docs.astro',
    requiredSymbols: ['cellCitationLabel', 'cellAnchorId'],
    mouth: 'server render' },
];

// The oracle module path fragment each import statement must reference.
// Accepts both `../stage-axes` (client modules) and `../../lib/stage-axes`
// (the Astro page). Anchored with a closing quote so `stage-axes-foo`
// cannot satisfy the check.
const ORACLE_PATH_RE = /from\s+['"][.\/a-z-]*stage-axes['"]/;

// The three re-implementation markers. Per Mike §5.3, each is cheap to
// scan and together they pin down the payload template without any false
// positives on unrelated uses of the individual glyphs.
export const REIMPL_MARKERS: readonly string[] = ['× ', ' · ', '#axis-'];

// ── Pure scanners (unit-tested via check-citation-delegation.test.ts) ─────

/** Strip single-line `//` comments from a line. Preserves string content. */
export function stripLineComment(line: string): string {
  const i = line.indexOf('//');
  return i === -1 ? line : line.slice(0, i);
}

/** Join all code lines (comment-stripped) into one scannable blob. */
export function codeOnly(text: string): string {
  return text.split('\n').map(stripLineComment).join('\n');
}

/** True iff `code` contains ALL three re-implementation markers. */
export function scanReimplementation(code: string): boolean {
  return REIMPL_MARKERS.every((m) => code.includes(m));
}

/** True iff `code` imports at least one of `symbols` from stage-axes.
 *  Looks at the union of all `import { … } from '…stage-axes'` specifiers —
 *  a naive but deterministic parse: find each import-from-oracle line,
 *  pull the `{ … }` payload, split on commas, match against `symbols`. */
export function scanImports(code: string, symbols: readonly string[]): boolean {
  const re = /import\s*\{([^}]*)\}\s*from\s*['"][.\/a-z-]*stage-axes['"]/g;
  let m: RegExpExecArray | null;
  const imported = new Set<string>();
  while ((m = re.exec(code)) !== null) {
    for (const tok of m[1].split(',')) {
      const name = tok.trim().replace(/\s+as\s+\w+$/, '');
      if (name) imported.add(name);
    }
  }
  return symbols.some((s) => imported.has(s));
}

// ── Reporter ──────────────────────────────────────────────────────────────

const errors: string[] = [];
function report(ok: boolean, msg: string): void { if (!ok) errors.push(msg); }

// ── Per-target checks ─────────────────────────────────────────────────────

function readRel(rel: string): string {
  const abs = path.resolve(process.cwd(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
}

/** Find the 1-based line of the first re-implementation marker hit. */
function firstMarkerLine(code: string): number {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (REIMPL_MARKERS.every((m) => lines[i].includes(m))) return i + 1;
  }
  return 1; // fallback: the markers exist somewhere; diagnostic is still useful
}

/** Flag missing stage-axes import. One responsibility per rule (Sid §10). */
function checkImportPath(t: Target, code: string): void {
  report(ORACLE_PATH_RE.test(code),
    `  ✗ ${t.rel} (${t.mouth}): no import from stage-axes`);
}

/** Flag missing required-symbol import (any-of-set). */
function checkRequiredSymbols(t: Target, code: string): void {
  report(scanImports(code, t.requiredSymbols),
    `  ✗ ${t.rel} (${t.mouth}): missing one of [${t.requiredSymbols.join(', ')}] from stage-axes`);
}

/** Flag re-implementation of the payload template. */
function checkNoReimpl(t: Target, code: string): void {
  if (!scanReimplementation(code)) return;
  report(false,
    `  ✗ ${t.rel}:${firstMarkerLine(code)} (${t.mouth}): payload template re-implemented — delete and call cellCitationPayload()`);
}

function checkTarget(t: Target): void {
  const text = readRel(t.rel);
  if (!text) { report(false, `  ✗ ${t.rel} (${t.mouth}): file missing`); return; }
  const code = codeOnly(text);
  checkImportPath(t, code);
  checkRequiredSymbols(t, code);
  checkNoReimpl(t, code);
}

// ── Entrypoint ────────────────────────────────────────────────────────────

/** Emit all failures to stderr and exit 1. Called only when errors.length > 0. */
function failWithDiagnostics(): never {
  console.error(`❌  check-citation-delegation: ${errors.length} violation(s)`);
  for (const e of errors) console.error(e);
  console.error('\n  The oracle (src/lib/stage-axes.ts::cellCitationPayload) is the single');
  console.error('  source every mouth routes through. See AGENTS.md — v155 Citation Golden.');
  process.exit(1);
}

function main(): void {
  for (const t of TARGETS) checkTarget(t);
  if (errors.length) failWithDiagnostics();
  console.log(`✅  check-citation-delegation: ${TARGETS.length} target(s) delegate to stage-axes; no re-implementation.`);
}

// Executed directly via `npx tsx` in prebuild; importing the file only
// pulls the pure helpers (`scanImports`, `scanReimplementation`) for the
// guard's own test. The `import.meta.url` gate keeps `main()` from
// side-effecting when the test file imports the module.
const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) main();

#!/usr/bin/env tsx
// scripts/check-no-raw-now.ts
// Guard: block `Date.now()` / `new Date()` outside the clock seam + allowlist.
//
// Rationale: src/lib/clock.ts is the ONE seam for "now" per Mike's napkin
// plan. Every server-side callsite must import from it, so a single pin of
// the clock propagates through an entire SSR request (middleware) or test
// run (withClock). Raw Date.now() callsites silently drift within a single
// payload. This guard keeps regressions out.
//
// Modes (pick via CLI flag):
//   --warn   print violations, exit 0 (default — landing mode)
//   --error  print violations, exit 1 (enable once all callsites migrate)
//
// Allowlist:
//   · src/lib/clock.ts (the seam itself — defines Date.now)
//   · src/middleware.ts (reads Date.now once per request, feeds withClock)
//   · **/*.test.ts (tests often need `new Date('2026-04-04')` fixtures)
//   · scripts/ (build-time tools, not request-time)
//   · Browser-only IIFE templates (strings starting inside `(function(){…})`)
//     — detected heuristically: matches inside template literals containing
//       `function(){` on the same or previous non-blank line.
//
// Scope (napkin §4.3): this is the prebuild-guard arm of the clock seam.
// Flip to --error once the remaining ~60 server-side callsites migrate.
//
// Credits: Mike Koch (§5 PoI-8 migration order + guard discipline), Elon
//          (§1 red-line — guard is the canary), Sid (≤-10 LOC per function),
//          2026-04-23.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Config ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(process.cwd(), 'src');

/** Files + directories the guard never flags. */
const ALLOWLIST_EXACT = new Set<string>([
  path.join(ROOT, 'lib', 'clock.ts'),
  path.join(ROOT, 'middleware.ts'),
]);

const ALLOWLIST_PREFIX: string[] = [
  path.join(ROOT, 'lib', 'client') + path.sep,   // browser code
];

/** Skip patterns — test fixtures, isolated sanity runners. */
const SKIP_FILE_SUFFIX = ['.test.ts', '.test.tsx'];

/** Regexes: raw Date.now() or `new Date()` (no args = current time). */
const RE_DATE_NOW = /\bDate\.now\s*\(\s*\)/g;
const RE_NEW_DATE_EMPTY = /\bnew\s+Date\s*\(\s*\)/g;

// ── Model ─────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  col: number;
  rule: 'Date.now()' | 'new Date()';
  context: string;
}

// ── Walk ──────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|astro)$/.test(name)) out.push(full);
  }
  return out;
}

// ── Allowlist predicate ───────────────────────────────────────────────────

function isAllowed(file: string): boolean {
  if (ALLOWLIST_EXACT.has(file)) return true;
  if (ALLOWLIST_PREFIX.some(p => file.startsWith(p))) return true;
  if (SKIP_FILE_SUFFIX.some(s => file.endsWith(s))) return true;
  return false;
}

// ── Heuristic: hit inside a browser-IIFE template string ──────────────────

/** True when the match sits inside a template literal body that declares
 *  a `function(){` — i.e. we're looking at a browser-side script template.
 *  Cheap but effective for our two hot sites (decay-engine / timeTravel). */
function insideBrowserIIFE(source: string, matchIndex: number): boolean {
  const before = source.slice(0, matchIndex);
  const lastBacktick = before.lastIndexOf('`');
  if (lastBacktick < 0) return false;
  const lastCloseBacktick = source.indexOf('`', matchIndex);
  if (lastCloseBacktick < 0) return false;
  const inside = source.slice(lastBacktick, matchIndex);
  return /function\s*\(\s*\)\s*\{/.test(inside);
}

// ── Scan a single file ────────────────────────────────────────────────────

function scanFile(file: string, out: Violation[]): void {
  const source = fs.readFileSync(file, 'utf8');
  pushMatches(file, source, RE_DATE_NOW, 'Date.now()', out);
  pushMatches(file, source, RE_NEW_DATE_EMPTY, 'new Date()', out);
}

function pushMatches(
  file: string, source: string, re: RegExp,
  rule: Violation['rule'], out: Violation[],
): void {
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (insideBrowserIIFE(source, m.index)) continue;
    const { line, col } = lineColOf(source, m.index);
    out.push({ file, line, col, rule, context: lineAt(source, line) });
  }
}

function lineColOf(src: string, idx: number): { line: number; col: number } {
  const before = src.slice(0, idx);
  const line = before.split('\n').length;
  const col = before.length - before.lastIndexOf('\n');
  return { line, col };
}

function lineAt(src: string, line: number): string {
  return src.split('\n')[line - 1]?.trim() ?? '';
}

// ── Report ────────────────────────────────────────────────────────────────

function printReport(violations: Violation[], mode: 'warn' | 'error'): void {
  if (!violations.length) {
    console.log('✅ check-no-raw-now: no raw Date.now() / new Date() outside allowlist.');
    return;
  }
  const tag = mode === 'error' ? '❌' : '⚠️ ';
  console.log(`${tag} check-no-raw-now: ${violations.length} callsite(s) still raw.`);
  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }
  for (const [f, list] of [...byFile.entries()].sort()) {
    const rel = path.relative(process.cwd(), f);
    console.log(`  ${rel}  (${list.length})`);
    for (const v of list.slice(0, 3)) {
      console.log(`    ${v.line}:${v.col}  ${v.rule}  ${v.context}`);
    }
    if (list.length > 3) console.log(`    … +${list.length - 3} more`);
  }
  if (mode === 'warn') {
    console.log('\n(warn mode — see src/lib/clock.ts for the seam. Migrate then re-run with --error.)');
  }
}

// ── Entrypoint ────────────────────────────────────────────────────────────

function main(): void {
  const mode: 'warn' | 'error' = process.argv.includes('--error') ? 'error' : 'warn';
  const files = walk(ROOT).filter(f => !isAllowed(f));
  const violations: Violation[] = [];
  for (const f of files) scanFile(f, violations);
  printReport(violations, mode);
  if (mode === 'error' && violations.length > 0) process.exit(1);
}

main();

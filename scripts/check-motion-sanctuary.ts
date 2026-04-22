// scripts/check-motion-sanctuary.ts
//
// v152 motion-sanctuary guard (Mike napkin §C).
//
// Rule (one, short): every file that activates a CSS `animation:` /
// `animation-name:` declaration outside a reduced-motion context MUST
// declare a `@media (prefers-reduced-motion: reduce)` block in the same
// file, so a vestibular-sensitive reader never meets a motion that the
// file's author did not think about.
//
// Philosophy:
//   - Reduced-motion is a contract, not a courtesy. Making it a build-
//     time invariant moves it out of review memory and into the cascade.
//   - False positives are this script's bug. We ship an escape hatch.
//   - The check is per-file (local), not per-keyframe (global) — because
//     files are the unit of review. A new animation lands in one PR
//     touching one file; its sanctuary should too.
//
// Escape hatch (use sparingly, document why):
//   /* motion-sanctuary: ok */
// Place this comment anywhere in the file's scanned scope (CSS file or
// the .astro <style> block). Preferred form: near the animation, with
// a one-line note on why the global token-zero policy suffices.
//
// Exit codes:
//   0 → all scanned files either have a local sanctuary or an escape.
//   1 → at least one violation; a teaching message lists each file +
//       the offending animation-property line(s).
//
// Credits: Mike (napkin §C — the guard), Tanya (UX spec §2.3 reduced-
//          motion audit), Paul (test-first, "the test IS the feature"),
//          Sid — 2026-04-22. Motto: "Code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';
import { extractStyleBlocks } from './lib/astro-style-blocks.ts';

// ── Config (mirrors check-token-compliance.ts shape) ────────────────────

const STYLES_DIR = path.resolve(process.cwd(), 'src/styles');
const COMPONENTS_DIR = path.resolve(process.cwd(), 'src/components');
const PAGES_DIR = path.resolve(process.cwd(), 'src/pages');

/** Files that DEFINE motion tokens — they live above the rule; they
 *  carry the shared keyframe library and their own authoritative RM
 *  sanctuary. Exempt by role, not by grace. */
const MOTION_FILE_EXEMPT = new Set<string>(['motion.css']);

const SANCTUARY_HATCH = 'motion-sanctuary: ok';
const RM_QUERY_RE = /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce[^)]*\)/;
const ANIM_PROP_RE = /^[^*/}]*\banimation(?:-name)?\s*:/;

// ── Types ───────────────────────────────────────────────────────────────

interface Hit {
  file: string;
  line: number;       // 1-based
  rule: string;
  snippet: string;
}

// ── Pure scanner (exported for the test suite / reuse) ──────────────────

/**
 * Scan a single file's CSS body for animation-without-sanctuary. The
 * caller passes an array of lines + the file-relative line offset so
 * .astro <style> blocks report the right whole-file line number.
 */
export function scanBody(
  lines: string[],
  fileName: string,
  lineOffset: number,
): Hit[] {
  if (hasHatch(lines)) return [];
  const animHits = collectAnimationHits(lines, fileName, lineOffset);
  if (animHits.length === 0) return [];
  if (hasRMBlock(lines)) return [];
  return animHits;
}

/** True when the file contains the `motion-sanctuary: ok` escape. */
function hasHatch(lines: string[]): boolean {
  return lines.some((ln) => ln.includes(SANCTUARY_HATCH));
}

/** True when the file contains at least one `@media (prefers-reduced-motion: reduce)` */
function hasRMBlock(lines: string[]): boolean {
  return lines.some((ln) => RM_QUERY_RE.test(ln));
}

/** True when the given line index is inside a `@media prefers-reduced-motion` block. */
function isInsideRMBlock(lines: string[], i: number): boolean {
  let depth = 0;
  for (let k = 0; k <= i; k++) {
    const ln = lines[k];
    if (RM_QUERY_RE.test(ln)) depth = 1;
    else if (depth > 0) {
      depth += (ln.match(/{/g) ?? []).length;
      depth -= (ln.match(/}/g) ?? []).length;
      if (depth <= 0) depth = 0;
    }
  }
  return depth > 0;
}

/** Emit one hit per `animation:`/`animation-name:` line seen outside RM scope. */
function collectAnimationHits(
  lines: string[],
  fileName: string,
  lineOffset: number,
): Hit[] {
  const hits: Hit[] = [];
  lines.forEach((ln, i) => {
    if (!ANIM_PROP_RE.test(ln)) return;
    if (isInsideRMBlock(lines, i)) return;
    hits.push({
      file: fileName,
      line: lineOffset + i,
      rule: 'motion-sanctuary-missing',
      snippet: ln.trim(),
    });
  });
  return hits;
}

// ── File-level wrappers ─────────────────────────────────────────────────

function scanCSSFile(filePath: string): Hit[] {
  if (MOTION_FILE_EXEMPT.has(path.basename(filePath))) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.relative(process.cwd(), filePath);
  return scanBody(content.split('\n'), fileName, 1);
}

function scanAstroFile(filePath: string): Hit[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.relative(process.cwd(), filePath);
  const hits: Hit[] = [];
  for (const block of extractStyleBlocks(content)) {
    hits.push(...scanBody(block.lines, fileName, block.startLine));
  }
  return hits;
}

// ── Collectors ──────────────────────────────────────────────────────────

function collectCssFiles(dir: string): string[] {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(dir, f));
}

function collectAstroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectAstroFiles(full));
    else if (e.name.endsWith('.astro')) out.push(full);
  }
  return out;
}

// ── Reporter ────────────────────────────────────────────────────────────

function teachingMessage(): string {
  return [
    '',
    '  Fix options (pick the one that matches author intent):',
    '    1) Add a local sanctuary neighboring the animation:',
    '       @media (prefers-reduced-motion: reduce) {',
    '         <selector> { animation: none; }',
    '       }',
    '    2) If the animation\'s duration is a globally-RM-zeroed token',
    '       (motion.css :root overrides) AND that fact is load-bearing,',
    '       annotate the file with:  /* motion-sanctuary: ok */',
    '       plus a one-line note explaining why the hatch is truthful.',
    '',
  ].join('\n');
}

function printReport(hits: Hit[]): void {
  console.log(`\n❌  motion-sanctuary: ${hits.length} animation(s) without a local RM sanctuary.\n`);
  const byFile = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byFile.get(h.file) ?? [];
    arr.push(h);
    byFile.set(h.file, arr);
  }
  for (const [file, arr] of byFile) {
    console.log(`  ${file} (${arr.length})`);
    for (const h of arr) {
      console.log(`    ${h.line}  ${h.snippet}`);
    }
    console.log();
  }
  console.log(teachingMessage());
}

// ── Entry ──────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(STYLES_DIR)) {
    console.error(`Error: ${STYLES_DIR} not found.`);
    process.exit(1);
  }
  const cssHits = collectCssFiles(STYLES_DIR).flatMap(scanCSSFile);
  const astroFiles = [
    ...collectAstroFiles(COMPONENTS_DIR),
    ...collectAstroFiles(PAGES_DIR),
  ];
  const astroHits = astroFiles.flatMap(scanAstroFile);
  const all = [...cssHits, ...astroHits];
  if (all.length === 0) {
    const total = cssHits.length + astroHits.length;
    const scanned = collectCssFiles(STYLES_DIR).length + astroFiles.length;
    console.log(`✅  motion-sanctuary: ${scanned} scannable files clean (${total} hits).`);
    return;
  }
  printReport(all);
  process.exit(1);
}

main();

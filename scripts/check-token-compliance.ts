/**
 * scripts/check-token-compliance.ts
 *
 * Design token compliance linter for src/styles/*.css AND .astro inline <style>.
 * Detects raw color/font-size literals that must live in tokens.css only.
 *
 * Rules (per Mike's architecture spec + Tanya §15 compliance checklist):
 *   - Hex colors (#xxx, #xxxxxx, #xxxxxxxx) are banned outside tokens.css
 *   - rgba() / rgb() raw function calls are banned outside tokens.css
 *   - hsla() / hsl() raw function calls are banned outside tokens.css
 *   - Bare font-size rem values (e.g. font-size: 0.82rem) are banned; use tokens
 *
 * Allowed:
 *   - tokens.css itself (primitives live there by design)
 *   - oklch() — the canonical OKLCH color format; always allowed
 *   - color-mix() — compositing from existing tokens; always allowed
 *   - rem in layout properties (padding, margin, gap, width, height, etc.)
 *   - calc() expressions — may contain rem for layout math
 *   - var(--token, #fallback) — defensive CSS fallbacks inside var() are allowed
 *
 * Exit code: 0 = clean, 1 = violations found
 *
 * Architecture: Michael Koch · Compliance spec: Tanya Donska · 2026-04-12
 * Extended to scan .astro <style> blocks: Sid · 2026-04-14
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  line: number;
  column: number;
  rule: string;
  match: string;
  context: string;
}

interface RuleDefinition {
  name: string;
  pattern: RegExp;
  description: string;
}

// ── Config ─────────────────────────────────────────────────────────────────

const STYLES_DIR = path.resolve(process.cwd(), "src/styles");
const COMPONENTS_DIR = path.resolve(process.cwd(), "src/components");
const PAGES_DIR = path.resolve(process.cwd(), "src/pages");
const SKIP_FILES = new Set(["tokens.css"]);

/** Guard files: MUST be clean. Prebuild exits non-zero if these have violations.
 *  Add files here once their token migration is complete. */
const GUARD_FILES = new Set([
  "src/components/PactPanel.astro",
  "src/pages/blog/[slug].astro",
  "src/components/EndangeredCard.astro",
  "src/components/EndangeredBand.astro",
  "src/components/TombstoneCard.astro",
  "src/components/LandingHero.astro",
  "src/components/RiverFilter.astro",
  "src/styles/surfaces.css",
]);

const FONT_SIZE_PROP = /font-size\s*:/i;

const RULES: RuleDefinition[] = [
  {
    name: "no-hex-color",
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
    description: "Raw hex color — use a token from tokens.css",
  },
  {
    name: "no-raw-rgba",
    pattern: /\brgba?\s*\(/g,
    description: "Raw rgba()/rgb() — use color-mix() with a token",
  },
  {
    name: "no-raw-hsla",
    pattern: /\bhsla?\s*\(/g,
    description: "Raw hsla()/hsl() — convert to OKLCH token",
  },
  {
    name: "no-raw-font-size-rem",
    pattern: /\b\d+\.?\d*rem\b/g,
    description: "Raw rem in font-size — use a --text-* token",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function isCommentLine(line: string): boolean {
  return /^\s*(\/\*|\*|\/\/)/.test(line);
}

function stripInlineComment(line: string): string {
  const idx = line.indexOf("/*");
  return idx >= 0 ? line.slice(0, idx) : line;
}

function isFontSizeLine(line: string): boolean {
  return FONT_SIZE_PROP.test(line);
}

function isLayoutRemLine(line: string): boolean {
  const layout = /^\s*(padding|margin|gap|width|height|max-width|min-width|top|bottom|left|right|inset|border-radius|outline-offset)\s*:/i;
  return layout.test(line);
}

/** Defensive CSS: var(--token, #fallback) is allowed — skip hex/rgb inside var() */
function isInsideVarFallback(line: string, matchIdx: number): boolean {
  const before = line.slice(0, matchIdx);
  const lastVar = before.lastIndexOf("var(");
  if (lastVar < 0) return false;
  const segment = before.slice(lastVar);
  const hasComma = segment.includes(",");
  const opens = (segment.match(/\(/g) ?? []).length;
  const closes = (segment.match(/\)/g) ?? []).length;
  return hasComma && opens > closes;
}

/** clamp() responsive font-size values are intentional — skip rem inside clamp() */
function isClampRemValue(line: string, matchIdx: number): boolean {
  const before = line.slice(0, matchIdx);
  const last = before.lastIndexOf("clamp(");
  if (last < 0) return false;
  const afterClamp = before.slice(last + 6);
  const opens = (afterClamp.match(/\(/g) ?? []).length;
  const closes = (afterClamp.match(/\)/g) ?? []).length;
  return opens >= closes;
}

// ── Core scan (pure function — works on any CSS string) ────────────────────

function scanCSS(lines: string[], fileName: string): Violation[] {
  const violations: Violation[] = [];
  let inBlockComment = false;

  lines.forEach((rawLine, idx) => {
    if (!inBlockComment && rawLine.includes("/*")) {
      if (!rawLine.includes("*/")) inBlockComment = true;
      const stripped = rawLine.replace(/\/\*.*?\*\//g, "");
      if (!inBlockComment && (isCommentLine(stripped) || stripped.trim() === "")) return;
    } else if (inBlockComment) {
      if (rawLine.includes("*/")) inBlockComment = false;
      return;
    }

    if (isCommentLine(rawLine)) return;

    const line = stripInlineComment(rawLine);
    const lineNumber = idx + 1;

    for (const rule of RULES) {
      if (rule.name === "no-raw-font-size-rem") {
        if (!isFontSizeLine(line)) continue;
        if (isLayoutRemLine(line)) continue;
      }

      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.pattern.exec(line)) !== null) {
        if (rule.name === "no-raw-font-size-rem" && isClampRemValue(line, match.index)) continue;
        if (isInsideVarFallback(line, match.index)) continue;
        violations.push({
          file: fileName,
          line: lineNumber,
          column: match.index + 1,
          rule: rule.name,
          match: match[0],
          context: rawLine.trim(),
        });
      }
    }
  });

  return violations;
}

// ── File scan wrappers ─────────────────────────────────────────────────────

function scanCSSFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.relative(process.cwd(), filePath);
  return scanCSS(content.split("\n"), fileName);
}

/** Extract <style> blocks from .astro files, preserving original line offsets */
function scanAstroFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.relative(process.cwd(), filePath);
  const allLines = content.split("\n");
  const violations: Violation[] = [];
  const styleRe = /<style[^>]*>/g;
  let styleMatch: RegExpExecArray | null;

  while ((styleMatch = styleRe.exec(content)) !== null) {
    const startOffset = styleMatch.index + styleMatch[0].length;
    const endTag = content.indexOf("</style>", startOffset);
    if (endTag < 0) continue;

    const beforeBlock = content.slice(0, startOffset);
    const startLine = beforeBlock.split("\n").length;
    const block = content.slice(startOffset, endTag);
    const blockLines = block.split("\n");

    const raw = scanCSS(blockLines, fileName);
    for (const v of raw) {
      violations.push({ ...v, line: v.line + startLine - 1 });
    }
  }

  return violations;
}

// ── File collectors ────────────────────────────────────────────────────────

function collectCssFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".css") && !SKIP_FILES.has(f))
    .map((f) => path.join(dir, f));
}

function collectAstroFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectAstroFiles(full));
    else if (entry.name.endsWith(".astro")) results.push(full);
  }
  return results;
}

// ── Report ─────────────────────────────────────────────────────────────────

function printSection(title: string, violations: Violation[]): void {
  if (violations.length === 0) return;

  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const group = byFile.get(v.file) ?? [];
    group.push(v);
    byFile.set(v.file, group);
  }

  console.log(`\n── ${title} (${violations.length}) ──\n`);
  for (const [file, vList] of byFile) {
    console.log(`  ${file} (${vList.length})`);
    for (const v of vList) {
      console.log(`    ${v.line}:${v.column}  [${v.rule}]  ${v.match}`);
      console.log(`             ${v.context}`);
    }
    console.log();
  }
}

function printReport(css: Violation[], astro: Violation[]): void {
  const total = css.length + astro.length;
  if (total === 0) {
    console.log("✅  Token compliance: all clear (CSS + Astro).");
    return;
  }

  console.log(`\n❌  Token compliance: ${total} violation(s) found.\n`);
  printSection("CSS files (src/styles/)", css);
  printSection("Astro inline <style> blocks", astro);
  console.log("Fix: replace raw values with tokens from src/styles/tokens.css.");
  console.log("     var(--token, #fallback) is allowed — defensive CSS is OK.\n");
}

// ── Guard filter ──────────────────────────────────────────────────────────

function filterGuarded(violations: Violation[]): Violation[] {
  return violations.filter((v) => GUARD_FILES.has(v.file));
}

function filterUnguarded(violations: Violation[]): Violation[] {
  return violations.filter((v) => !GUARD_FILES.has(v.file));
}

// ── Entry ──────────────────────────────────────────────────────────────────

function main(): void {
  const guardMode = process.argv.includes("--guard");

  if (!fs.existsSync(STYLES_DIR)) {
    console.error(`Error: styles directory not found at ${STYLES_DIR}`);
    process.exit(1);
  }

  const cssFiles = collectCssFiles(STYLES_DIR);
  const astroFiles = [
    ...collectAstroFiles(COMPONENTS_DIR),
    ...collectAstroFiles(PAGES_DIR),
  ];

  const cssViolations: Violation[] = [];
  const astroViolations: Violation[] = [];

  for (const f of cssFiles) cssViolations.push(...scanCSSFile(f));
  for (const f of astroFiles) astroViolations.push(...scanAstroFile(f));

  if (guardMode) {
    const guardCss = filterGuarded(cssViolations);
    const guardAstro = filterGuarded(astroViolations);
    const guardTotal = guardCss.length + guardAstro.length;
    const warnTotal = cssViolations.length + astroViolations.length - guardTotal;

    if (guardTotal > 0) {
      printReport(guardCss, guardAstro);
      console.log(`  (${warnTotal} additional violations in unguarded files — fix in next sprint)\n`);
      process.exit(1);
    }

    console.log(`\u2705  Guard check: ${GUARD_FILES.size} guarded files clean.`);
    if (warnTotal > 0) {
      console.log(`   \u26a0\ufe0f  ${warnTotal} violations remain in unguarded files.\n`);
    }
    return;
  }

  printReport(cssViolations, astroViolations);

  if (cssViolations.length + astroViolations.length > 0) {
    process.exit(1);
  }
}

main();

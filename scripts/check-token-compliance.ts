/**
 * scripts/check-token-compliance.ts
 *
 * Design token compliance linter for src/styles/*.css
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
 *
 * Exit code: 0 = clean, 1 = violations found
 *
 * Architecture: Michael Koch · Compliance spec: Tanya Donska · 2026-04-12
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
const SKIP_FILES = new Set(["tokens.css"]);

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
  const commentIdx = line.indexOf("/*");
  return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
}

function isFontSizeLine(line: string): boolean {
  return FONT_SIZE_PROP.test(line);
}

function isLayoutRemLine(line: string): boolean {
  return /^\s*(padding|margin|gap|width|height|max-width|min-width|top|bottom|left|right|inset|border-radius|outline-offset)\s*:/i.test(line);
}

/** clamp() responsive font-size values are intentional — skip rem inside clamp() */
function isClampRemValue(line: string, matchIndex: number): boolean {
  const before = line.slice(0, matchIndex);
  const lastClampIdx = before.lastIndexOf("clamp(");
  if (lastClampIdx < 0) return false;
  const afterClamp = before.slice(lastClampIdx + 6); // text after "clamp("
  const opens  = (afterClamp.match(/\(/g) ?? []).length;
  const closes = (afterClamp.match(/\)/g) ?? []).length;
  return opens >= closes; // balanced or surplus = still inside clamp argument list
}

// ── Core scan ──────────────────────────────────────────────────────────────

function scanFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];
  const fileName = path.relative(process.cwd(), filePath);
  let inBlockComment = false;

  lines.forEach((rawLine, idx) => {
    // Track block comment boundaries
    if (!inBlockComment && rawLine.includes("/*")) {
      if (!rawLine.includes("*/")) inBlockComment = true;
      // Inline /* ... */ on same line — strip it and continue
      const stripped = rawLine.replace(/\/\*.*?\*\//g, "");
      if (!inBlockComment && (isCommentLine(stripped) || stripped.trim() === "")) return;
    } else if (inBlockComment) {
      if (rawLine.includes("*/")) inBlockComment = false;
      return; // skip entire continuation line
    }

    if (isCommentLine(rawLine)) return;

    const line = stripInlineComment(rawLine);
    const lineNumber = idx + 1;

    for (const rule of RULES) {
      // font-size rem rule: only flag rem on font-size declarations
      if (rule.name === "no-raw-font-size-rem") {
        if (!isFontSizeLine(line)) continue;
        if (isLayoutRemLine(line)) continue;
      }

      // reset lastIndex for global regexes between lines
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.pattern.exec(line)) !== null) {
        // Skip rem values inside clamp() — responsive font-size math is intentional
        if (rule.name === "no-raw-font-size-rem" && isClampRemValue(line, match.index)) {
          continue;
        }
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

function collectCssFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".css") && !SKIP_FILES.has(f))
    .map((f) => path.join(dir, f));
}

// ── Report ─────────────────────────────────────────────────────────────────

function printReport(allViolations: Violation[]): void {
  if (allViolations.length === 0) {
    console.log("✅  Token compliance: all clear.");
    return;
  }

  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const group = byFile.get(v.file) ?? [];
    group.push(v);
    byFile.set(v.file, group);
  }

  console.log(`\n❌  Token compliance: ${allViolations.length} violation(s) found.\n`);

  for (const [file, violations] of byFile) {
    console.log(`  ${file} (${violations.length})`);
    for (const v of violations) {
      console.log(`    ${v.line}:${v.column}  [${v.rule}]  ${v.match}`);
      console.log(`             ${v.context}`);
    }
    console.log();
  }

  console.log("Fix: replace raw values with tokens from src/styles/tokens.css.");
  console.log("     If no token matches, add the token first — never inline a new value.\n");
}

// ── Entry ──────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(STYLES_DIR)) {
    console.error(`Error: styles directory not found at ${STYLES_DIR}`);
    process.exit(1);
  }

  const files = collectCssFiles(STYLES_DIR);
  const allViolations: Violation[] = [];

  for (const file of files) {
    allViolations.push(...scanFile(file));
  }

  printReport(allViolations);

  if (allViolations.length > 0) {
    process.exit(1);
  }
}

main();

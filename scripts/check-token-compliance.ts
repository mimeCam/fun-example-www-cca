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

type ViolationSeverity = "error" | "warn";

interface Violation {
  file: string;
  line: number;
  column: number;
  rule: string;
  match: string;
  context: string;
  severity: ViolationSeverity;
}

interface RuleDefinition {
  name: string;
  pattern: RegExp;
  description: string;
  severity?: ViolationSeverity;
}

// ── Config ─────────────────────────────────────────────────────────────────

const STYLES_DIR = path.resolve(process.cwd(), "src/styles");
const COMPONENTS_DIR = path.resolve(process.cwd(), "src/components");
const PAGES_DIR = path.resolve(process.cwd(), "src/pages");
const SKIP_FILES = new Set(["tokens.css", "typography.css"]);

/** Guard files: MUST be clean. Prebuild exits non-zero if these have violations.
 *  Ratchet to 100%: every scannable file is now guarded. — Sid 2026-04-17
 *  Architecture: Michael Koch · Compliance spec: Tanya Donska                */
const GUARD_FILES = new Set([
  // ── CSS files (40 of 42 — tokens.css & typography.css are in SKIP_FILES) ──
  "src/styles/ambient.css",
  "src/styles/atmosphere.css",
  "src/styles/author-profile.css",
  "src/styles/ba-unlock-ceremony.css",
  "src/styles/ba-unlock-progress.css",
  "src/styles/batting-average-chip.css",
  "src/styles/batting-average.css",
  "src/styles/batting-progress.css",
  "src/styles/card-base.css",
  "src/styles/community-submit.css",
  "src/styles/community.css",
  "src/styles/conviction-live.css",
  "src/styles/conviction-record.css",
  "src/styles/death-clock.css",
  "src/styles/decay-clock.css",
  "src/styles/decay-stage-identity.css",
  "src/styles/decay.css",
  "src/styles/dispute.css",
  "src/styles/endangered.css",
  "src/styles/ghost-echoes.css",
  "src/styles/global.css",
  "src/styles/graveyard.css",
  "src/styles/heartbeat.css",
  "src/styles/keep-button.css",
  "src/styles/leaderboard.css",
  "src/styles/motion.css",
  "src/styles/nav.css",
  "src/styles/notarize-stamp.css",
  "src/styles/revival-moment.css",
  "src/styles/revival.css",
  "src/styles/river-filter.css",
  "src/styles/river.css",
  "src/styles/seal-ceremony.css",
  "src/styles/seal-receipt.css",
  "src/styles/seal-sound-toggle.css",
  "src/styles/stage-transitions.css",
  "src/styles/surfaces.css",
  "src/styles/trust-badge.css",
  "src/styles/verdict-ceremony.css",
  "src/styles/verdict.css",
  // ── Components (73 .astro files) ──────────────────────────────────────────
  "src/components/AnchorStrip.astro",
  "src/components/AuditReceipt.astro",
  "src/components/AuditVerdictPanel.astro",
  "src/components/AuthorConvictionTimeline.astro",
  "src/components/AuthorProfileHero.astro",
  "src/components/BattingAverageChip.astro",
  "src/components/BattingAverageHero.astro",
  "src/components/BattingAverageUnlockCeremony.astro",
  "src/components/BattingAverageUnlockProgress.astro",
  "src/components/BattingProgressRing.astro",
  "src/components/BloomParticles.astro",
  "src/components/ConvictionAuditTrail.astro",
  "src/components/ConvictionMeter.astro",
  "src/components/ConvictionPanel.astro",
  "src/components/ConvictionRecord.astro",
  "src/components/ConvictionStrip.astro",
  "src/components/ConvictionTimeline.astro",
  "src/components/DeathClockBanner.astro",
  "src/components/DecayBar.astro",
  "src/components/DecayCard.astro",
  "src/components/DecayClock.astro",
  "src/components/DisputeChallenge.astro",
  "src/components/DisputeQuorum.astro",
  "src/components/DisputeTally.astro",
  "src/components/EndangeredBand.astro",
  "src/components/EndangeredCard.astro",
  "src/components/EndangeredFeed.astro",
  "src/components/FrameSchedulerProvider.astro",
  "src/components/GhostEchoes.astro",
  "src/components/GraveyardEmptyState.astro",
  "src/components/GraveyardLedger.astro",
  "src/components/GraveyardTeaser.astro",
  "src/components/KeepButton.astro",
  "src/components/LeaderboardCard.astro",
  "src/components/Murmurs.astro",
  "src/components/NotarizeStamp.astro",
  "src/components/NowLine.astro",
  "src/components/OpenLoopCard.astro",
  "src/components/PactPanel.astro",
  "src/components/Pagination.astro",
  "src/components/PostBadge.astro",
  "src/components/PostNav.astro",
  "src/components/PredictionCard.astro",
  "src/components/PredictionVault.astro",
  "src/components/PresenceBand.astro",
  "src/components/ReadingPulse.astro",
  "src/components/RevivalBadge.astro",
  "src/components/RevivalCounter.astro",
  "src/components/RevivalMoment.astro",
  "src/components/RisenBadge.astro",
  "src/components/RiverFilter.astro",
  "src/components/RiverLegend.astro",
  "src/components/RiverNode.astro",
  "src/components/SEOMeta.astro",
  "src/components/SavedMoment.astro",
  "src/components/SealCeremony.astro",
  "src/components/SealReceipt.astro",
  "src/components/SealSoundToggle.astro",
  "src/components/ShareSealButton.astro",
  "src/components/ShareSheet.astro",
  "src/components/SiteNav.astro",
  "src/components/StagePill.astro",
  "src/components/StickyStanceBar.astro",
  "src/components/TensionBadge.astro",
  "src/components/TombstoneCard.astro",
  "src/components/TrackRecord.astro",
  "src/components/TrajectoryBlock.astro",
  "src/components/TrophyTierLadder.astro",
  "src/components/TrustBadge.astro",
  "src/components/VerdictCard.astro",
  "src/components/VerdictCeremony.astro",
  "src/components/VerdictResolutionPanel.astro",
  "src/components/VerdictReveal.astro",
  // ── Pages (17 .astro files) ───────────────────────────────────────────────
  "src/pages/admin.astro",
  "src/pages/audit/[slug].astro",
  "src/pages/author/[slug].astro",
  "src/pages/author/index.astro",
  "src/pages/author/submit.astro",
  "src/pages/blog/[slug].astro",
  "src/pages/community/[slug].astro",
  "src/pages/community/index.astro",
  "src/pages/community/submit.astro",
  "src/pages/endangered.astro",
  "src/pages/graveyard.astro",
  "src/pages/index.astro",
  "src/pages/leaderboard.astro",
  "src/pages/map.astro",
  "src/pages/now.astro",
  "src/pages/predictions.astro",
  "src/pages/track-record.astro",
  "src/pages/verdict.astro",
  "src/pages/verdict/[slug].astro",
]);

const FONT_SIZE_PROP = /font-size\s*:/i;
const FONT_WEIGHT_PROP = /font-weight\s*:/i;
const LINE_HEIGHT_PROP = /line-height\s*:/i;
const LETTER_SPACING_PROP = /letter-spacing\s*:/i;
const FONT_FAMILY_PROP = /font-family\s*:/i;

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

/* ── Typography composition rules (WARN — not guard violations) ──────────
 * Detect raw typography patterns that suggest a missing .type-* class.
 * These are warnings for the migration backlog, not build blockers.
 * Architecture: Michael Koch · Impl: Sid 2026-04-17                      */

const TYPO_WARN_RULES: RuleDefinition[] = [
  {
    name: "typo-raw-letter-spacing",
    pattern: /\b\d+\.?\d*em\b/g,
    description: "Raw letter-spacing — use --tracking-* token or .type-* class",
    severity: "warn",
  },
  {
    name: "typo-raw-font-weight",
    pattern: /\b[1-9]00\b/g,
    description: "Raw font-weight — use --weight-* token or .type-* class",
    severity: "warn",
  },
  {
    name: "typo-raw-font-family",
    pattern: /\bsystem-ui\b|\bsans-serif\b|\bmonospace\b/g,
    description: "Raw font stack — use var(--font-sans) or var(--font-mono)",
    severity: "warn",
  },
];

/** Check if a line declares a typography property (not layout) */
function isTypographyPropLine(rule: RuleDefinition, line: string): boolean {
  if (rule.name === "typo-raw-letter-spacing") return LETTER_SPACING_PROP.test(line);
  if (rule.name === "typo-raw-font-weight") return FONT_WEIGHT_PROP.test(line);
  if (rule.name === "typo-raw-font-family") return FONT_FAMILY_PROP.test(line);
  return false;
}

/** Font-weight values inside var() fallbacks are allowed */
function isVarReference(line: string): boolean {
  return /var\(--/.test(line);
}

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
          severity: "error",
        });
      }
    }

    // Typography warn rules — only fire on matching property lines
    for (const rule of TYPO_WARN_RULES) {
      if (!isTypographyPropLine(rule, line)) continue;
      if (isVarReference(line)) continue;

      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.pattern.exec(line)) !== null) {
        if (isInsideVarFallback(line, match.index)) continue;
        violations.push({
          file: fileName,
          line: lineNumber,
          column: match.index + 1,
          rule: rule.name,
          match: match[0],
          context: rawLine.trim(),
          severity: "warn",
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
      const tag = v.severity === "warn" ? "WARN" : "ERR ";
      console.log(`    ${tag} ${v.line}:${v.column}  [${v.rule}]  ${v.match}`);
      console.log(`              ${v.context}`);
    }
    console.log();
  }
}

/** Split violations by severity */
function partitionSeverity(violations: Violation[]): { errors: Violation[]; warns: Violation[] } {
  const errors: Violation[] = [];
  const warns: Violation[] = [];
  for (const v of violations) {
    if (v.severity === "warn") warns.push(v);
    else errors.push(v);
  }
  return { errors, warns };
}

function printReport(css: Violation[], astro: Violation[]): void {
  const all = [...css, ...astro];
  const { errors, warns } = partitionSeverity(all);
  const total = all.length;

  if (total === 0) {
    console.log("✅  Token compliance: all clear (CSS + Astro).");
    return;
  }

  if (errors.length > 0) {
    console.log(`\n❌  Token compliance: ${errors.length} error(s) found.\n`);
    const cssErrors = css.filter(v => v.severity !== "warn");
    const astroErrors = astro.filter(v => v.severity !== "warn");
    printSection("CSS files (src/styles/)", cssErrors);
    printSection("Astro inline <style> blocks", astroErrors);
    console.log("Fix: replace raw values with tokens from src/styles/tokens.css.");
    console.log("     var(--token, #fallback) is allowed — defensive CSS is OK.\n");
  }

  if (warns.length > 0) {
    const cssWarns = css.filter(v => v.severity === "warn");
    const astroWarns = astro.filter(v => v.severity === "warn");
    console.log(`\n⚠️   Typography: ${warns.length} composition warning(s).`);
    console.log(`     Consider using .type-* classes from typography.css.\n`);
    printSection("Typography warnings — CSS", cssWarns);
    printSection("Typography warnings — Astro", astroWarns);
  }
}

// ── Guard filter ──────────────────────────────────────────────────────────

/** Guard mode only fails on errors in guarded files — warns never block */
function filterGuarded(violations: Violation[]): Violation[] {
  return violations.filter((v) => GUARD_FILES.has(v.file) && v.severity !== "warn");
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

  const allViolations = [...cssViolations, ...astroViolations];
  const { errors: allErrors, warns: allWarns } = partitionSeverity(allViolations);

  if (guardMode) {
    const guardCss = filterGuarded(cssViolations);
    const guardAstro = filterGuarded(astroViolations);
    const guardTotal = guardCss.length + guardAstro.length;
    const errorTotal = allErrors.length - guardTotal;
    const warnTotal = allWarns.length;

    if (guardTotal > 0) {
      printReport(guardCss, guardAstro);
      console.log(`  (${errorTotal} errors + ${warnTotal} warns in unguarded files)\n`);
      process.exit(1);
    }

    console.log(`\u2705  Guard check: ${GUARD_FILES.size} guarded files clean.`);
    if (errorTotal > 0 || warnTotal > 0) {
      console.log(`   \u26a0\ufe0f  ${errorTotal} errors + ${warnTotal} typography warnings remain in unguarded files.\n`);
    }
    return;
  }

  printReport(cssViolations, astroViolations);

  // Only exit non-zero for errors — warns are advisory
  if (allErrors.length > 0) {
    process.exit(1);
  }
}

main();

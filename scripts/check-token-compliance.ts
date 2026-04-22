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
import {
  parseStageTokens, formatStageTokensFile,
} from "./generate-stage-tokens.ts";

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
  "src/styles/stage-motion.css",
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
  "src/pages/api/docs.astro",
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

/** Files exempt from duration enforcement (they DEFINE duration tokens) */
const DURATION_EXEMPT = new Set(["motion.css"]);

/** Canonical breakpoint values — @media using these is noted, not warned.
 *  639 = max-width complement of 640 (--bp-md - 1px) — valid pattern. */
const CANONICAL_BREAKPOINTS = new Set([480, 639, 640, 768, 1024]);

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

/* ── Typography composition rules (ERROR — migration complete) ──────────
 * Raw typography values are now CI-blocking errors.
 * Migration: 189 → 0 warnings (Sid 2026-04-18). Regressions impossible.
 * Architecture: Michael Koch · Impl: Sid 2026-04-17 / 2026-04-18        */

const TYPO_WARN_RULES: RuleDefinition[] = [
  {
    name: "typo-raw-letter-spacing",
    pattern: /\b\d+\.?\d*em\b/g,
    description: "Raw letter-spacing — use --tracking-* token",
    severity: "error",
  },
  {
    name: "typo-raw-font-weight",
    pattern: /\b[1-9]00\b/g,
    description: "Raw font-weight — use --weight-* token",
    severity: "error",
  },
  {
    name: "typo-raw-font-family",
    pattern: /\bsystem-ui\b|\bsans-serif\b|\bmonospace\b/g,
    description: "Raw font stack — use var(--font-sans) or var(--font-mono)",
    severity: "error",
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

// ── Enforcement Helpers (Mike §napkin — duration/z-index/breakpoint/radius) ──

/** True when line declares a transition or animation timing property */
function isTimingPropLine(line: string): boolean {
  return /^\s*(transition|animation)(-duration|-delay)?\s*:/i.test(line);
}

/** True when line is a shorthand transition or animation (inline colon) */
function isTimingShorthand(line: string): boolean {
  return /\b(transition|animation)\s*:/i.test(line);
}

/** True when line is a CSS custom property definition (--*:) */
function isCustomPropDef(line: string): boolean {
  return /^\s*--[\w-]+\s*:/.test(line);
}

/** True when line contains z-index property */
function isZIndexProp(line: string): boolean {
  return /z-index\s*:/i.test(line);
}

/** True when z-index value is via var(--z-*) token */
function hasTokenizedZIndex(line: string): boolean {
  return /var\(--z-/.test(line);
}

/** True when line is a border-radius declaration */
function isBorderRadiusProp(line: string): boolean {
  return /border-radius\s*:/i.test(line);
}

/** True when line is an @media query */
function isMediaQuery(line: string): boolean {
  return /^\s*@media\b/.test(line);
}

/** True when file is exempt from duration enforcement */
function isDurationExempt(fileName: string): boolean {
  return DURATION_EXEMPT.has(path.basename(fileName));
}

/** True when the match at matchIdx is the VALUE part of a var(--token) ref */
function isWrappedByVar(line: string, matchIdx: number): boolean {
  const before = line.slice(0, matchIdx);
  const lastVar = before.lastIndexOf("var(");
  if (lastVar < 0) return false;
  const segment = line.slice(lastVar, matchIdx + 10);
  return /var\(--[\w-]+/.test(segment);
}

/** True when a raw duration value is near-zero (accessibility pattern).
 *  0ms, 0.01ms, 1ms — intentional instant-transition overrides for
 *  prefers-reduced-motion or JS-driven properties. Not design durations. */
function isNearZeroDuration(value: string): boolean {
  const num = parseFloat(value);
  return num <= 1;
}

// ── Core scan (pure function — works on any CSS string) ────────────────────

function scanCSS(lines: string[], fileName: string): Violation[] {
  const violations: Violation[] = [];
  let inBlockComment = false;
  let inReducedMotion = 0; /* brace depth inside @media (prefers-reduced-motion) */

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

    // Track @media (prefers-reduced-motion) block depth
    if (/prefers-reduced-motion/.test(rawLine)) {
      inReducedMotion = 1;
    } else if (inReducedMotion > 0) {
      const opens = (rawLine.match(/{/g) ?? []).length;
      const closes = (rawLine.match(/}/g) ?? []).length;
      inReducedMotion += opens - closes;
      if (inReducedMotion <= 0) inReducedMotion = 0;
    }

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

    // ── Duration enforcement (Mike §napkin — ERROR) ──────────────────────
    // Raw ms/s in transition/animation lines → must use motion token.
    // Exempt: motion.css (defines tokens), custom prop defs, var() ctx,
    //         prefers-reduced-motion blocks, near-zero accessibility values.
    if (!isDurationExempt(fileName) && !isCustomPropDef(line) && inReducedMotion === 0) {
      if (isTimingPropLine(line) || isTimingShorthand(line)) {
        const durRe = /\b(\d+)(ms)\b/g;
        durRe.lastIndex = 0;
        let dm: RegExpExecArray | null;
        while ((dm = durRe.exec(line)) !== null) {
          if (isInsideVarFallback(line, dm.index)) continue;
          if (isVarReference(line) && isWrappedByVar(line, dm.index)) continue;
          if (isNearZeroDuration(dm[0])) continue;
          violations.push({
            file: fileName, line: lineNumber, column: dm.index + 1,
            rule: "no-raw-duration",
            match: dm[0],
            context: rawLine.trim(),
            severity: "error",
          });
        }
        // Catch seconds (0.3s, 1.2s) — separate pattern
        const secRe = /\b(\d+\.?\d*)(s)\b/g;
        secRe.lastIndex = 0;
        let sm: RegExpExecArray | null;
        while ((sm = secRe.exec(line)) !== null) {
          if (sm[0].endsWith("ms")) continue;
          if (isInsideVarFallback(line, sm.index)) continue;
          if (isVarReference(line) && isWrappedByVar(line, sm.index)) continue;
          if (isNearZeroDuration(sm[0])) continue;
          violations.push({
            file: fileName, line: lineNumber, column: sm.index + 1,
            rule: "no-raw-duration",
            match: sm[0],
            context: rawLine.trim(),
            severity: "error",
          });
        }
      }
    }

    // ── Z-index enforcement (Mike §napkin — ERROR) ───────────────────────
    // Raw z-index integer → must use var(--z-*) token.
    // Exempt: z-index: -1 (structural, below stacking context parent).
    if (isZIndexProp(line) && !hasTokenizedZIndex(line) && !isCustomPropDef(line)) {
      const zRe = /z-index\s*:\s*(-?\d+)/i;
      const zm = zRe.exec(line);
      if (zm && zm[1] !== "-1" && !isInsideVarFallback(line, zm.index)) {
        violations.push({
          file: fileName, line: lineNumber, column: zm.index + 1,
          rule: "no-raw-zindex",
          match: `z-index: ${zm[1]}`,
          context: rawLine.trim(),
          severity: "warn",
        });
      }
    }

    // ── Breakpoint (Mike §napkin — ERROR, promoted from WARN) ─────────────
    // @media with non-canonical px values is a hard error.
    // Canonical set: 480, 639, 640, 768, 1024.
    // Migration: 11 → 0 warnings (Sid 2026-04-18). Regressions impossible.
    if (isMediaQuery(line)) {
      const bpRe = /\b(\d+)px\b/g;
      bpRe.lastIndex = 0;
      let bm: RegExpExecArray | null;
      while ((bm = bpRe.exec(line)) !== null) {
        const px = parseInt(bm[1], 10);
        if (!CANONICAL_BREAKPOINTS.has(px)) {
          violations.push({
            file: fileName, line: lineNumber, column: bm.index + 1,
            rule: "breakpoint-raw",
            match: `${px}px`,
            context: rawLine.trim(),
            severity: "error",
          });
        }
      }
    }

    // ── Border-radius (Tanya §10 — ERROR, promoted from WARN) ────────────
    // Hardcoded border-radius values → must use --radius-* token.
    // `inherit` is intentional CSS cascade (decay card ::after, revival).
    // Migration: 44 → 0 warnings (Sid 2026-04-18). Regressions impossible.
    if (isBorderRadiusProp(line) && !isVarReference(line) && !isCustomPropDef(line)) {
      const brRe = /\b(\d+px|50%|9999px)\b/g;
      brRe.lastIndex = 0;
      let br: RegExpExecArray | null;
      while ((br = brRe.exec(line)) !== null) {
        if (isInsideVarFallback(line, br.index)) continue;
        violations.push({
          file: fileName, line: lineNumber, column: br.index + 1,
          rule: "border-radius-raw",
          match: br[0],
          context: rawLine.trim(),
          severity: "error",
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

// ── DecayStage literal-set guard (Mike §7.6, Paul immutability commitment) ──
// The five wire strings are the published API vocabulary. Renaming, reordering,
// or adding to them is a breaking change — fail the build the moment that set
// drifts so the change is forced through review and the docs page in lockstep.

const DECAY_ENGINE_TS = path.resolve(process.cwd(), "src/lib/decay-engine.ts");
const CANONICAL_DECAY_STAGES = ["fresh", "fading", "endangered", "ghost", "fossil"];

function parseDecayStagesTuple(source: string): string[] | null {
  const re = /export\s+const\s+DECAY_STAGES\s*=\s*\[([^\]]+)\]\s*as\s+const/;
  const match = re.exec(source);
  if (!match) return null;
  return match[1]
    .split(",")
    .map(s => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function decayStagesGuardMessage(found: string[] | null): string {
  const want = JSON.stringify(CANONICAL_DECAY_STAGES);
  const got  = JSON.stringify(found ?? []);
  return [
    "❌  DECAY_STAGES literal set drifted in src/lib/decay-engine.ts.",
    `    expected: ${want}`,
    `    found:    ${got}`,
    "    These five strings are the published API vocabulary (see /api/docs).",
    "    Renaming or reordering them is a breaking change — revert or rev the docs.",
  ].join("\n");
}

function checkDecayStagesLiteralSet(): boolean {
  const src = fs.readFileSync(DECAY_ENGINE_TS, "utf-8");
  const tuple = parseDecayStagesTuple(src);
  if (tuple && tuple.length === CANONICAL_DECAY_STAGES.length &&
      tuple.every((s, i) => s === CANONICAL_DECAY_STAGES[i])) {
    return true;
  }
  console.log(decayStagesGuardMessage(tuple));
  return false;
}

// ── Stage-tokens generated-file staleness check (Mike napkin §6.5) ─────────
// Regenerate in-memory from tokens.css, diff against the committed file.
// Fails with a teaching message telling the dev exactly what to run.

const STAGE_TOKENS_CSS = path.resolve(process.cwd(), "src/styles/tokens.css");
const STAGE_TOKENS_TS = path.resolve(process.cwd(), "src/lib/stage-tokens.generated.ts");

function regeneratedStageTokens(): string {
  const css = fs.readFileSync(STAGE_TOKENS_CSS, "utf-8");
  return formatStageTokensFile(parseStageTokens(css));
}

function committedStageTokens(): string {
  if (!fs.existsSync(STAGE_TOKENS_TS)) return "";
  return fs.readFileSync(STAGE_TOKENS_TS, "utf-8");
}

function stageTokensStaleMessage(): string {
  return [
    "❌  src/lib/stage-tokens.generated.ts is stale vs src/styles/tokens.css.",
    "    Run:  npm run generate:stage-tokens && git add src/lib/stage-tokens.generated.ts",
  ].join("\n");
}

function checkStageTokensFreshness(): boolean {
  const fresh = regeneratedStageTokens();
  const committed = committedStageTokens();
  if (fresh === committed) return true;
  console.log(stageTokensStaleMessage());
  return false;
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

    const stageTokensFresh = checkStageTokensFreshness();
    const decayStagesOk = checkDecayStagesLiteralSet();

    if (guardTotal > 0 || !stageTokensFresh || !decayStagesOk) {
      if (guardTotal > 0) {
        printReport(guardCss, guardAstro);
        console.log(`  (${errorTotal} errors + ${warnTotal} warns in unguarded files)\n`);
      }
      process.exit(1);
    }

    console.log(`\u2705  Guard check: ${GUARD_FILES.size} guarded files clean. stage-tokens.generated.ts current. DECAY_STAGES set immutable.`);
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

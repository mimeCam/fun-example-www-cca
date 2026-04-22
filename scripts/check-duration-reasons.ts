// scripts/check-duration-reasons.ts
//
// The Duration Ledger guard (Mike napkin §1 — "one reason per millisecond").
//
// Rule (stated once, enforced by regex):
//   Every literal duration declaration in src/styles/tokens.css
//   (a line of shape `--foo-duration: 833ms;`) must carry a
//   `/* reason: <label> */` comment, where `<label>` is drawn from
//   the closed vocabulary in scripts/lib/duration-reasons.ts.
//
//   Aliases — lines of shape `--foo-duration: var(--bar-duration);` —
//   are exempt. They inherit the referenced token's reason (§5.1).
//
// Why a regex not an AST:
//   The sibling guards (check-motion-sanctuary, check-ds-kbd,
//   check-citation-delegation) all use line-scanner + narrow regex.
//   Matching that shape keeps the prebuild chain uniform and the
//   maintenance surface zero. CSS parsing via an AST would add a
//   dependency the project explicitly refuses. See openloop/AGENTS.md
//   ("Begin exploring from shared — grow the shared layer when two
//   call sites exist"): this guard IS the second call site, and the
//   shared extraction is flagged in the PR description for a follow-up.
//
// Error UX:
//   One line per violation: file:line:col rule match context. Same
//   shape as check-token-compliance.ts so CI log skim-time is flat.
//
// Exit codes:
//   0 → every literal-ms token cites a legal reason.
//   1 → at least one violation; teaching message lists each breach
//       and reminds the dev where the vocabulary lives.
//
// Credits: Mike (v3 napkin §§1-5 — ledger spec + alias rule), Elon (§4
// arithmetic that killed the count-cap in favor of the reason-rule),
// Tanya (§9 refusal discipline — no new tokens without PR note), Paul
// (the ceiling-must-be-printable requirement), sibling guards for the
// shape, Sid — 2026-04-22. Motto: "Code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';

import {
  LEGAL_REASONS,
  LEGAL_REASONS_SET,
  REASON_COMMENT_RE,
  computeReducedMotionMask,
  isAliasValue,
  isLiteralDurationDecl,
  parseLiteralDuration,
  parseReasonComment,
} from './lib/duration-reasons.ts';

// ── Target configuration (explicit list — no blanket CSS walk) ───────────

/** Files scanned by the guard. All are design-system CSS sources — any
 *  literal `ms`/`s` in any of them cites a label from the closed vocabulary.
 *  motion.css joined the ledger in v158 (Krystle v157 / Mike napkin v158);
 *  verdict-ceremony.css joined in v159 (Krystle/Paul/Mike napkin v159).
 *  The contract and the enforcer must agree, so AGENTS.md was widened in
 *  the same PR. Adding a further file here widens the contract further —
 *  expect a PR note + a matching AGENTS.md touch.                          */
export const TARGET_FILES: readonly string[] = [
  'src/styles/tokens.css',
  'src/styles/motion.css',
  'src/styles/verdict-ceremony.css',
];

// ── Types ────────────────────────────────────────────────────────────────

export type Violation = Readonly<{
  file: string;
  line: number;
  column: number;
  rule: string;
  match: string;
  context: string;
}>;

// ── Pure scanner (unit-tested via check-duration-reasons.test.ts) ────────

/** Scan a single CSS body (array of lines + file label) for violations.
 *  Reuses the pure helpers in duration-reasons.ts — any change to the
 *  ledger vocabulary rebinds this scanner automatically.
 *
 *  Lines inside `@media (prefers-reduced-motion: reduce) { … }` are
 *  exempt: their `0ms` overrides are an accessibility policy, not a
 *  perceptual choice (Mike napkin v158 §5.2). */
export function scanDurationReasons(
  lines: string[],
  fileName: string,
): Violation[] {
  const reducedMotionMask = computeReducedMotionMask(lines);
  const out: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (reducedMotionMask[i]) continue;
    const line = lines[i];
    if (!isLiteralDurationDecl(line)) continue;
    if (isAliasValue(line)) continue;
    const v = checkOneDeclaration(line, lines, i, fileName);
    if (v) out.push(v);
  }
  return out;
}

/** Check one literal-duration line; return a Violation if its reason is
 *  missing / unknown, or null when the line is compliant. The reason may
 *  live on the same line (`--foo: 300ms;  /* reason: ceremony-phase *\/`)
 *  or on the immediately-preceding block-comment line (pattern already in
 *  use around tokens.css §Motion — Mike §5.1).                             */
function checkOneDeclaration(
  line: string,
  lines: string[],
  idx: number,
  fileName: string,
): Violation | null {
  const parsed = parseLiteralDuration(line);
  if (!parsed) return null;
  const reason = findReasonForLine(line, lines, idx);
  if (reason === 'ok') return null;
  const column = line.indexOf(parsed.value) + 1;
  return asViolation(fileName, idx + 1, column, reason, parsed, line);
}

/** Tri-state reason resolver: 'ok' | 'missing' | 'unknown:<label>'.
 *  The reason must live on the same line OR on the immediately-preceding
 *  standalone block-comment line — a trailing `/* reason: X *\/` on a
 *  sibling declaration does NOT satisfy the rule (Mike §5.1 pattern).   */
function findReasonForLine(
  line: string,
  lines: string[],
  idx: number,
): 'ok' | 'missing' | `unknown:${string}` {
  const onSame = parseReasonComment(line);
  if (onSame) return 'ok';
  const prevRaw = idx > 0 ? lines[idx - 1] : '';
  const prevCommentLine = isStandaloneBlockComment(prevRaw) ? prevRaw : '';
  if (prevCommentLine && parseReasonComment(prevCommentLine)) return 'ok';
  return classifyMissingVsUnknown(line, prevCommentLine);
}

/** True when a line is a standalone block comment (no declaration on it).
 *  Shape: optional whitespace, `/*`, anything, `*\/`, optional whitespace. */
function isStandaloneBlockComment(line: string): boolean {
  return /^\s*\/\*[^]*\*\/\s*$/.test(line);
}

/** Differentiate "no comment at all" from "comment with a bad label". */
function classifyMissingVsUnknown(
  line: string,
  prev: string,
): 'missing' | `unknown:${string}` {
  const m = REASON_COMMENT_RE.exec(line) ?? REASON_COMMENT_RE.exec(prev);
  if (!m) return 'missing';
  return `unknown:${m[1]}`;
}

/** Shape a Violation from a classified declaration.                       */
function asViolation(
  file: string,
  line: number,
  column: number,
  reason: 'missing' | `unknown:${string}`,
  parsed: { prop: string; value: string },
  raw: string,
): Violation {
  const [kind, bad] = reason.split(':');
  const rule = kind === 'missing'
    ? 'duration-reason-missing'
    : 'duration-reason-unknown';
  const match = kind === 'missing'
    ? `${parsed.prop}: ${parsed.value}`
    : `reason: ${bad}`;
  return { file, line, column, rule, match, context: raw.trim() };
}

// ── File wrappers ────────────────────────────────────────────────────────

function scanFile(rel: string): Violation[] {
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) return fileMissingViolation(rel);
  const content = fs.readFileSync(abs, 'utf-8');
  return scanDurationReasons(content.split('\n'), rel);
}

/** Flag a missing target file as a hard violation (guard shouldn't silently
 *  pass when the file it guards has moved or been deleted).                */
function fileMissingViolation(rel: string): Violation[] {
  return [{
    file: rel, line: 0, column: 0,
    rule: 'duration-reason-target-missing',
    match: rel,
    context: 'target file does not exist — update TARGET_FILES or restore',
  }];
}

// ── Reporter ─────────────────────────────────────────────────────────────

function teachingMessage(): string {
  const legal = LEGAL_REASONS.join(', ');
  return [
    '',
    '  Fix: add a `/* reason: <label> */` comment to the same line',
    '       (or the immediately-preceding block-comment line) where',
    '       the duration is declared. Legal labels:',
    `         ${legal}`,
    '',
    '  The ledger lives at: scripts/lib/duration-reasons.ts',
    '  Adding a new label to the closed vocabulary requires a PR note.',
    '',
  ].join('\n');
}

function printReport(violations: Violation[]): void {
  console.error(
    `\n❌  check-duration-reasons: ${violations.length} violation(s)\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.column}  [${v.rule}]  ${v.match}`);
    console.error(`      ${v.context}`);
  }
  console.error(teachingMessage());
}

// ── Entrypoint ───────────────────────────────────────────────────────────

function main(): void {
  const violations: Violation[] = [];
  for (const rel of TARGET_FILES) violations.push(...scanFile(rel));
  if (violations.length === 0) {
    const targets = TARGET_FILES.length;
    const labels = LEGAL_REASONS_SET.size;
    console.log(
      `✅  check-duration-reasons: ${targets} file(s) clean · ${labels} legal labels.`,
    );
    return;
  }
  printReport(violations);
  process.exit(1);
}

// Run only when invoked directly (mirror of check-citation-delegation.ts).
// Keeps test imports side-effect free.
const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) main();

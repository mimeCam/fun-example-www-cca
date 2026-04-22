// scripts/generate-stage-tokens.ts
//
// Codegen: reads src/styles/tokens.css (human-edited single source of truth),
// emits src/lib/stage-tokens.generated.ts with a DO-NOT-EDIT header.
//
// Scope — Move A only (Mike's napkin, 2026-04-22):
//   · --stage-*-text-primary → STAGE_TEXT_PRIMARY_OPACITY
//   · --stage-*-title-weight → STAGE_TITLE_WEIGHT
//
// Deliberately out of scope (see _reports/from-michael-koch §5, §7):
//   · decay OKLCH colors        — no non-CSS consumer today (YAGNI)
//   · Satori 0.88 composite     — surface transform, stays in og/ layout
//   · API `stage` field         — Move C, deferred
//
// Parser: regex. tokens.css is flat and well-formed. If that ever breaks
// the parser, that's a signal to rethink — not an excuse to pre-ship a
// full CSS AST today. (Mike §6.4, Tanya "sift".)
//
// Credits: Mike (napkin §2, §5, §6), Tanya (§1 visual-contract table),
//          Elon (atomise to Move A only), Paul (DoD checklist).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Contract ───────────────────────────────────────────────────────────────

/** Decay-ontology keys mirrored from src/lib/decay-engine.ts `DecayStage`.
 *  A compile-time assertion in the generated file enforces equality. */
export const STAGE_KEYS = [
  'fresh', 'fading', 'endangered', 'ghost', 'fossil',
] as const;

export type StageKey = typeof STAGE_KEYS[number];

export interface StageTokens {
  textPrimary: Record<StageKey, number>;
  titleWeight: Record<StageKey, number>;
}

// ── Parser (pure, unit-tested) ─────────────────────────────────────────────

/** Parse stage-scoped presentational atoms from tokens.css source text. */
export function parseStageTokens(css: string): StageTokens {
  return {
    textPrimary: extractPerStage(css, 'text-primary', parseFloat),
    titleWeight: extractPerStage(css, 'title-weight', parseBase10),
  };
}

function parseBase10(s: string): number {
  return parseInt(s, 10);
}

function extractPerStage(
  css: string, suffix: string, toNum: (s: string) => number,
): Record<StageKey, number> {
  const out = {} as Record<StageKey, number>;
  for (const key of STAGE_KEYS) out[key] = readOneStage(css, key, suffix, toNum);
  return out;
}

function readOneStage(
  css: string, key: StageKey, suffix: string, toNum: (s: string) => number,
): number {
  const re = new RegExp(`--stage-${key}-${suffix}\\s*:\\s*([\\d.]+)\\s*;`);
  const m = re.exec(css);
  if (!m) throw new Error(`missing --stage-${key}-${suffix} in tokens.css`);
  return toNum(m[1]);
}

// ── Formatter (pure, deterministic, idempotent) ────────────────────────────

/** Render the .generated.ts file contents. Same input → same bytes. */
export function formatStageTokensFile(t: StageTokens): string {
  return [
    fileHeader(),
    stageKeysLine(),
    stageKeyTypeLine(),
    stageAssertionBlock(),
    recordBlock('STAGE_TEXT_PRIMARY_OPACITY', t.textPrimary),
    recordBlock('STAGE_TITLE_WEIGHT', t.titleWeight),
    '',
  ].join('\n');
}

function fileHeader(): string {
  return [
    '// AUTO-GENERATED from src/styles/tokens.css. DO NOT EDIT BY HAND.',
    '// Regenerate: `npm run generate:stage-tokens`',
    '// Scope: Move A presentational atoms. Mike napkin 2026-04-22.',
    '',
    `import type { DecayStage } from './decay-engine';`,
    '',
  ].join('\n');
}

function stageKeysLine(): string {
  const quoted = STAGE_KEYS.map((s) => `'${s}'`).join(', ');
  return `export const STAGE_KEYS = [${quoted}] as const;`;
}

function stageKeyTypeLine(): string {
  return `export type StageKey = typeof STAGE_KEYS[number];`;
}

function stageAssertionBlock(): string {
  return [
    '',
    '// Compile-time assertion: StageKey ≡ DecayStage. If the CSS gains a',
    '// stage the ontology does not know about (or vice versa), TypeScript',
    '// breaks the build. Cheaper than a runtime test. (Mike §napkin #1.)',
    'const _stageKeyIsDecayStage: DecayStage = null as unknown as StageKey;',
    'const _decayStageIsStageKey: StageKey = null as unknown as DecayStage;',
    'void _stageKeyIsDecayStage; void _decayStageIsStageKey;',
    '',
  ].join('\n');
}

function recordBlock(name: string, rec: Record<StageKey, number>): string {
  const entries = STAGE_KEYS.map((k) => `  ${k}: ${formatNum(rec[k])},`).join('\n');
  return `export const ${name}: Record<StageKey, number> = {\n${entries}\n};`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

// ── I/O wrapper ────────────────────────────────────────────────────────────

/** Read tokens.css, write stage-tokens.generated.ts. Thin shell for tests. */
export function runCodegen(
  cssPath: string, outPath: string,
): { wrote: string; bytes: number } {
  const css = readFileSync(cssPath, 'utf-8');
  const body = formatStageTokensFile(parseStageTokens(css));
  writeFileSync(outPath, body, 'utf-8');
  return { wrote: outPath, bytes: body.length };
}

// ── CLI entrypoint ─────────────────────────────────────────────────────────

function main(): void {
  const cssPath = resolve(process.cwd(), 'src/styles/tokens.css');
  const outPath = resolve(process.cwd(), 'src/lib/stage-tokens.generated.ts');
  const { wrote, bytes } = runCodegen(cssPath, outPath);
  console.log(`✅  generated ${wrote} (${bytes} bytes)`);
}

// tsx sets import.meta.url; invoke main when run directly (not imported).
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) main();

// scripts/check-no-chip-lit-in-arrival.ts
//
// v154 — the invariant fence (Mike napkin §5.1, AGENTS.md amendment).
//
// Rule, stated once:
//
//   src/lib/client/arrival.ts MUST NOT reference the chip-lit vocabulary
//   (`ds-kbd-lit`, `lightForKey`, `unlightForKey`).
//
// Why it's a guard, not a style note:
//
// The v153 chip-lit contract says `.ds-kbd[data-lit]` ⇔ the user-pressed-
// this-key gesture. Arrival-via-nonce is a gesture by *another* user, in
// *another* timezone. If `paintArrival()` ever lit the `c` chip, every
// reader would see a legend chip flicker for a keystroke they did NOT
// make — the teaching contract would rot from within. The fence is what
// keeps a well-meaning future PR from smuggling the overload back in.
//
// Design:
//   · One file, one invariant, one greppable word list.
//   · Pure TS, no AST, no dependencies beyond `fs` (mirrors check-ds-kbd).
//   · Zero false positives: we scan a single file, not the whole src/.
//     If a future refactor moves the arrival sub-system to a new path,
//     update TARGET below (and the AGENTS.md amendment in the same PR).
//
// Exit codes:
//   0 → arrival.ts is clean; legend vocabulary stays on its island.
//   1 → a forbidden reference exists; message points to file:line.
//
// Credits: Mike (napkin §5.1 fence-as-feature, §check-no-chip-lit "this
//          is the whole point"), Tanya (UX spec §6 "the teaching contract
//          stays untouched"), Elon (report 32 "new meaning earns new
//          pixels" — the sentinel that keeps it honest), Sid — 2026-04-22.
//          Motto: "code maintenance without tests."

import * as fs from 'fs';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────

const TARGET = 'src/lib/client/arrival.ts';

/** The forbidden vocabulary. If any of these words appears in arrival.ts,
 *  the chip-lit fence has been breached. Each word is a bright line:
 *    · `ds-kbd-lit`   — module identity. Imports / re-exports caught here.
 *    · `lightForKey`  — the main chip-lit verb.
 *    · `unlightForKey`— its symmetric partner (keep-hotkey pattern).
 *  Word list stays narrow on purpose: we want to fence THE CONTRACT, not
 *  harmlessly-named local vars the author might legitimately call `light`. */
const FORBIDDEN: readonly string[] = ['ds-kbd-lit', 'lightForKey', 'unlightForKey'];

// ── Pure helpers (≤ 10 lines each) ────────────────────────────────────────

interface Hit { readonly word: string; readonly line: number; readonly snippet: string; }

/** Strip `//` single-line comments from a line so the guard inspects code
 *  only, not the file's own prose about the rule. The fence is about
 *  IMPORTS and CALLS, not how the module documents itself. Multi-line
 *  `/* … *​/` blocks would need a tokenizer; we accept that as a limit
 *  and fail closed if anyone ever uses one to hide a reference.        */
function stripLineComment(line: string): string {
  const i = line.indexOf('//');
  return i === -1 ? line : line.slice(0, i);
}

/** Scan `text` for each forbidden word; return every hit with 1-based line. */
function scanText(text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const code = stripLineComment(lines[i]);
    for (const word of FORBIDDEN) {
      if (code.includes(word)) hits.push({ word, line: i + 1, snippet: lines[i].trim() });
    }
  }
  return hits;
}

/** Read the file at `rel`, relative to process.cwd(); empty string if missing. */
function readTarget(rel: string): string {
  const abs = path.resolve(process.cwd(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
}

// ── Entrypoint ────────────────────────────────────────────────────────────

function main(): void {
  const text = readTarget(TARGET);
  if (!text) {
    console.error(`❌  ${TARGET} missing — arrival sub-system cannot be fenced.`);
    process.exit(1);
  }
  const hits = scanText(text);
  if (hits.length === 0) {
    console.log(`✅  check-no-chip-lit-in-arrival: ${TARGET} is clean.`);
    return;
  }
  console.error(`❌  check-no-chip-lit-in-arrival: ${hits.length} breach(es) of the v154 fence in ${TARGET}:`);
  for (const h of hits) console.error(`  ✗ ${TARGET}:${h.line}  "${h.word}"  ${h.snippet}`);
  console.error('\n  The chip-lit contract (v153) is taught-key ⇔ chip-lit.');
  console.error('  Arrival is navigation, not a keystroke. See AGENTS.md §v154.');
  process.exit(1);
}

main();

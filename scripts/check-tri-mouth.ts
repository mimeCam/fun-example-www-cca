#!/usr/bin/env tsx
// scripts/check-tri-mouth.ts
// v173 "Tri-Mouth Inventory" — prebuild guard.
//
// Walks the frozen `TRI_MOUTH_ACTIONS` literal (src/lib/tri-mouth-inventory.ts)
// and emits a single-line diagnostic per violation (file:rule context),
// grep-friendly for CI. Same shape as scripts/check-no-raw-now.ts +
// scripts/check-citation-delegation.ts so the prebuild log reads uniform.
//
// Modes (CLI flag — mirrors Krystle's clock wedge):
//   --warn   print violations, exit 0  (default — landing mode)
//   --error  print violations, exit 1  (flip when `readyToPromote()` holds)
//
// Invariants the guard enforces (Mike napkin §5):
//   · §5.1 — every action.producer resolves to an existing .ts file.
//   · §5.2 — every action.curl matches VERB /api/... grammar.
//   · §5.3 — the curl path resolves to a file under src/pages/api/.
//   · §5.4 — every non-readonly row has all three mouths non-null OR
//            declares a single `pending` field.
//   · §5.5 — the route file *imports* the producer (v175: ES-import regex,
//            not substring — Elon §5.4 — so comments no longer pass).
//   · §5.6 — non-wired row count ≤ cap recorded in
//            data/tri-mouth-pending-cap.json (v175 monotonic ratchet).
//
// Non-goals: no AST, no ts-morph, no network, no better-sqlite3. fs +
// regex only. Every scanner fn is pure and ≤ 10 LoC so the test module
// can drive them with synthetic fixtures (Sid's rule-of-ten + golden
// pattern from check-citation-delegation.test.ts).
//
// Credits: Mike Koch (napkin §5 invariants, §2 file table), Krystle Clear
//          (--warn → --error wedge cadence), Paul Kim (MH-4 "parity drift
//          = build error"), Tanya Donska (UX §9 acceptance, §4.3 scope),
//          prior authors of scripts/check-no-raw-now.ts and
//          scripts/check-citation-delegation.ts (sibling shape), Sid —
//          2026-04-23. Motto: "code maintenance without tests."

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  TRI_MOUTH_ACTIONS,
  parseCurl,
  pendingSummary,
  wiredActions,
  readyToPromote,
  type TriMouthAction,
} from '../src/lib/tri-mouth-inventory.ts';

// ── Types ────────────────────────────────────────────────────────────────

export type RuleName =
  | 'producer-missing'
  | 'curl-shape'
  | 'route-missing'
  | 'surface-incomplete'
  | 'route-no-producer'
  | 'cap-exceeded'          // v175 §5.6 — monotonic cap breach.
  | 'cap-missing';          // v175 §5.6 — cap ledger unreadable.

export interface Finding {
  readonly action: string;
  readonly rule:   RuleName;
  readonly detail: string;
}

// ── Pure invariant scanners (each ≤ 10 LoC, unit-tested) ─────────────────

/** §5.1 — producer file must exist on disk. Returns `null` on pass. */
export function checkProducer(
  a: TriMouthAction, existsFn: (p: string) => boolean,
): Finding | null {
  if (existsFn(a.producer)) return null;
  return f(a, 'producer-missing', `producer file missing: ${a.producer}`);
}

/** §5.2 — curl string must be VERB /api/... (or null with a pending hint). */
export function checkCurlShape(a: TriMouthAction): Finding | null {
  if (a.curl === null) return null;
  return parseCurl(a.curl)
    ? null
    : f(a, 'curl-shape', `curl ill-formed: ${a.curl}`);
}

/** §5.3 — the curl path must resolve to a route file under src/pages/api/. */
export function checkRouteExists(
  a: TriMouthAction, existsFn: (p: string) => boolean,
): Finding | null {
  const parsed = parseCurl(a.curl);
  if (!parsed) return null;                  // §5.2 covers the grammar miss.
  const routes = routeCandidates(parsed.path);
  if (routes.some((r) => existsFn(r))) return null;
  return f(a, 'route-missing', `route file missing: ${routes[0]}`);
}

/** §5.4 — non-readonly row must have all three mouths OR one `pending`. */
export function checkSurfaceCompleteness(a: TriMouthAction): Finding | null {
  const gaps = nullMouths(a);
  if (gaps.length === 0) return null;                           // complete.
  if (gaps.length === 1 && a.pending === gaps[0]) return null;  // receipted.
  return f(a, 'surface-incomplete',
    `mouths null=[${gaps.join(',')}] pending=${a.pending ?? 'none'}`);
}

/** §5.5 — the route file must *import* the producer's basename. v175 teeth:
 *  a real import-statement regex replaces the previous substring match, which
 *  accepted comments (Elon §5.4 — a substring match is not an import proof).
 *  The regex matches `from '…/<token>'` with an optional `.ts` suffix. */
export function checkRouteImports(
  a: TriMouthAction,
  readFn: (p: string) => string | null,
): Finding | null {
  const parsed = parseCurl(a.curl);
  if (!parsed) return null;
  const route  = routeCandidates(parsed.path).find((r) => readFn(r) !== null);
  if (!route) return null;                   // §5.3 covers missing route.
  const source = readFn(route) ?? '';
  const token  = path.basename(a.producer, '.ts');
  if (hasProducerImport(source, token)) return null;
  return f(a, 'route-no-producer', `route ${route} does not import "${token}"`);
}

/** Real import-statement detector — matches ES module imports only.
 *  Accepts: `import X from '…/token'`, `import X from '…/token.ts'`,
 *  `import {X} from '…/token'`, bare `import '…/token'`. Rejects
 *  substring mentions in comments or doc-lines. */
export function hasProducerImport(source: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\bfrom\\s+['"\`][^'"\`]*/${escaped}(?:\\.ts)?['"\`]`,
    'm',
  );
  return re.test(source);
}

// ── Scanner composition ──────────────────────────────────────────────────

/** All five invariants for a single row. fs predicates are injected so
 *  the test module can drive the same code paths with an in-memory map. */
export function scanAction(
  a: TriMouthAction,
  existsFn: (p: string) => boolean,
  readFn:   (p: string) => string | null,
): Finding[] {
  const out: Finding[] = [];
  push(out, checkProducer(a, existsFn));
  push(out, checkCurlShape(a));
  push(out, checkRouteExists(a, existsFn));
  push(out, checkSurfaceCompleteness(a));
  push(out, checkRouteImports(a, readFn));
  return out;
}

/** Fold the whole inventory through `scanAction` + the inventory-wide
 *  monotonic-cap invariant. `readFn` is used to load the cap ledger. */
export function scanInventory(
  actions: readonly TriMouthAction[],
  existsFn: (p: string) => boolean,
  readFn:   (p: string) => string | null,
): Finding[] {
  const out: Finding[] = [];
  for (const a of actions) out.push(...scanAction(a, existsFn, readFn));
  push(out, checkMonotonicCap(actions, readFn));
  return out;
}

// ── §5.6 — monotonic cap invariant (v175 teeth) ──────────────────────────
//
// The cap ledger (data/tri-mouth-pending-cap.json) is a one-integer file
// versioned in git. It forbids *increasing* the count of non-wired rows:
// PRs that add a debt without paying one down are refused at prebuild.
// The cap can only descend — paying a wedge means decrementing `cap` by 1
// in the same PR that wires a mouth (Mike §4 / Elon §5.2).

/** Path of the cap ledger — repo-relative, injectable via the readFn. */
export const CAP_LEDGER_PATH = 'data/tri-mouth-pending-cap.json';

/** Read `cap` from the ledger JSON, or `null` when the file is absent
 *  or malformed. Malformed ledger → a cap-missing finding, not a throw. */
export function readCap(
  readFn: (p: string) => string | null,
): number | null {
  const raw = readFn(CAP_LEDGER_PATH);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { cap?: unknown };
    if (typeof parsed.cap !== 'number') return null;
    if (!Number.isInteger(parsed.cap) || parsed.cap < 0) return null;
    return parsed.cap;
  } catch {
    return null;
  }
}

/** §5.6 — actions-not-yet-wired must not exceed the cap. When the ledger
 *  is missing, emit a cap-missing finding so the prebuild log does not
 *  go silently green. Both branches carry the same `action: '<inventory>'`
 *  sentinel so diagnostics stay grep-uniform. */
export function checkMonotonicCap(
  actions: readonly TriMouthAction[],
  readFn: (p: string) => string | null,
): Finding | null {
  const cap = readCap(readFn);
  if (cap === null) {
    return inv('cap-missing', `cannot read ${CAP_LEDGER_PATH} — ratchet disarmed`);
  }
  const outstanding = actions.length - actions.filter(isWired).length;
  if (outstanding <= cap) return null;
  return inv('cap-exceeded',
    `${outstanding} non-wired rows exceed cap=${cap} — pay a wedge or raise the cap with review.`);
}

/** Wired predicate — matches wiredActions() definition in the inventory. */
function isWired(a: TriMouthAction): boolean {
  return a.status.startsWith('wired');
}

/** Inventory-wide finding (no single action owns it). */
function inv(rule: RuleName, detail: string): Finding {
  return { action: '<inventory>', rule, detail };
}

// ── Helpers (each ≤ 10 LoC) ──────────────────────────────────────────────

/** Assemble a finding — keep scanners to a single-line return. */
function f(a: TriMouthAction, rule: RuleName, detail: string): Finding {
  return { action: a.name, rule, detail };
}

/** Push only truthy findings — skips the "pass" null cases. */
function push(out: Finding[], finding: Finding | null): void {
  if (finding !== null) out.push(finding);
}

/** Names the mouths (if any) that are null on a row. */
function nullMouths(a: TriMouthAction): Array<'pointer' | 'keyboard' | 'curl'> {
  const gaps: Array<'pointer' | 'keyboard' | 'curl'> = [];
  if (a.pointer  === null) gaps.push('pointer');
  if (a.keyboard === null) gaps.push('keyboard');
  if (a.curl     === null) gaps.push('curl');
  return gaps;
}

/** Astro route resolution — `/api/foo/bar` → two candidate files. Keeps
 *  the guard independent of Astro's router internals. */
export function routeCandidates(apiPath: string): string[] {
  const rel = apiPath.replace(/^\//, '');            // drops leading slash.
  return [
    path.join('src', 'pages', `${rel}.ts`),
    path.join('src', 'pages', rel, 'index.ts'),
  ];
}

// ── fs predicates (production wiring — test module swaps these) ──────────

function existsOnDisk(rel: string): boolean {
  return fs.existsSync(path.resolve(process.cwd(), rel));
}

function readFromDisk(rel: string): string | null {
  const abs = path.resolve(process.cwd(), rel);
  try { return fs.readFileSync(abs, 'utf-8'); }
  catch { return null; }
}

// ── Report ───────────────────────────────────────────────────────────────

export function formatFinding(x: Finding): string {
  return `  tri-mouth:${x.action}: ${x.rule}: ${x.detail}`;
}

/** Summary line (Mike §9 acceptance 1): `N wired, M pending`. v175 adds
 *  the cap readout so the ratchet's level shows up in every CI log. */
export function summaryLine(
  actions: readonly TriMouthAction[],
  findings: readonly Finding[],
  mode: 'warn' | 'error',
  cap:  number | null = null,
): string {
  const wired   = wiredActions().length;
  const pending = pendingSummary();
  const fail    = findings.length;
  const modeTag = mode === 'error' ? '--error' : '--warn; no fail';
  const capTag  = cap === null ? 'cap=?' : `cap=${cap}`;
  const parts   = [
    `${wired} wired`,
    `${actions.length - wired} pending`,
    capTag,
    `pending-keyboard=${pending.keyboard}`,
    `pending-curl=${pending.curl}`,
    `findings=${fail}`,
  ];
  return `tri-mouth: ${parts.join(', ')} (${modeTag})`;
}

function printReport(findings: readonly Finding[], mode: 'warn' | 'error'): void {
  const tag = mode === 'error' && findings.length ? '❌' : '⚠️';
  if (findings.length === 0) {
    console.log('✅ check-tri-mouth: 0 violations.');
  } else {
    console.log(`${tag} check-tri-mouth: ${findings.length} violation(s)`);
    for (const x of findings) console.log(formatFinding(x));
  }
  console.log(summaryLine(TRI_MOUTH_ACTIONS, findings, mode, readCap(readFromDisk)));
  printPromotionHint(mode);
}

function printPromotionHint(mode: 'warn' | 'error'): void {
  if (mode === 'error') {
    printGoldPipBannerIfEarned();
    return;
  }
  const ready = readyToPromote();
  const msg = ready
    ? '(inventory meets promotion thresholds — flip to --error in the next PR.)'
    : '(warn mode — see src/lib/tri-mouth-inventory.ts; migrate pending rows and re-run.)';
  console.log(msg);
}

/** v176 PR-E §3.9 — one celebratory summary line when the inventory
 *  is fully wired AND the cap ledger has descended to zero. Pure print,
 *  no new module, no new branch in parity-seal.ts. The banner only
 *  fires under `--error` mode (i.e. on `main` with the prebuild flip
 *  landed) — preview branches still see the standard summary. */
function printGoldPipBannerIfEarned(): void {
  const wired = wiredActions().length;
  const total = TRI_MOUTH_ACTIONS.length;
  const cap   = readCap(readFromDisk);
  if (wired !== total || cap !== 0) return;
  console.log(`tri-mouth: ${wired}/${total} wired, cap=0, pip=lit ✓`);
}

// ── Entrypoint ───────────────────────────────────────────────────────────

function main(): void {
  const mode: 'warn' | 'error' = process.argv.includes('--error') ? 'error' : 'warn';
  const findings = scanInventory(TRI_MOUTH_ACTIONS, existsOnDisk, readFromDisk);
  printReport(findings, mode);
  if (mode === 'error' && findings.length > 0) process.exit(1);
}

// Module vs. CLI invocation — gate `main()` so the test file can import
// the pure scanners without the script side-effecting `process.exit`.
const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) main();

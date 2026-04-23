// scripts/check-user-journey.ts
// v168 "Journey Witness" — prebuild guard. The eighth guard (the first
// that watches a user, not a token — Mike napkin §8). Iterates the
// frozen JOURNEY_STEPS fixtures, dispatches each step through the real
// APIRoute handler, and asserts { status, bodyKeys, bodyLiteral } match.
//
// Run:
//   COMMUNITY_DB_PATH=:memory: npx tsx scripts/check-user-journey.ts
//
// Exit codes:
//   0 → every step's status + shape + literals match the fixture.
//   1 → one or more drifts; stderr prints file:row coordinate per failure.
//
// The DB_PATH env is hermetic by design: the happy-path submit writes a
// row into `community_posts`; an in-memory DB makes the test rerun-safe
// and leaves the real `data/revivals.db` untouched in CI and prebuild.
//
// Credits: Mike Koch ("Journey Witness" napkin §1/§2/§9, §8 risks),
//          Elon (§5.3 user-witnessing guard), Paul Kim (byte-exact
//          discipline carried from v155), Sid (≤10-LoC rule — every
//          helper below is 3-7 lines), citation-delegation.ts (sibling
//          guard style this copies). Motto: "code maintenance without
//          tests." 2026-04-23.

import * as path from 'path';
import {
  JOURNEY_STEPS, JOURNEY_STEP_COUNT,
  POW_TITLE, POW_BODY, POW_NONCE, POW_HASH, POW_DIFFICULTY,
} from '../src/lib/journey-golden';
import type { JourneyStep } from '../src/lib/journey-golden';
import {
  dispatchJourneyStep, hasShape, matchesLiteral, summarize,
} from '../src/lib/journey-witness';

// ── Reporter ──────────────────────────────────────────────────────────────

const errors: string[] = [];
function report(ok: boolean, msg: string): void { if (!ok) errors.push(msg); }

// ── Precondition: the nonce is still valid for the frozen body ────────────
//
// This is the ONE runtime PoW check. If a future dev edits POW_BODY and
// forgets to re-compute the nonce, the guard fails here before touching
// the network (well, the handler).
async function checkFrozenPow(): Promise<void> {
  const { createHash } = await import('crypto');
  const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
  const ch = sha(POW_TITLE + '\n' + POW_BODY);
  const recomputed = sha(ch + ':' + POW_NONCE);
  report(recomputed === POW_HASH,
    `  ✗ journey-golden: POW_HASH drift (title/body/nonce changed?) — re-run the scripts/ snippet in journey-golden.ts §6`);
  report(POW_HASH.startsWith(POW_DIFFICULTY),
    `  ✗ journey-golden: POW_HASH does not start with "${POW_DIFFICULTY}"`);
}

// ── Per-step dispatch + assert ────────────────────────────────────────────

/** Shallow `keys` shape check. */
function checkShape(step: JourneyStep, body: unknown): void {
  report(hasShape(body, step.expected.bodyKeys),
    `  ✗ ${step.step}: body missing keys [${step.expected.bodyKeys.join(', ')}] — got ${JSON.stringify(body).slice(0, 120)}`);
}

/** Optional literal sub-match (byte-exact on the keys that DON'T vary). */
function checkLiteral(step: JourneyStep, body: unknown): void {
  if (!step.expected.bodyLiteral) return;
  report(matchesLiteral(body, step.expected.bodyLiteral),
    `  ✗ ${step.step}: literal mismatch — expected ${JSON.stringify(step.expected.bodyLiteral)} against ${JSON.stringify(body).slice(0, 120)}`);
}

/** HTTP status code — always byte-exact. */
function checkStatus(step: JourneyStep, status: number): void {
  report(status === step.expected.status,
    `  ✗ ${step.step}: status ${status} ≠ expected ${step.expected.status}`);
}

async function witnessStep(step: JourneyStep): Promise<void> {
  try {
    const result = await dispatchJourneyStep(step.step);
    checkStatus  (step, result.status);
    checkShape   (step, result.body);
    checkLiteral (step, result.body);
    if (process.env.JOURNEY_VERBOSE) console.log(`  · ${step.step}: ${summarize(result)}`);
  } catch (err) {
    report(false, `  ✗ ${step.step}: dispatcher threw — ${(err as Error).message}`);
  }
}

// ── Order discipline: `read-empty-store` MUST run before the happy path ───
//
// The happy-path submit writes one row. If 'read-empty-store' ran AFTER
// the submit, the live count would be 1, not 0. The guard keeps the
// fixture's row-major order but also assures the dispatcher loop runs
// them sequentially (Mike §7 "row-major order" reminder).

/** Re-order JOURNEY_STEPS so the read precedes the happy-path submit.
 *  Pure function; fixture table is not mutated. */
function lifecycleOrder(steps: readonly JourneyStep[]): readonly JourneyStep[] {
  const read   = steps.filter((s) => s.step === 'read-empty-store');
  const others = steps.filter((s) => s.step !== 'read-empty-store');
  return [...read, ...others];
}

// ── Hermetic-DB guard: refuse to run against a file DB ────────────────────
//
// Paul §ship criteria: the guard must not touch real revivals.db. If the
// caller forgot to set COMMUNITY_DB_PATH=:memory:, bail before the first
// submit writes a row.
function assertHermeticDb(): void {
  const p = process.env.COMMUNITY_DB_PATH;
  if (p === ':memory:') return;
  console.error('❌  check-user-journey: refuse to run — COMMUNITY_DB_PATH must be ":memory:".');
  console.error('    export COMMUNITY_DB_PATH=:memory: && npx tsx scripts/check-user-journey.ts');
  process.exit(2);
}

// ── Entrypoint ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertHermeticDb();
  await checkFrozenPow();

  const ordered = lifecycleOrder(JOURNEY_STEPS);
  for (const step of ordered) await witnessStep(step);

  if (errors.length) return failWithDiagnostics();
  console.log(`✅  check-user-journey: ${JOURNEY_STEP_COUNT} step(s) witnessed · 5 submit branches + 1 read-empty + 1 endanger.`);
}

function failWithDiagnostics(): never {
  console.error(`❌  check-user-journey: ${errors.length} drift(s)`);
  for (const e of errors) console.error(e);
  console.error('\n  The guard is the canary (Mike napkin §8). Do not silence — fix the drift.');
  process.exit(1);
}

// Invoked only when run directly (so the .test.ts sibling can import the
// helpers without side-effecting).
const INVOKED_DIRECTLY =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (INVOKED_DIRECTLY) {
  main().catch((err) => {
    console.error('❌  check-user-journey: unexpected error');
    console.error(err);
    process.exit(1);
  });
}

// Re-exports for the .test.ts sibling — pure helpers only.
export { lifecycleOrder, checkFrozenPow };

// scripts/check-tri-mouth.test.ts
// v173 "Tri-Mouth Inventory" — unit tests for the guard's pure scanners.
//
// Run:  npx tsx --test scripts/check-tri-mouth.test.ts
//
// Why unit-test a guard (same argument as check-citation-delegation.test.ts):
//   A prebuild guard that only runs against live files rots silently —
//   it passes vacuously, or fails only on a real regression with no
//   signal that the guard itself is awake. Synthetic fixtures prove the
//   five invariants actually fail when the input is hole-shaped, and
//   pass when the input is clean. The test injects fake `existsFn` and
//   `readFn` so nothing touches disk.
//
// Credits: Mike Koch (napkin §2 — "synthetic inventory with a
//          deliberate hole"), Sid (10-line rule per test body),
//          check-citation-delegation.test.ts prior art. 2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkProducer,
  checkCurlShape,
  checkRouteExists,
  checkSurfaceCompleteness,
  checkRouteImports,
  checkMonotonicCap,
  hasProducerImport,
  readCap,
  scanAction,
  scanInventory,
  routeCandidates,
  formatFinding,
  summaryLine,
  CAP_LEDGER_PATH,
  type Finding,
} from './check-tri-mouth.ts';

import type { TriMouthAction } from '../src/lib/tri-mouth-inventory.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────

/** A fully-wired row. Every invariant should pass against healthy mocks. */
const CLEAN: TriMouthAction = {
  name:     'test-wired',
  mouth:    'test wired surface',
  pointer:  '.test-pointer',
  keyboard: 'T',
  curl:     'GET /api/test',
  producer: 'src/lib/test-producer.ts',
  status:   'wired',
};

/** Pending-keyboard row — keyboard null + pending='keyboard' → §5.4 pass. */
const PENDING_OK: TriMouthAction = {
  name:     'test-pending',
  mouth:    'test pending-keyboard surface',
  pointer:  '.test-pointer',
  keyboard: null,
  curl:     'POST /api/test-two',
  producer: 'src/lib/test-producer.ts',
  status:   'pending-keyboard',
  pending:  'keyboard',
};

/** v174 — wired-shape echo of the real `submit-post` row (Mike napkin
 *  v174.1 §4 file-table edit "Fixture row reflects new wired shape").
 *  Documents the post-promote shape so a future regression that drops
 *  the `keyboard` mouth back to `null` without a `pending` receipt
 *  fails on this fixture, not in production. */
const WIRED_SUBMIT_POST: TriMouthAction = {
  name:     'wired-submit-post-fixture',
  mouth:    'submit a community article (fixture)',
  pointer:  '/community form',
  keyboard: '⌘↩|Ctrl+Enter',
  curl:     'POST /api/test-two',
  producer: 'src/lib/test-producer.ts',
  status:   'wired',
};

/** Bogus curl shape (invariant §5.2 should fire). */
const BAD_CURL: TriMouthAction = {
  ...CLEAN, name: 'bad-curl', curl: 'FETCH the-thing' as any,
};

/** Null mouth without a `pending` receipt (invariant §5.4 should fire). */
const INCOMPLETE: TriMouthAction = {
  ...CLEAN, name: 'incomplete', keyboard: null,
};

/** Route file missing (invariant §5.3 should fire). */
const MISSING_ROUTE: TriMouthAction = {
  ...CLEAN, name: 'missing-route', curl: 'GET /api/does-not-exist',
};

/** Producer missing (invariant §5.1 should fire). */
const MISSING_PRODUCER: TriMouthAction = {
  ...CLEAN, name: 'missing-producer', producer: 'src/lib/vanished.ts',
};

/** Route file exists but does not mention the producer (invariant §5.5). */
const ROUTE_NO_IMPORT: TriMouthAction = {
  ...CLEAN, name: 'route-no-import', curl: 'GET /api/silent',
  producer: 'src/lib/important.ts',
};

/** v175 §5.5 — route file mentions producer ONLY in a comment. The old
 *  substring scan passed this; the new import-regex must fail it. */
const ROUTE_COMMENT_ONLY: TriMouthAction = {
  ...CLEAN, name: 'route-comment-only', curl: 'GET /api/comment-only',
  producer: 'src/lib/important.ts',
};

// ── Mock fs  — an in-memory map backs `existsFn` + `readFn` ──────────────

const FS_MAP: Record<string, string> = {
  // producers
  'src/lib/test-producer.ts': 'export const x = 1;',
  'src/lib/important.ts':     'export const y = 2;',
  // routes
  'src/pages/api/test.ts':
    `import { x } from '../../lib/test-producer';\nexport const GET = () => null;`,
  'src/pages/api/test-two.ts':
    `import { x } from '../../lib/test-producer';\nexport const POST = () => null;`,
  'src/pages/api/silent.ts':
    `// no producer reference on purpose\nexport const GET = () => null;`,
  // v175 §5.5 regex fixture — route file *comments* the producer but
  // never imports it. Old substring scan passed this vacuously; the new
  // import-regex must fail it.
  'src/pages/api/comment-only.ts':
    `// important is the thing this route would read from, if it did\n`
    + `export const GET = () => null;`,
  // v175 §5.6 cap ledger fixtures. Tests mutate a local FS map, not this
  // file — see the per-test scratch maps below.
  'data/tri-mouth-pending-cap.json': '{ "cap": 99 }',
};

const existsFn = (p: string) => Object.prototype.hasOwnProperty.call(FS_MAP, p);
const readFn   = (p: string) => existsFn(p) ? FS_MAP[p] : null;

// ── Invariant-level tests ────────────────────────────────────────────────

describe('checkProducer — §5.1 producer file exists', () => {
  test('clean row passes', () => {
    assert.equal(checkProducer(CLEAN, existsFn), null);
  });
  test('missing producer emits a finding', () => {
    const r = checkProducer(MISSING_PRODUCER, existsFn);
    assert.ok(r);
    assert.equal(r!.rule, 'producer-missing');
  });
});

describe('checkCurlShape — §5.2 VERB /api/... grammar', () => {
  test('clean row passes', () => {
    assert.equal(checkCurlShape(CLEAN), null);
  });
  test('null curl is tolerated (invariant §5.4 covers it)', () => {
    assert.equal(checkCurlShape({ ...CLEAN, curl: null, pending: 'curl' }), null);
  });
  test('FETCH verb fails', () => {
    const r = checkCurlShape(BAD_CURL);
    assert.ok(r);
    assert.equal(r!.rule, 'curl-shape');
  });
});

describe('checkRouteExists — §5.3 route resolves', () => {
  test('clean row passes', () => {
    assert.equal(checkRouteExists(CLEAN, existsFn), null);
  });
  test('missing route emits route-missing', () => {
    const r = checkRouteExists(MISSING_ROUTE, existsFn);
    assert.ok(r);
    assert.equal(r!.rule, 'route-missing');
  });
  test('ill-formed curl short-circuits (§5.2 covers the shape miss)', () => {
    assert.equal(checkRouteExists(BAD_CURL, existsFn), null);
  });
});

describe('checkSurfaceCompleteness — §5.4 three mouths OR one pending', () => {
  test('clean row passes', () => {
    assert.equal(checkSurfaceCompleteness(CLEAN), null);
  });
  test('pending-keyboard with null keyboard passes', () => {
    assert.equal(checkSurfaceCompleteness(PENDING_OK), null);
  });
  test('null mouth without `pending` fails', () => {
    const r = checkSurfaceCompleteness(INCOMPLETE);
    assert.ok(r);
    assert.equal(r!.rule, 'surface-incomplete');
  });
});

describe('checkRouteImports — §5.5 route imports producer (v175 teeth)', () => {
  test('clean row passes (route imports producer basename)', () => {
    assert.equal(checkRouteImports(CLEAN, readFn), null);
  });
  test('route without producer reference emits route-no-producer', () => {
    const r = checkRouteImports(ROUTE_NO_IMPORT, readFn);
    assert.ok(r);
    assert.equal(r!.rule, 'route-no-producer');
  });
  test('ill-formed curl short-circuits', () => {
    assert.equal(checkRouteImports(BAD_CURL, readFn), null);
  });
  test('v175: comment-only mention fails (substring escape plugged)', () => {
    const r = checkRouteImports(ROUTE_COMMENT_ONLY, readFn);
    assert.ok(r, 'comment-only mention should no longer pass');
    assert.equal(r!.rule, 'route-no-producer');
  });
});

// ── v175 §5.5 — unit coverage for the import-regex helper ────────────────

describe('hasProducerImport — ES import-statement regex (v175 teeth)', () => {
  test('default import from a relative path matches', () => {
    assert.equal(hasProducerImport(
      `import foo from '../../lib/foo';`, 'foo'), true);
  });
  test('named import from an absolute-ish path matches', () => {
    assert.equal(hasProducerImport(
      `import { bar } from 'src/lib/foo';`, 'foo'), true);
  });
  test('from-import with a .ts suffix matches', () => {
    assert.equal(hasProducerImport(
      `import { bar } from '../lib/foo.ts';`, 'foo'), true);
  });
  test('comment mention alone does NOT match', () => {
    assert.equal(hasProducerImport(
      `// the foo module used to live here\n`, 'foo'), false);
  });
  test('substring match in another token does NOT match', () => {
    // "foobar" should not count as importing "foo".
    assert.equal(hasProducerImport(
      `import x from '../lib/foobar';`, 'foo'), false);
  });
});

// ── v175 §5.6 — monotonic cap invariant ──────────────────────────────────

describe('readCap — data/tri-mouth-pending-cap.json parser', () => {
  test('returns the integer when well-formed', () => {
    const scratch = (p: string) => p === CAP_LEDGER_PATH ? '{ "cap": 4 }' : null;
    assert.equal(readCap(scratch), 4);
  });
  test('returns null when the file is missing', () => {
    const scratch = () => null;
    assert.equal(readCap(scratch), null);
  });
  test('returns null on malformed JSON (no throw)', () => {
    const scratch = () => '{ cap broken';
    assert.equal(readCap(scratch), null);
  });
  test('returns null on negative cap', () => {
    const scratch = () => '{ "cap": -1 }';
    assert.equal(readCap(scratch), null);
  });
});

describe('checkMonotonicCap — §5.6 ratchet', () => {
  const ACTIONS_2_PENDING: TriMouthAction[] = [
    CLEAN, { ...CLEAN, name: 'a', status: 'pending-keyboard' },
    { ...CLEAN, name: 'b', status: 'pending-curl' },
  ];
  test('no finding when outstanding ≤ cap', () => {
    const scratch = () => '{ "cap": 2 }';
    assert.equal(checkMonotonicCap(ACTIONS_2_PENDING, scratch), null);
  });
  test('emits cap-exceeded when outstanding > cap', () => {
    const scratch = () => '{ "cap": 1 }';
    const r = checkMonotonicCap(ACTIONS_2_PENDING, scratch);
    assert.ok(r);
    assert.equal(r!.rule, 'cap-exceeded');
  });
  test('emits cap-missing when the ledger is unreadable', () => {
    const scratch = () => null;
    const r = checkMonotonicCap(ACTIONS_2_PENDING, scratch);
    assert.ok(r);
    assert.equal(r!.rule, 'cap-missing');
  });
});

// ── Composition ──────────────────────────────────────────────────────────

describe('scanAction — folds all five invariants', () => {
  test('clean row → zero findings', () => {
    assert.equal(scanAction(CLEAN, existsFn, readFn).length, 0);
  });
  test('pending-keyboard row → zero findings', () => {
    assert.equal(scanAction(PENDING_OK, existsFn, readFn).length, 0);
  });
  test('v174 wired-submit-post fixture → zero findings', () => {
    // Promoted shape: the row owes no debts and carries no `pending`.
    // Scanner must find zero violations; if a future edit drops the
    // keyboard mouth back to `null` without a pending receipt, the
    // §5.4 surface-completeness check fires here.
    assert.equal(scanAction(WIRED_SUBMIT_POST, existsFn, readFn).length, 0);
  });
  test('incomplete row → exactly one finding (surface-incomplete)', () => {
    const fs = scanAction(INCOMPLETE, existsFn, readFn);
    assert.equal(fs.length, 1);
    assert.equal(fs[0].rule, 'surface-incomplete');
  });
  test('bad-curl row → two findings (shape + no-import cascade)', () => {
    // The grammar miss fires and cascades through the route/import checks
    // (both short-circuit to null). We expect exactly one finding.
    const fs = scanAction(BAD_CURL, existsFn, readFn);
    const rules = fs.map((f: Finding) => f.rule);
    assert.ok(rules.includes('curl-shape'));
    assert.equal(fs.length, 1);
  });
});

describe('scanInventory — walks every row', () => {
  test('mixed inventory accumulates findings', () => {
    const all = [CLEAN, PENDING_OK, BAD_CURL, INCOMPLETE];
    const rules = scanInventory(all, existsFn, readFn).map((f) => f.rule);
    assert.ok(rules.includes('curl-shape'));
    assert.ok(rules.includes('surface-incomplete'));
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

describe('routeCandidates — .ts + /index.ts', () => {
  test('plain path yields both candidates', () => {
    assert.deepEqual(routeCandidates('/api/foo'),
      ['src/pages/api/foo.ts', 'src/pages/api/foo/index.ts']);
  });
  test('nested path preserves segments', () => {
    assert.deepEqual(routeCandidates('/api/docs/cite'),
      ['src/pages/api/docs/cite.ts', 'src/pages/api/docs/cite/index.ts']);
  });
});

describe('formatFinding + summaryLine — single-line CI output', () => {
  test('formatFinding shape is `tri-mouth:<action>: <rule>: <detail>`', () => {
    const s = formatFinding(
      { action: 'x', rule: 'producer-missing', detail: 'hole' } as Finding,
    );
    assert.match(s, /^  tri-mouth:x: producer-missing: hole$/);
  });

  test('summaryLine names wired/pending totals + mode tag', () => {
    const line = summaryLine([CLEAN, PENDING_OK], [], 'warn');
    assert.match(line, /^tri-mouth: \d+ wired/);
    assert.match(line, /--warn; no fail/);
  });

  test('summaryLine in error mode prints --error tag', () => {
    const line = summaryLine([CLEAN], [], 'error');
    assert.match(line, /--error/);
  });
});

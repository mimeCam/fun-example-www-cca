// scripts/check-duration-reasons.test.ts
//
// Duration Ledger unit tests. Pure strings in, Violation[] out — no FS,
// no process.exit, no globals. Mirrors check-citation-delegation.test.ts.
//
// Why unit-test a guard?
//   A build-time guard that only runs against real files can rot two
//   ways: pass vacuously (when the rule drifts), or fire on real code
//   with no signal that the GUARD itself is awake. These tests prove
//   the scanners do exactly what the diagnostic says, fixture by
//   fixture. A clean ledger passes; a missing reason fails; an
//   unknown label fails with the label in the match; an alias passes
//   without requiring a reason.
//
// Run: npx tsx --test scripts/check-duration-reasons.test.ts
//
// Credits: Mike (napkin §5.5 two-test-suite plan), check-citation-
// delegation (sibling shape), Sid — 2026-04-22.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGAL_REASONS,
  LEGAL_REASONS_SET,
  computeReducedMotionMask,
  isReducedMotionMediaOpen,
  netBraceDelta,
  parseReasonComment,
  isAliasValue,
  isLiteralDurationDecl,
  parseLiteralDuration,
} from './lib/duration-reasons.ts';

import {
  scanDurationReasons,
  TARGET_FILES,
  type Violation,
} from './check-duration-reasons.ts';

// ── Fixtures (string → lines) ────────────────────────────────────────────

const toLines = (s: string): string[] => s.split('\n');

/** One clean declaration with same-line reason. */
const FIXTURE_CLEAN_SAME_LINE = `
:root {
  --motion-duration-fast: 150ms;  /* reason: micro-feedback */
}
`;

/** Clean — reason on the immediately-preceding block-comment line. */
const FIXTURE_CLEAN_PREV_LINE = `
:root {
  /* reason: ceremony-dwell */
  --notarize-pause-duration: 800ms;
}
`;

/** Alias — no reason required. */
const FIXTURE_ALIAS = `
:root {
  --motion-duration-base: 150ms;  /* reason: ceremony-phase */
  --stage-fading-duration: var(--motion-snap-duration);
}
`;

/** Missing reason → one violation. */
const FIXTURE_MISSING = `
:root {
  --sympathetic-duration: 1000ms;
}
`;

/** Unknown label ('nope') → one violation, rule duration-reason-unknown. */
const FIXTURE_UNKNOWN = `
:root {
  --foo: 400ms;  /* reason: nope */
}
`;

/** Multiple literal-ms tokens — expect exactly 2 violations. */
const FIXTURE_MULTI_MISSING = `
:root {
  --motion-duration-fast: 150ms;  /* reason: micro-feedback */
  --bad-1: 333ms;
  --bad-2: 0.5s;
}
`;

/** Reduced-motion opt-out block — 0ms policy zeros, NOT perceptual choices.
 *  Mike napkin v158 §5.2: the entire block is exempt from the reason rule. */
const FIXTURE_REDUCED_MOTION_BLOCK = `
:root {
  --foo-duration: 200ms;  /* reason: micro-feedback */
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --foo-duration: 0ms;
    --bar-duration: 0ms;
  }
}
`;

/** Clean motion-profile-style fixture — covers the common motion.css shape. */
const FIXTURE_MOTION_CLEAN = `
:root {
  --motion-snap-duration: 120ms;  /* reason: snap */
  --motion-flow-duration: 200ms;  /* reason: micro-feedback */
  --stagger-base: 60ms;           /* reason: micro-feedback */
  --motion-bloom-settle: var(--duration-bloom);
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-snap-duration: 0ms;
    --motion-flow-duration: 0ms;
    --stagger-base: 0ms;
  }
}
`;

/** Motion fixture with a missing reason OUTSIDE the reduced-motion block —
 *  proves exemption is scoped to the block, not file-wide. */
const FIXTURE_MOTION_MISSING = `
:root {
  --motion-duration-grand: 800ms;
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-grand: 0ms;
  }
}
`;

// ── Closed-vocabulary sanity ─────────────────────────────────────────────

describe('LEGAL_REASONS — closed vocabulary', () => {
  test('every label is kebab-case lowercase', () => {
    for (const r of LEGAL_REASONS) {
      assert.match(r, /^[a-z][a-z-]*$/, `bad label shape: ${r}`);
    }
  });
  test('no duplicates', () => {
    assert.equal(new Set(LEGAL_REASONS).size, LEGAL_REASONS.length);
  });
  test('set membership matches array entries', () => {
    for (const r of LEGAL_REASONS) assert.ok(LEGAL_REASONS_SET.has(r));
  });
  test('non-empty — the ledger has at least 5 labels', () => {
    assert.ok(LEGAL_REASONS.length >= 5);
  });
});

// ── Pure helpers ─────────────────────────────────────────────────────────

describe('parseReasonComment — extract legal label from /* reason: X */', () => {
  test('returns the label when legal', () => {
    assert.equal(parseReasonComment('/* reason: doherty */'), 'doherty');
  });
  test('returns null when label is unknown', () => {
    assert.equal(parseReasonComment('/* reason: bogus */'), null);
  });
  test('returns null when there is no reason comment', () => {
    assert.equal(parseReasonComment('--foo: 400ms;'), null);
  });
  test('tolerates extra whitespace inside the comment', () => {
    assert.equal(parseReasonComment('/*   reason:   snap   */'), 'snap');
  });
});

describe('isAliasValue — var(--x) assignments are aliases', () => {
  test('true for `--a: var(--b);`', () => {
    assert.equal(isAliasValue('  --a: var(--b);'), true);
  });
  test('false for `--a: 300ms;`', () => {
    assert.equal(isAliasValue('  --a: 300ms;'), false);
  });
  test('false for mixed expressions containing var()', () => {
    assert.equal(isAliasValue('  --a: calc(var(--b) * 2);'), false);
  });
});

describe('isLiteralDurationDecl / parseLiteralDuration', () => {
  test('matches `--foo: 150ms;`', () => {
    assert.equal(isLiteralDurationDecl('  --foo: 150ms;'), true);
    assert.deepEqual(parseLiteralDuration('  --foo: 150ms;'),
      { prop: '--foo', value: '150ms' });
  });
  test('matches `--foo: 0.4s;`', () => {
    assert.equal(isLiteralDurationDecl('  --foo: 0.4s;'), true);
    assert.deepEqual(parseLiteralDuration('  --foo: 0.4s;'),
      { prop: '--foo', value: '0.4s' });
  });
  test('does NOT match alias `--foo: var(--bar);`', () => {
    assert.equal(isLiteralDurationDecl('  --foo: var(--bar);'), false);
  });
  test('does NOT match non-duration `--foo: 12px;`', () => {
    assert.equal(isLiteralDurationDecl('  --foo: 12px;'), false);
  });
  test('parseLiteralDuration returns null for non-matches', () => {
    assert.equal(parseLiteralDuration('--foo: 12px;'), null);
  });
});

// ── Scanner behavior ─────────────────────────────────────────────────────

describe('scanDurationReasons — fixture coverage', () => {
  test('FIXTURE_CLEAN_SAME_LINE → zero violations', () => {
    assert.deepEqual(scanDurationReasons(toLines(FIXTURE_CLEAN_SAME_LINE), 'x.css'), []);
  });

  test('FIXTURE_CLEAN_PREV_LINE → zero violations', () => {
    assert.deepEqual(scanDurationReasons(toLines(FIXTURE_CLEAN_PREV_LINE), 'x.css'), []);
  });

  test('FIXTURE_ALIAS → zero violations (alias exempt)', () => {
    assert.deepEqual(scanDurationReasons(toLines(FIXTURE_ALIAS), 'x.css'), []);
  });

  test('FIXTURE_MISSING → one violation, rule duration-reason-missing', () => {
    const vs = scanDurationReasons(toLines(FIXTURE_MISSING), 'x.css');
    assert.equal(vs.length, 1);
    assert.equal(vs[0].rule, 'duration-reason-missing');
    assert.match(vs[0].match, /sympathetic-duration/);
  });

  test('FIXTURE_UNKNOWN → one violation, rule duration-reason-unknown, label surfaced', () => {
    const vs = scanDurationReasons(toLines(FIXTURE_UNKNOWN), 'x.css');
    assert.equal(vs.length, 1);
    assert.equal(vs[0].rule, 'duration-reason-unknown');
    assert.match(vs[0].match, /nope/);
  });

  test('FIXTURE_MULTI_MISSING → exactly 2 violations (one per bad line)', () => {
    const vs = scanDurationReasons(toLines(FIXTURE_MULTI_MISSING), 'x.css');
    assert.equal(vs.length, 2);
    for (const v of vs) assert.equal(v.rule, 'duration-reason-missing');
  });

  test('FIXTURE_REDUCED_MOTION_BLOCK → zero violations (0ms is policy)', () => {
    const vs = scanDurationReasons(
      toLines(FIXTURE_REDUCED_MOTION_BLOCK), 'x.css');
    assert.deepEqual(vs, []);
  });

  test('FIXTURE_MOTION_CLEAN → zero violations (motion-profile shape)', () => {
    const vs = scanDurationReasons(toLines(FIXTURE_MOTION_CLEAN), 'x.css');
    assert.deepEqual(vs, []);
  });

  test('FIXTURE_MOTION_MISSING → exactly 1 violation (outside the block)', () => {
    const vs = scanDurationReasons(toLines(FIXTURE_MOTION_MISSING), 'x.css');
    assert.equal(vs.length, 1);
    assert.equal(vs[0].rule, 'duration-reason-missing');
    assert.match(vs[0].match, /motion-duration-grand/);
  });

  test('violation carries file, line, column from the source position', () => {
    const vs = scanDurationReasons(toLines(FIXTURE_MISSING), 'src/styles/x.css');
    assert.equal(vs[0].file, 'src/styles/x.css');
    assert.ok(vs[0].line > 0, `expected positive line, got ${vs[0].line}`);
    assert.ok(vs[0].column > 0, `expected positive column, got ${vs[0].column}`);
  });
});

// ── Reduced-motion context helpers (Mike napkin v158 §5.2) ───────────────

describe('isReducedMotionMediaOpen — opener detection', () => {
  test('matches the canonical shape', () => {
    assert.equal(
      isReducedMotionMediaOpen('@media (prefers-reduced-motion: reduce) {'),
      true,
    );
  });
  test('matches tolerant whitespace + extra conditions', () => {
    assert.equal(
      isReducedMotionMediaOpen(
        '@media   screen   and ( prefers-reduced-motion : reduce ) {'),
      true,
    );
  });
  test('does NOT match without the `{` (same-line brace required)', () => {
    assert.equal(
      isReducedMotionMediaOpen('@media (prefers-reduced-motion: reduce)'),
      false,
    );
  });
  test('does NOT match unrelated @media queries', () => {
    assert.equal(isReducedMotionMediaOpen('@media (min-width: 640px) {'), false);
  });
});

describe('netBraceDelta — per-line brace counter', () => {
  test('returns 1 for a single opener', () => {
    assert.equal(netBraceDelta(':root {'), 1);
  });
  test('returns -1 for a single closer', () => {
    assert.equal(netBraceDelta('}'), -1);
  });
  test('returns 0 for a same-line matched pair', () => {
    assert.equal(netBraceDelta('x { y }'), 0);
  });
  test('returns 0 for a line with no braces', () => {
    assert.equal(netBraceDelta('  --foo: 200ms;'), 0);
  });
});

describe('computeReducedMotionMask — in-block detection', () => {
  test('flags every line from opener through closing brace', () => {
    const lines = [
      ':root { --a: 1; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  :root {',
      '    --a: 0ms;',
      '  }',
      '}',
      ':root { --b: 2; }',
    ];
    const mask = computeReducedMotionMask(lines);
    assert.deepEqual(mask, [false, true, true, true, true, false, false]);
  });
  test('does not flag non-reduced-motion @media blocks', () => {
    const lines = ['@media (min-width: 640px) {', '  .x { color: red; }', '}'];
    assert.deepEqual(computeReducedMotionMask(lines), [false, false, false]);
  });
  test('returns an all-false mask when no block exists', () => {
    const lines = [':root {', '  --a: 200ms;', '}'];
    assert.deepEqual(computeReducedMotionMask(lines), [false, false, false]);
  });
});

// ── Target configuration sanity ──────────────────────────────────────────

describe('TARGET_FILES — guard scope is explicit and non-empty', () => {
  test('at least one target file', () => {
    assert.ok(TARGET_FILES.length >= 1);
  });
  test('tokens.css is the primary target', () => {
    assert.ok(TARGET_FILES.includes('src/styles/tokens.css'));
  });
  test('motion.css joined the ledger (Krystle v157 / Mike v158)', () => {
    assert.ok(TARGET_FILES.includes('src/styles/motion.css'));
  });
  test('verdict-ceremony.css joined the ledger (Krystle/Paul/Mike v159)', () => {
    assert.ok(TARGET_FILES.includes('src/styles/verdict-ceremony.css'));
  });
  test('every entry is a .css file inside src/styles/', () => {
    for (const f of TARGET_FILES) {
      assert.match(f, /^src\/styles\/[a-z0-9-]+\.css$/i, `bad entry: ${f}`);
    }
  });
});

// ── Regression: the live tokens.css passes the guard ─────────────────────
// An integration-flavored spot-check that runs the real file through the
// scanner. This is technically fs-touching, but it's the fastest way to
// keep test + real file in lockstep without spawning a subprocess. If
// tokens.css drifts, this test fails with the same Violation[] the guard
// emits in prebuild — developer-friendly on day one.
// — Sid, mirroring the citation-golden byte-exact-witness pattern.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Shared witness — read a CSS file off disk, run the scanner, assert zero
 *  violations, and on failure report each breach so the developer never has
 *  to re-run the guard to know what to fix. Keeps both regressions DRY.    */
function assertLiveFileClean(rel: string): void {
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) {
    // Environments without the file skip cleanly — the guard itself fires
    // a target-missing violation in that case; no double-report here.
    return;
  }
  const lines = fs.readFileSync(abs, 'utf-8').split('\n');
  const violations: Violation[] = scanDurationReasons(lines, rel);
  assert.equal(
    violations.length, 0,
    `${rel} has ${violations.length} reason violation(s): ` +
    violations.map(v => `${v.line}:${v.column} [${v.rule}] ${v.match}`).join(' | '),
  );
}

describe('regression — live src/styles/tokens.css passes the guard', () => {
  test('zero violations on the current tokens.css', () => {
    assertLiveFileClean('src/styles/tokens.css');
  });
});

describe('regression — live src/styles/motion.css passes the guard', () => {
  test('zero violations on the current motion.css', () => {
    assertLiveFileClean('src/styles/motion.css');
  });
});

describe('regression — live src/styles/verdict-ceremony.css passes the guard', () => {
  test('zero violations on the current verdict-ceremony.css', () => {
    assertLiveFileClean('src/styles/verdict-ceremony.css');
  });
});

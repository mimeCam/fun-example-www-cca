// scripts/check-citation-delegation.test.ts
//
// v155 "Citation Golden" — unit tests for the pure scanners used by
// `scripts/check-citation-delegation.ts`. Pure string in, boolean out —
// no FS, no process.exit, no globals.
//
// Why unit-test a guard?
//   Guards that only run at prebuild against real files can silently
//   rot (pass vacuously, or fail on a real typo with no signal that
//   the guard itself is healthy). A five-fixture unit test proves the
//   scanners do what the diagnostic says they do — clean code passes,
//   re-implementation fails, missing-import fails. The CI log then
//   reads: the rule is enforced AND the tester is awake.
//
// Run:  npx tsx --test scripts/check-citation-delegation.test.ts
//
// Credits: Mike (v155 napkin §3 table row 5 — test the guard on three
//          fixtures), Elon (v155 §3 static-proof is only as good as the
//          script asserting it), check-ds-kbd (sibling pattern), Sid —
//          2026-04-22. Motto: "code maintenance without tests."

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  scanImports,
  scanReimplementation,
  stripLineComment,
  codeOnly,
  TARGETS,
  REIMPL_MARKERS,
} from './check-citation-delegation.js';

// ── Fixtures — three strings, each a minimal surface of the real files ────

/** Clean: imports cellCitationPayload from stage-axes, no re-impl. */
const FIXTURE_CLEAN = `
import { cellCitationPayload } from '../stage-axes';
import type { Axis } from '../stage-axes';

function handle(axis, stage, origin, ref) {
  return cellCitationPayload(axis, stage, origin, ref);
}
`;

/** Re-implementation: the forbidden template literal is inlined. */
const FIXTURE_REIMPL = `
import { cellAnchorId } from '../stage-axes';

function handle(axis, stage, origin) {
  // Forbidden shape: the payload template is spelled out here.
  return \`\${axis} × \${stage} · \${origin}/api/docs#axis-\${axis}-stage-\${stage}\`;
}
`;

/** Missing import: file claims delegation but never imports the oracle. */
const FIXTURE_MISSING = `
import { foo } from './elsewhere';

function handle() {
  return foo();
}
`;

/** Markers in comments only — must NOT trigger re-impl (comments stripped). */
const FIXTURE_MARKERS_IN_COMMENT = `
import { cellCitationPayload } from '../stage-axes';

// Documents the payload shape: label × stage · origin/api/docs#axis-X-stage-Y
function handle(a, s, o) { return cellCitationPayload(a, s, o); }
`;

/** Aliased import — stage-axes import uses `as` rename; must still count. */
const FIXTURE_ALIASED = `
import { cellCitationPayload as payload } from '../stage-axes';
const s = payload('typography', 'fresh', 'https://a.test');
`;

// ── stripLineComment ──────────────────────────────────────────────────────

describe('stripLineComment — drops // to EOL', () => {
  test('removes trailing single-line comment', () => {
    assert.equal(stripLineComment('const x = 1; // hello'), 'const x = 1; ');
  });
  test('leaves comment-free line untouched', () => {
    assert.equal(stripLineComment('const x = 1;'), 'const x = 1;');
  });
  test('handles an all-comment line', () => {
    assert.equal(stripLineComment('// just a comment'), '');
  });
});

// ── codeOnly — comment-stripped join ──────────────────────────────────────

describe('codeOnly — strips line comments from every line', () => {
  test('empties a file of pure comments', () => {
    assert.equal(codeOnly('// a\n// b\n// c').trim(), '');
  });
  test('preserves non-comment code verbatim', () => {
    assert.equal(codeOnly('const x = 1;\nconst y = 2;'), 'const x = 1;\nconst y = 2;');
  });
});

// ── scanImports ───────────────────────────────────────────────────────────

describe('scanImports — true iff any required symbol is imported from stage-axes', () => {
  test('FIXTURE_CLEAN imports cellCitationPayload → true', () => {
    assert.equal(scanImports(FIXTURE_CLEAN, ['cellCitationPayload']), true);
  });

  test('FIXTURE_MISSING does NOT import cellCitationPayload → false', () => {
    assert.equal(scanImports(FIXTURE_MISSING, ['cellCitationPayload']), false);
  });

  test('any-of-set semantics: second symbol satisfies when first is absent', () => {
    const code = `import { cellAnchorId } from '../stage-axes';`;
    assert.equal(scanImports(code, ['cellCitationPayload', 'cellAnchorId']), true);
  });

  test('aliased `as` rename counts as imported', () => {
    assert.equal(scanImports(FIXTURE_ALIASED, ['cellCitationPayload']), true);
  });

  test('different module path does not satisfy', () => {
    const code = `import { cellCitationPayload } from './elsewhere';`;
    assert.equal(scanImports(code, ['cellCitationPayload']), false);
  });

  test('multiple import statements from stage-axes union-merge', () => {
    const code = `
      import { cellAnchorId } from '../stage-axes';
      import { cellCitationLabel } from '../stage-axes';
    `;
    assert.equal(scanImports(code, ['cellCitationLabel', 'cellAnchorId']), true);
  });
});

// ── scanReimplementation ──────────────────────────────────────────────────

describe('scanReimplementation — true iff ALL three markers present', () => {
  test('FIXTURE_CLEAN → false (no re-impl)', () => {
    assert.equal(scanReimplementation(codeOnly(FIXTURE_CLEAN)), false);
  });

  test('FIXTURE_REIMPL → true (template spelled out)', () => {
    assert.equal(scanReimplementation(codeOnly(FIXTURE_REIMPL)), true);
  });

  test('FIXTURE_MISSING → false', () => {
    assert.equal(scanReimplementation(codeOnly(FIXTURE_MISSING)), false);
  });

  test('markers only in comments → false (codeOnly strips them)', () => {
    assert.equal(scanReimplementation(codeOnly(FIXTURE_MARKERS_IN_COMMENT)), false);
  });

  test('two of three markers → false (needs all three)', () => {
    // "× " and " · " but no "#axis-"
    const code = 'const s = `a × b · c/d`;';
    assert.equal(scanReimplementation(code), false);
  });

  test('marker list is exactly [`× `, ` · `, `#axis-`] — the v155 contract', () => {
    assert.deepEqual([...REIMPL_MARKERS], ['× ', ' · ', '#axis-']);
  });
});

// ── Target configuration sanity ───────────────────────────────────────────

describe('TARGETS — three files, each with at least one required symbol', () => {
  test('exactly three targets (click+keystroke, keynav, server render)', () => {
    assert.equal(TARGETS.length, 3);
  });

  test('every target declares at least one required oracle symbol', () => {
    for (const t of TARGETS) {
      assert.ok(t.requiredSymbols.length > 0, `${t.rel} has no requiredSymbols`);
    }
  });

  test('every target names a non-empty mouth label', () => {
    for (const t of TARGETS) {
      assert.ok(t.mouth.length > 0, `${t.rel} has no mouth label`);
    }
  });

  test('target paths are unique', () => {
    const rels = TARGETS.map((t) => t.rel);
    assert.equal(new Set(rels).size, rels.length);
  });
});

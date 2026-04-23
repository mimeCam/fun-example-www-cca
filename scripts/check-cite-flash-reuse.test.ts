// scripts/check-cite-flash-reuse.test.ts
// v180 "Retire the last receipt keyframe" — unit tests for the pure
// scanners in check-cite-flash-reuse.ts, plus a live-repo assertion
// that src/styles/**/*.css has zero `@keyframes receipt-*` after the
// wedge (Mike napkin §9 success-criteria row 1, Tanya §9 DoD).
//
// Why a guard-for-the-guard: synthetic fixtures keep the regexes
// awake. A live-repo assertion turns "the drift vector is 0 today"
// into a signed fact the next wedge inherits.
//
// Run:  npx tsx --test scripts/check-cite-flash-reuse.test.ts
//
// Credits: Mike Koch (napkin v180 §5 "add a count-asserting unit
//          test"), Tanya Donska (§9 DoD row — zero receipt-* in
//          src/styles), Sid (10-line rule, 2026-04-23).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

import {
  hasCiteKeyframe,
  hasReceiptKeyframe,
  hasRawMsNearFlash,
} from './check-cite-flash-reuse.ts';

// ── Pure-scanner coverage ────────────────────────────────────────────────

describe('hasCiteKeyframe — @keyframes cite-flash(-lit)? detector', () => {
  test('matches the bare producer name', () => {
    assert.equal(hasCiteKeyframe('@keyframes cite-flash { }'), true);
  });
  test('matches the -lit variant', () => {
    assert.equal(hasCiteKeyframe('@keyframes cite-flash-lit { }'), true);
  });
  test('ignores unrelated keyframes', () => {
    assert.equal(hasCiteKeyframe('@keyframes badge-enter { }'), false);
  });
  test('ignores a class name that happens to share the token', () => {
    assert.equal(hasCiteKeyframe('.cite-flash { color: red; }'), false);
  });
});

describe('hasReceiptKeyframe — @keyframes receipt-* detector', () => {
  test('matches the legacy receipt-unfurl shape', () => {
    assert.equal(hasReceiptKeyframe('@keyframes receipt-unfurl { }'), true);
  });
  test('matches any receipt- suffix', () => {
    assert.equal(hasReceiptKeyframe('@keyframes receipt-bloom { }'), true);
  });
  test('tolerates the retired wedge\'s replacement (acknowledge-enter)', () => {
    assert.equal(hasReceiptKeyframe('@keyframes acknowledge-enter { }'), false);
  });
  test('tolerates sibling keyframes with "receipt" inside a longer prefix', () => {
    // seal-ceremony.css defines seal-receipt-bloom + sc-receipt-bloom —
    // those are *sibling prefixes*, not receipt-* drift. Regex requires
    // the keyframe to START with `receipt-`, which these do not.
    assert.equal(hasReceiptKeyframe('@keyframes seal-receipt-bloom { }'), false);
    assert.equal(hasReceiptKeyframe('@keyframes sc-receipt-bloom { }'),   false);
    assert.equal(hasReceiptKeyframe('@keyframes arrival-receipt-pulse-kf { }'), false);
  });
  test('ignores a comment that narrates the retired keyframe', () => {
    // This is exactly what seal-receipt.css now carries after v180 —
    // "retired the local `receipt-unfurl` holdout". No @keyframes token,
    // so no false positive.
    assert.equal(hasReceiptKeyframe('/* retired receipt-unfurl holdout */'), false);
  });
});

describe('hasRawMsNearFlash — raw-ms near a cite-flash reference', () => {
  test('matches a raw-ms literal on the same statement as cite-flash', () => {
    // The regex forbids `;` between the class token and the ms literal,
    // so the fixture mirrors a CSS-style hand-rolled dupe, not a JS call.
    assert.equal(hasRawMsNearFlash('animation: cite-flash 200ms ease-out'), true);
  });
  test('tolerates a clean import + token usage', () => {
    const code = 'import { CITE_FLASH_DURATION_MS } from "./cite-flash";\nuse(CITE_FLASH_DURATION_MS);';
    assert.equal(hasRawMsNearFlash(code), false);
  });
  test('a `;` between cite-flash and the literal breaks the association', () => {
    // The regex's [^;\n] class is deliberate — two separate statements
    // are not drift. Keeps false-positive rate near zero in legacy code.
    assert.equal(hasRawMsNearFlash('el.classList.add("cite-flash"); setTimeout(fn, 200);'), false);
  });
  test('does NOT flag a 200ms literal on an unrelated line', () => {
    assert.equal(hasRawMsNearFlash('const x = "200ms"; // unrelated axis label'), false);
  });
});

// ── Live-repo assertion (Mike §9 row 1, Tanya §9 DoD) ────────────────────

/** Recursively walks a directory. ≤10-line helper so Sid's rule holds. */
function walkCss(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st  = fs.statSync(abs);
    if (st.isDirectory())        walkCss(abs, out);
    else if (abs.endsWith('.css')) out.push(abs);
  }
}

describe('src/styles/**/*.css — zero @keyframes receipt-* (v180 ratchet)', () => {
  test('no .css file under src/styles defines a receipt-prefixed keyframe', () => {
    const files: string[] = [];
    walkCss(path.resolve(process.cwd(), 'src/styles'), files);
    const offenders = files
      .map((f) => ({ file: f, code: fs.readFileSync(f, 'utf-8') }))
      .filter(({ code }) => hasReceiptKeyframe(code))
      .map(({ file }) => path.relative(process.cwd(), file));
    assert.deepEqual(offenders, [],
      `Expected zero @keyframes receipt-* under src/styles; found: ${offenders.join(', ')}`);
  });

  test('motion.css provides the shared acknowledge-enter replacement', () => {
    const motion = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/motion.css'), 'utf-8');
    assert.match(motion, /@keyframes\s+acknowledge-enter\b/,
      'motion.css must export the shared acknowledge-enter keyframe');
  });

  test('seal-receipt.css consumes the shared keyframe (no local holdout)', () => {
    const seal = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/seal-receipt.css'), 'utf-8');
    assert.match(seal, /animation:\s*acknowledge-enter\b/,
      '.seal-receipt must animate via the shared acknowledge-enter token');
    assert.equal(hasReceiptKeyframe(seal), false,
      'seal-receipt.css must not redefine a receipt-* keyframe locally');
  });
});

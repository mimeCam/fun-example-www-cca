// src/lib/tri-mouth-inventory.test.ts
// v173 "Tri-Mouth Inventory" — golden test for the frozen literal.
//
// Run:  npx tsx --test src/lib/tri-mouth-inventory.test.ts
//
// This test is the second of the three consumers (guard, test, future UI
// legend) Mike's napkin §1 names. It proves the LITERAL itself is healthy:
//   · every row's `producer` file exists on disk,
//   · every row's `curl` is grammatically well-formed (`VERB /api/...`),
//   · the `pending` field, when set, truly names a `null` mouth,
//   · `findAction` / `parseCurl` / `pendingSummary` / `readyToPromote`
//     behave on a minimal set of hand-picked cases.
//
// Why a golden test next to the literal: the file-existence check runs
// once at prebuild through the guard, but this test fires on every
// `test:tri-mouth` run — developer-facing sanity that an ill-formed row
// surfaces in seconds.
//
// Credits: Mike (napkin §2 table row 2 — "shape-assertions via
//          node --test"), Tanya (§4.3 scope), Sid (10-line rule
//          — every test body is its own contract), citation-golden.ts
//          prior art. 2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  TRI_MOUTH_ACTIONS,
  TRI_MOUTH_VERBS,
  TRI_MOUTH_STATUSES,
  findAction,
  pendingActions,
  wiredActions,
  pendingSummary,
  parseCurl,
  readyToPromote,
  PROMOTE_THRESHOLD_TOTAL,
  PROMOTE_THRESHOLD_WIRED,
} from './tri-mouth-inventory.ts';

// ── Shape assertions ──────────────────────────────────────────────────────

describe('TRI_MOUTH_ACTIONS — frozen shape', () => {
  test('has at least 5 rows (Mike §9 acceptance criterion)', () => {
    assert.ok(
      TRI_MOUTH_ACTIONS.length >= PROMOTE_THRESHOLD_TOTAL,
      `expected ≥${PROMOTE_THRESHOLD_TOTAL} rows, got ${TRI_MOUTH_ACTIONS.length}`,
    );
  });

  test('action names are unique', () => {
    const names = TRI_MOUTH_ACTIONS.map((a) => a.name);
    assert.equal(new Set(names).size, names.length, 'duplicate action name');
  });

  test('every status is drawn from the closed vocabulary', () => {
    const allowed = new Set<string>(TRI_MOUTH_STATUSES);
    for (const a of TRI_MOUTH_ACTIONS) {
      assert.ok(allowed.has(a.status), `${a.name}: status "${a.status}" off-list`);
    }
  });

  test('every `pending` row has the matching mouth set to null', () => {
    for (const a of TRI_MOUTH_ACTIONS) {
      if (a.pending === undefined) continue;
      assert.equal(a[a.pending], null,
        `${a.name}: pending="${a.pending}" but mouth is "${a[a.pending]}"`);
    }
  });
});

// ── Producer files exist ──────────────────────────────────────────────────

describe('producer files resolve on disk', () => {
  for (const a of TRI_MOUTH_ACTIONS) {
    test(`${a.name} → ${a.producer} exists`, () => {
      const abs = path.resolve(process.cwd(), a.producer);
      assert.ok(fs.existsSync(abs), `missing producer file: ${a.producer}`);
    });
  }
});

// ── Curl grammar ──────────────────────────────────────────────────────────

describe('curl strings parse cleanly', () => {
  for (const a of TRI_MOUTH_ACTIONS) {
    if (a.curl === null) continue;
    test(`${a.name} curl="${a.curl}" → {verb, path}`, () => {
      const parsed = parseCurl(a.curl);
      assert.ok(parsed, `${a.name}: curl did not parse`);
      assert.ok(
        (TRI_MOUTH_VERBS as readonly string[]).includes(parsed!.verb),
        `${a.name}: verb "${parsed!.verb}" off-list`,
      );
      assert.ok(parsed!.path.startsWith('/api/'),
        `${a.name}: path "${parsed!.path}" does not begin with /api/`);
    });
  }

  test('parseCurl — null in, null out', () => {
    assert.equal(parseCurl(null), null);
  });

  test('parseCurl — bogus shape returns null (no throw)', () => {
    assert.equal(parseCurl('not a curl'), null);
    assert.equal(parseCurl('GET /no-api/prefix'), null);
    assert.equal(parseCurl('FETCH /api/docs/cite'), null);
  });

  test('parseCurl — strips query and fragment from path', () => {
    const a = parseCurl('GET /api/docs/cite?axis=typography#frag');
    assert.deepEqual(a, { verb: 'GET', path: '/api/docs/cite' });
  });
});

// ── Pure lookups ──────────────────────────────────────────────────────────

describe('findAction / wiredActions / pendingActions / pendingSummary', () => {
  test('findAction returns the row on a hit', () => {
    const a = findAction('cite-cell');
    assert.ok(a, 'cite-cell not found');
    assert.equal(a!.status, 'wired');
  });

  test('findAction returns undefined on a miss (no throw)', () => {
    assert.equal(findAction('nonexistent'), undefined);
  });

  test('wiredActions ⊆ TRI_MOUTH_ACTIONS and every status.startsWith("wired")', () => {
    for (const a of wiredActions()) {
      assert.ok(a.status.startsWith('wired'), `${a.name}: status ${a.status}`);
    }
  });

  test('pendingActions is exactly the rows with a pending field', () => {
    const byField = TRI_MOUTH_ACTIONS.filter((a) => a.pending !== undefined);
    assert.deepEqual(pendingActions(), byField);
  });

  test('pendingSummary counts line up with the inventory', () => {
    const s = pendingSummary();
    assert.equal(s.keyboard + s.curl + s.pointer, pendingActions().length);
  });
});

// ── Promotion gate ────────────────────────────────────────────────────────

describe('readyToPromote — the --error flip criterion', () => {
  test('boolean reflects wired-count + total-count thresholds', () => {
    const actual = TRI_MOUTH_ACTIONS.length >= PROMOTE_THRESHOLD_TOTAL
                && wiredActions().length     >= PROMOTE_THRESHOLD_WIRED;
    assert.equal(readyToPromote(), actual);
  });
});

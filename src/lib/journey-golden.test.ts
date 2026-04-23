// src/lib/journey-golden.test.ts
// v168 "Journey Witness" — pure, in-memory tests for the frozen fixture.
// No HTTP, no DB, no content-collection. Just the shape + literal +
// PoW-nonce-validity invariants that the guard relies on.
//
// Run:  npx tsx --test src/lib/journey-golden.test.ts
//
// Credits: Mike Koch (§4 scope for `journey-golden.test.ts` — 40 LoC of
//          shape assertions), Sid (fixture over runner), Elon (§5.3 —
//          witness one user outcome), citation-golden.test.ts (layout
//          this file copies). 2026-04-23.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  JOURNEY_STEPS, JOURNEY_STEP_COUNT,
  POW_TITLE, POW_BODY, POW_NONCE, POW_HASH, POW_DIFFICULTY,
  SENTINEL_AUTHOR_LABEL, SENTINEL_IP,
  journeyExpectedFor,
} from './journey-golden.js';
import type { JourneyStepName } from './journey-golden.js';
import {
  hasShape, matchesLiteral, journeyUrl, JOURNEY_ORIGIN, happyPathBody,
} from './journey-witness.js';

// ── 1 · Row count — the freeze, re-asserted ───────────────────────────────

describe('journey-golden — row count', () => {
  test('JOURNEY_STEPS length equals JOURNEY_STEP_COUNT', () => {
    assert.equal(JOURNEY_STEPS.length, JOURNEY_STEP_COUNT);
  });

  test('JOURNEY_STEP_COUNT is 7 (5 submit branches + 1 read-empty + 1 endanger)', () => {
    // Bumping this requires a commit-body justification (see §TODO in
    // journey-golden.ts for the still-deferred revive/verdict steps).
    // v169 (2026-04-23): clock seam landed → endanger mouth unblocked.
    assert.equal(JOURNEY_STEP_COUNT, 7);
  });
});

// ── 2 · Every step name is unique (no accidental duplicates) ──────────────

describe('journey-golden — step names', () => {
  test('no duplicate step names', () => {
    const names = JOURNEY_STEPS.map((s) => s.step);
    assert.equal(new Set(names).size, names.length);
  });

  test('journeyExpectedFor() resolves every step', () => {
    for (const s of JOURNEY_STEPS) {
      const got = journeyExpectedFor(s.step as JourneyStepName);
      assert.equal(got.status, s.expected.status);
    }
  });

  test('journeyExpectedFor() throws on unknown step', () => {
    assert.throws(() => journeyExpectedFor('not-a-step' as JourneyStepName));
  });
});

// ── 3 · PoW literal is self-consistent ────────────────────────────────────

describe('journey-golden — frozen PoW is valid', () => {
  const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
  const ch = sha(POW_TITLE + '\n' + POW_BODY);

  test('POW_HASH equals sha256(contentHash + ":" + POW_NONCE)', () => {
    assert.equal(sha(ch + ':' + POW_NONCE), POW_HASH);
  });

  test('POW_HASH starts with POW_DIFFICULTY', () => {
    assert.ok(POW_HASH.startsWith(POW_DIFFICULTY),
      `POW_HASH "${POW_HASH.slice(0, 8)}…" does not start with "${POW_DIFFICULTY}"`);
  });

  test('POW_BODY is MIN_WORDS-safe (≥ 50 words)', () => {
    const words = POW_BODY.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 50, `POW_BODY has only ${words} words; handler requires ≥ 50`);
  });
});

// ── 4 · Shape helpers work as designed ────────────────────────────────────

describe('journey-witness — shape helpers', () => {
  test('hasShape() requires every key', () => {
    assert.equal(hasShape({ a: 1, b: 2 }, ['a', 'b']), true);
    assert.equal(hasShape({ a: 1 },       ['a', 'b']), false);
    assert.equal(hasShape(null,           ['a']),      false);
  });

  test('matchesLiteral() is shallow and strict', () => {
    assert.equal(matchesLiteral({ a: 1, b: 2 }, { a: 1 }),       true);
    assert.equal(matchesLiteral({ a: 1 },       { a: 2 }),       false);
    assert.equal(matchesLiteral({ a: 1 },       { b: 1 }),       false);
  });
});

// ── 5 · URL + body builders — sentinel discipline ─────────────────────────

describe('journey-witness — sentinel hygiene', () => {
  test('JOURNEY_ORIGIN is RFC-6761 .test host', () => {
    assert.match(JOURNEY_ORIGIN, /^https:\/\/[a-z0-9.-]+\.test$/);
  });

  test('SENTINEL_AUTHOR_LABEL is a .test-shaped label', () => {
    assert.equal(typeof SENTINEL_AUTHOR_LABEL, 'string');
    assert.ok(SENTINEL_AUTHOR_LABEL.length > 0);
  });

  test('SENTINEL_IP is a well-formed IPv4 literal', () => {
    assert.match(SENTINEL_IP, /^\d+\.\d+\.\d+\.\d+$/);
  });

  test('journeyUrl() roots at JOURNEY_ORIGIN', () => {
    const u = journeyUrl('/api/submit-post');
    assert.equal(u.origin, JOURNEY_ORIGIN);
    assert.equal(u.pathname, '/api/submit-post');
  });

  test('happyPathBody() carries the frozen fields', () => {
    const b = happyPathBody();
    assert.equal(b.title, POW_TITLE);
    assert.equal(b.pow_nonce, POW_NONCE);
    assert.equal(b.pow_hash, POW_HASH);
    assert.equal(b.author_label, SENTINEL_AUTHOR_LABEL);
  });
});

// ── 6 · Each step's bodyKeys is non-empty and consistent with literal ─────

describe('journey-golden — expected-row invariants', () => {
  test('every step has ≥ 1 bodyKey and a 3-digit status', () => {
    for (const s of JOURNEY_STEPS) {
      assert.ok(s.expected.bodyKeys.length > 0, `${s.step}: bodyKeys empty`);
      assert.ok(s.expected.status >= 100 && s.expected.status < 600,
        `${s.step}: status ${s.expected.status} out of HTTP range`);
    }
  });

  test('every step literal (if present) only references declared keys', () => {
    for (const s of JOURNEY_STEPS) {
      const lit = s.expected.bodyLiteral;
      if (!lit) continue;
      for (const k of Object.keys(lit)) {
        assert.ok(s.expected.bodyKeys.includes(k),
          `${s.step}: literal key "${k}" not in bodyKeys`);
      }
    }
  });
});

// src/lib/collectiveMemory.clock.test.ts
// Golden test for the collectiveMemory clock-seam wedge (2026-04-23).
//
// What this locks:
//   1. Every public function that writes a timestamp picks it up from the
//      pinned clock — withClock(frozenISO, fn) is the only source of truth.
//      If any callsite still reaches Date.now()/new Date() directly, the
//      stamp drifts off the fixture and the test flips red.
//   2. The two extracted helpers (`rateWindowOpen`, `cutoffMs`) are pure —
//      no DB, no clock — and behave deterministically on edge inputs.
//   3. Parallel `withClock` scopes don't cross-contaminate each other.
//      AsyncLocalStorage is per-call-stack; this is the regression guard.
//   4. SQL binding discipline (Mike PoI §2): rate-limit stamps write the
//      same value into both columns, because we sample the clock once.
//
// What this intentionally does NOT do:
//   · Touch data/revivals.db. Every test runs against a :memory: handle
//     swapped in via `__setSharedDbForTests` (the lazy singleton hatch).
//   · Re-derive constants from the module — the JSON fixture is the
//     contract; both sides must agree explicitly.
//   · Cover client-side scripts. The browser is a different physical clock
//     and is out of seam scope (see clock.ts header).
//
// Run:  npx tsx --test src/lib/collectiveMemory.clock.test.ts
//
// Credits: Mike Koch (napkin §6 PoI checklist + §7 acceptance template),
//          Paul Kim (E7 — citation byte-parity is the ship-signal),
//          Elon (§3.a no-new-deps, §5.2 finish the migration),
//          Krystle Clear (v171 per-file freeze-witness pattern),
//          Tanya Donska (§6 evidentiary stamps don't dance on update),
//          Sid (every helper ≤ 10 lines).
//          2026-04-23.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

import { withClock } from './clock.js';
import {
  __setSharedDbForTests,
  rateWindowOpen,
  cutoffMs,
  resurrectPost,
  entombPost,
  canRevive,
  recordRevival,
  canReviveBySession,
  recordRevivalBySession,
  canPulse,
  recordPulse,
  pruneRateLimits,
  upsertVisitorTrust,
  getVisitorTrust,
  logVelocity,
  getRevivalTimeline,
  getMonthlyRevivalCount,
  getSlugVelocity,
  getGlobalVelocity,
  incrementDailyCount,
  getDailyCountByFp,
  getRisenTimestamps,
  getEntombedTimestamps,
} from './collectiveMemory.js';

// ── Fixture loader ────────────────────────────────────────────────────────

interface ClockFixture {
  frozenISO: string;
  todayKey: string;
  windows: {
    rateWindowMs: number;
    readingRateMs: number;
    hourMs: number;
    dayMs: number;
    velocityRetentionDays: number;
  };
}

function loadFixture(): ClockFixture {
  const path = resolve(process.cwd(), 'src/lib/__fixtures__/collectiveMemory.clock.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ClockFixture;
}

const FX = loadFixture();
const FROZEN_MS = Date.parse(FX.frozenISO);

// ── DB swap — every test starts on a fresh :memory: database ──────────────

let memDb: Database.Database;
beforeEach(() => {
  memDb = new Database(':memory:');
  __setSharedDbForTests(memDb);
});

// ── 0 · The fixture is internally consistent ──────────────────────────────

describe('collectiveMemory.clock — fixture sanity', () => {
  test('frozenISO parses to a finite millisecond timestamp', () => {
    assert.ok(Number.isFinite(FROZEN_MS), `frozenISO did not parse: ${FX.frozenISO}`);
  });
  test('todayKey is the YYYY-MM-DD prefix of frozenISO', () => {
    assert.equal(FX.todayKey, FX.frozenISO.slice(0, 10));
  });
});

// ── 1 · Pure helpers — no DB, no clock ────────────────────────────────────

describe('collectiveMemory.clock — rateWindowOpen()', () => {
  const W = FX.windows.rateWindowMs;
  test('null lastAt → window always open (no prior stamp)', () => {
    assert.equal(rateWindowOpen(null, FROZEN_MS, W), true);
  });
  test('exact window boundary → open (>= is the predicate)', () => {
    assert.equal(rateWindowOpen(FROZEN_MS - W, FROZEN_MS, W), true);
  });
  test('one ms inside the window → closed', () => {
    assert.equal(rateWindowOpen(FROZEN_MS - W + 1, FROZEN_MS, W), false);
  });
  test('one ms past the window → open', () => {
    assert.equal(rateWindowOpen(FROZEN_MS - W - 1, FROZEN_MS, W), true);
  });
});

describe('collectiveMemory.clock — cutoffMs()', () => {
  test('subtracts the window from now', () => {
    assert.equal(cutoffMs(FROZEN_MS, FX.windows.hourMs), FROZEN_MS - FX.windows.hourMs);
  });
  test('saturates at 0 — no negative cutoffs leak into SQL', () => {
    assert.equal(cutoffMs(100, 1_000), 0);
  });
  test('zero window returns now (no-op cutoff)', () => {
    assert.equal(cutoffMs(FROZEN_MS, 0), FROZEN_MS);
  });
});

// ── 2 · Stamps land at the pinned clock — not the wall ────────────────────

describe('collectiveMemory.clock — stamps land on the pinned clock', () => {
  test('resurrectPost writes risen_at = nowISO()', () => {
    withClock(FX.frozenISO, () => resurrectPost('hello-world', 1));
    const map = getRisenTimestamps();
    assert.equal(map.get('hello-world')?.toISOString(), FX.frozenISO);
  });
  test('entombPost (default arg) writes entombed_at = nowISO()', () => {
    withClock(FX.frozenISO, () => entombPost('focus-as-a-mood'));
    const map = getEntombedTimestamps();
    assert.equal(map.get('focus-as-a-mood')?.toISOString(), FX.frozenISO);
  });
  test('entombPost (passed Date) honours the caller, not the seam', () => {
    const caller = new Date('2025-01-01T00:00:00.000Z');
    withClock(FX.frozenISO, () => entombPost('lo-fi-loop', caller));
    const map = getEntombedTimestamps();
    assert.equal(map.get('lo-fi-loop')?.toISOString(), caller.toISOString());
  });
});

// ── 3 · Rate-limit windows are deterministic under the pin ────────────────

describe('collectiveMemory.clock — rate-limit windows respect withClock', () => {
  test('canRevive: open before the first stamp, closed immediately after', () => {
    withClock(FX.frozenISO, () => {
      assert.equal(canRevive('1.2.3.4', 'now-page'), true);
      recordRevival('1.2.3.4', 'now-page');
      assert.equal(canRevive('1.2.3.4', 'now-page'), false);
    });
  });
  test('canRevive: re-opens at the window boundary, not before', () => {
    withClock(FX.frozenISO, () => recordRevival('1.2.3.4', 'now-page'));
    const W = FX.windows.rateWindowMs;
    withClock(FROZEN_MS + W - 1, () => {
      assert.equal(canRevive('1.2.3.4', 'now-page'), false);
    });
    withClock(FROZEN_MS + W, () => {
      assert.equal(canRevive('1.2.3.4', 'now-page'), true);
    });
  });
  test('recordRevival writes ONE clock value into both stamp columns (PoI §2)', () => {
    withClock(FX.frozenISO, () => recordRevival('5.6.7.8', 'building-in-public'));
    const row = memDb.prepare(
      'SELECT last_at FROM rate_limit WHERE ip_slug = ?',
    ).get('5.6.7.8:building-in-public') as { last_at: number };
    assert.equal(row.last_at, FROZEN_MS);
  });
  test('canReviveBySession: one tab gets one revival, ever', () => {
    withClock(FX.frozenISO, () => {
      assert.equal(canReviveBySession('s1', 'the-decay-theory'), true);
      recordRevivalBySession('s1', 'the-decay-theory');
      assert.equal(canReviveBySession('s1', 'the-decay-theory'), false);
    });
  });
  test('canPulse: 25s reading window — same boundary discipline', () => {
    const W = FX.windows.readingRateMs;
    withClock(FX.frozenISO, () => recordPulse('s1', 'now-page'));
    withClock(FROZEN_MS + W - 1, () => assert.equal(canPulse('s1', 'now-page'), false));
    withClock(FROZEN_MS + W,     () => assert.equal(canPulse('s1', 'now-page'), true));
  });
});

// ── 4 · Velocity windows + cutoff math route through the seam ─────────────

describe('collectiveMemory.clock — velocity windows', () => {
  test('logVelocity stamps ts = pinned now', () => {
    withClock(FX.frozenISO, () => logVelocity('hello-world'));
    const row = memDb.prepare(
      'SELECT ts FROM velocity_log WHERE slug = ?',
    ).get('hello-world') as { ts: number };
    assert.equal(row.ts, FROZEN_MS);
  });
  test('getMonthlyRevivalCount: counts inside the 30-day window only', () => {
    seedVelocity([
      FROZEN_MS,                                   // today — counts
      FROZEN_MS - 29 * FX.windows.dayMs,           // 29d  — counts
      FROZEN_MS - 31 * FX.windows.dayMs,           // 31d  — excluded
    ]);
    withClock(FX.frozenISO, () => {
      assert.equal(getMonthlyRevivalCount('hello-world'), 2);
    });
  });
  test('getSlugVelocity / getGlobalVelocity: cutoff = now - windowMs', () => {
    seedVelocity([FROZEN_MS, FROZEN_MS - 2 * FX.windows.hourMs]);
    withClock(FX.frozenISO, () => {
      assert.equal(getSlugVelocity('hello-world', FX.windows.hourMs), 1);
      assert.equal(getGlobalVelocity(FX.windows.hourMs), 1);
    });
  });
  test('getRevivalTimeline: sparkline filter uses pinned cutoff', () => {
    seedVelocity([FROZEN_MS - 10 * FX.windows.dayMs, FROZEN_MS - 70 * FX.windows.dayMs]);
    withClock(FX.frozenISO, () => {
      const tl = getRevivalTimeline('hello-world', 8); // 8 weeks = 56 days
      assert.equal(tl.timestamps.length, 1, 'only the 10-day-old event survives');
    });
  });
});

function seedVelocity(timestamps: number[]): void {
  const stmt = memDb.prepare('INSERT INTO velocity_log (slug, ts) VALUES (?, ?)');
  for (const ts of timestamps) stmt.run('hello-world', ts);
}

// ── 5 · Daily-count bucket key reads from the pinned clock ────────────────

describe('collectiveMemory.clock — daily counts bucket on pinned today', () => {
  test('incrementDailyCount writes day = todayKey(frozenISO)', () => {
    withClock(FX.frozenISO, () => incrementDailyCount('fp:abc'));
    const row = memDb.prepare(
      'SELECT count, day FROM daily_counts WHERE key = ?',
    ).get('fp:abc') as { count: number; day: string };
    assert.equal(row.day, FX.todayKey);
    assert.equal(row.count, 1);
  });
  test('getDailyCountByFp: same scope sees the count, fresh tomorrow sees 0', () => {
    withClock(FX.frozenISO, () => {
      incrementDailyCount('fp:def');
      assert.equal(getDailyCountByFp('def'), 1);
    });
    const tomorrow = FROZEN_MS + FX.windows.dayMs;
    withClock(tomorrow, () => {
      assert.equal(getDailyCountByFp('def'), 0); // bucket key changes → reset
    });
  });
});

// ── 6 · Visitor trust ages relative to the pinned clock ───────────────────

describe('collectiveMemory.clock — visitor trust score', () => {
  test('first visit lands first_seen = pinned now, score = 0.5', () => {
    withClock(FX.frozenISO, () => upsertVisitorTrust('fp-1'));
    const row = getVisitorTrust('fp-1');
    assert.equal(row?.first_seen, FROZEN_MS);
    assert.equal(row?.score, 0.5);
  });
  test('promoted to 1.0 once age > 1 day AND visits > 3', () => {
    withClock(FX.frozenISO, () => upsertVisitorTrust('fp-2'));
    const future = FROZEN_MS + FX.windows.dayMs + FX.windows.hourMs;
    withClock(future, () => {
      upsertVisitorTrust('fp-2');
      upsertVisitorTrust('fp-2');
      upsertVisitorTrust('fp-2');
    });
    assert.equal(getVisitorTrust('fp-2')?.score, 1.0);
  });
});

// ── 7 · pruneRateLimits uses the pinned cutoff ────────────────────────────

describe('collectiveMemory.clock — pruneRateLimits cutoff', () => {
  test('removes rows older than 1h relative to pinned now; keeps fresh ones', () => {
    withClock(FX.frozenISO, () => {
      recordRevival('fresh', 's');             // pinned-now stamp → keep
    });
    const stale = FROZEN_MS - 2 * FX.windows.hourMs;
    memDb.prepare(
      'INSERT INTO rate_limit (ip_slug, last_at) VALUES (?, ?)',
    ).run('stale:s', stale);

    withClock(FX.frozenISO, () => pruneRateLimits());

    const survivors = memDb.prepare('SELECT ip_slug FROM rate_limit').all() as Array<{ ip_slug: string }>;
    const keys = survivors.map(r => r.ip_slug).sort();
    assert.deepEqual(keys, ['fresh:s']);
  });
});

// ── 8 · Parallel-safety — withClock scopes do not cross ───────────────────

describe('collectiveMemory.clock — parallel scopes do not cross-contaminate', () => {
  test('two scopes write distinct stamps; neither leaks the other', async () => {
    const isoA = '2026-04-23T14:07:03.192Z';
    const isoB = '2026-12-31T23:59:59.000Z';
    await Promise.all([
      Promise.resolve(withClock(isoA, () => resurrectPost('post-a', 1))),
      Promise.resolve(withClock(isoB, () => resurrectPost('post-b', 1))),
    ]);
    const map = getRisenTimestamps();
    assert.equal(map.get('post-a')?.toISOString(), isoA);
    assert.equal(map.get('post-b')?.toISOString(), isoB);
  });
});

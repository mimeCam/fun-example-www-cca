// src/lib/ledger-clock.test.ts
// Golden test for the 2026-04-23 ledger wedge (v173).
//
// What this locks — the §E byte-identity invariant, at the ledger floor:
//   1. Three independent SQLite ledgers (cell-event, conviction, stance)
//      each pick up their `ts` stamp from the ONE pinned clock when called
//      inside `withClock(frozenISO, …)`. If any ledger path silently drifts
//      back to a raw wall-clock read, its row's `ts` splits from the others
//      and this test flips red — the ledger-cluster analogue of the §E
//      citation golden.
//   2. `clock.logJson` emits one line to stderr with `ts === nowISO()`, so
//      the three cron/job stderr logs that used to duplicate this helper
//      now agree by construction.
//   3. Default-arg callsites in `cell-event-ledger.ts` (`clampTimestamp`,
//      `ledgerMaturity`) are re-evaluated per invocation — Mike napkin
//      PoI-2 — i.e. the pinned clock is observed at call time, not import.
//
// What this intentionally does NOT do:
//   · Touch `data/revivals.db`. Each ledger swaps its singleton for a
//     fresh `:memory:` DB via its `__setDbForTests` hatch.
//   · Cover the §E citation golden itself (owned by `citation-golden.test.ts`).
//   · Assert cross-ledger schema overlap — each writes its own table.
//
// Run:  npx tsx --test src/lib/ledger-clock.test.ts
//
// Credits: Mike Koch (napkin §2 cluster + §2 golden spec; Paul's §E
//            byte-identity invariant carried to the ledger floor),
//          Paul Kim (E7 — "one pinned clock per SSR request"),
//          Elon (§1 no-new-deps; §5.2 rationale engineer-grade),
//          Krystle (per-file freeze-witness pattern),
//          Tanya Donska (§6 evidentiary stamps don't dance),
//          Sid (every helper ≤ 10 lines).
//          2026-04-23.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// ── Swap every ledger's singleton to a fresh :memory: handle ──────────────
// Each hatch is the minimum needed to avoid touching `data/revivals.db`.

import { __setSharedDbForTests } from './collectiveMemory.js';
import { __setDbForTests as __setConvictionDb } from './conviction-ledger.js';
import { __setDbForTests as __setStanceDb }     from './stance-ledger.js';

// ── Ledger writers under test — imported AFTER the hatches are visible ────

import { logJson, withClock, nowISO } from './clock.js';
import { ensureSchema, record, clampTimestamp, __resetSchemaFlagForTests }
  from './cell-event-ledger.js';
import { sealConviction } from './conviction-ledger.js';
import { recordStance } from './stance-ledger.js';

// ── Fixture — one frozen ISO; three ledgers must all stamp equal to it ────

const FROZEN_ISO = '2026-06-01T12:00:00.000Z';
const FROZEN_MS  = Date.parse(FROZEN_ISO);

// ── Per-test DB swap — three :memory: handles, one per ledger ─────────────

let sharedMem:     Database.Database;
let convictionMem: Database.Database;
let stanceMem:     Database.Database;

beforeEach(() => {
  sharedMem     = new Database(':memory:');
  convictionMem = new Database(':memory:');
  stanceMem     = new Database(':memory:');
  __setSharedDbForTests(sharedMem);
  __setConvictionDb(convictionMem);
  __setStanceDb(stanceMem);
  __resetSchemaFlagForTests();
  ensureSchema();
});

// ── 0 · Fixture sanity ────────────────────────────────────────────────────

describe('ledger-clock — fixture', () => {
  test('frozen ISO parses to a finite millisecond timestamp', () => {
    assert.ok(Number.isFinite(FROZEN_MS), `parse failed: ${FROZEN_ISO}`);
  });
});

// ── 1 · The §E ledger golden — byte-identical `ts` across three ledgers ──

describe('ledger-clock — three ledgers stamp on ONE pinned clock', () => {
  test('cell-event + conviction + stance all stamp at FROZEN_MS', () => {
    withClock(FROZEN_ISO, () => {
      record({
        event: 'copy', axis: 'typography', stage: 'fresh',
        ref: '550e8400-e29b-41d4-a716-446655440000',
        ts: FROZEN_MS,
      });
      sealConviction('wedge-witness', 7, 'note');
      recordStance('wedge-witness', 'session-a', 'agree');
    });

    const cellTs = (sharedMem
      .prepare('SELECT ts FROM cell_events LIMIT 1')
      .get() as { ts: number }).ts;
    const convTs = (convictionMem
      .prepare("SELECT timestamp AS ts FROM conviction_ledger WHERE event_type = 'seal' LIMIT 1")
      .get() as { ts: number }).ts;
    const stanceTs = (stanceMem
      .prepare('SELECT timestamp AS ts FROM reader_stances LIMIT 1')
      .get() as { ts: number }).ts;

    assert.equal(cellTs,   FROZEN_MS, 'cell-event ledger stamp = pinned ms');
    assert.equal(convTs,   FROZEN_MS, 'conviction ledger stamp = pinned ms');
    assert.equal(stanceTs, FROZEN_MS, 'stance ledger stamp = pinned ms');
    assert.equal(cellTs, convTs,   'cell-event ≡ conviction');
    assert.equal(convTs, stanceTs, 'conviction ≡ stance');
  });

  test('two withClock scopes do not cross-contaminate ledger rows', async () => {
    const isoA = '2026-04-23T14:07:03.192Z';
    const isoB = '2026-12-31T23:59:59.000Z';
    await Promise.all([
      Promise.resolve(withClock(isoA, () => recordStance('slug-a', 'sess-a', 'agree'))),
      Promise.resolve(withClock(isoB, () => recordStance('slug-b', 'sess-b', 'disagree'))),
    ]);
    const rows = stanceMem
      .prepare('SELECT post_slug, timestamp AS ts FROM reader_stances ORDER BY post_slug')
      .all() as Array<{ post_slug: string; ts: number }>;
    assert.equal(rows.length, 2, 'two distinct stance rows written');
    assert.equal(rows[0].ts, Date.parse(isoA), 'scope A stamp preserved');
    assert.equal(rows[1].ts, Date.parse(isoB), 'scope B stamp preserved');
  });
});

// ── 2 · Mike PoI-2 — default-arg callsites re-evaluate per invocation ────

describe('ledger-clock — default-arg seams are call-time, not load-time', () => {
  test('clampTimestamp(ts) reads the pinned clock at call time', () => {
    withClock(FROZEN_ISO, () => {
      // In-window timestamp passes through unchanged.
      assert.equal(clampTimestamp(FROZEN_MS + 1_000), FROZEN_MS + 1_000);
      // Too-late timestamp is clamped to pinned-now + 1h skew ceiling.
      const farFuture = FROZEN_MS + 24 * 60 * 60 * 1000;
      assert.equal(clampTimestamp(farFuture), FROZEN_MS + 3_600_000);
      // Too-early timestamp is clamped to pinned-now - 1h skew floor.
      const farPast = FROZEN_MS - 24 * 60 * 60 * 1000;
      assert.equal(clampTimestamp(farPast), FROZEN_MS - 3_600_000);
    });
  });
});

// ── 3 · clock.logJson — single producer of cron/job stderr lines ─────────

describe('ledger-clock — clock.logJson stamps via the seam', () => {
  test('emits one JSON line with ts === nowISO() under withClock', () => {
    const { lines } = captureStderr(() => {
      withClock(FROZEN_ISO, () => logJson('cron-runner', 'tick', { n: 1 }));
    });
    assert.equal(lines.length, 1, 'one line flushed');
    const parsed = JSON.parse(lines[0]) as {
      ts: string; job: string; event: string; data: { n: number };
    };
    assert.equal(parsed.ts, FROZEN_ISO, 'ts = pinned nowISO()');
    assert.equal(parsed.job, 'cron-runner');
    assert.equal(parsed.event, 'tick');
    assert.equal(parsed.data.n, 1);
  });

  test('two logJson calls inside the same scope agree byte-for-byte on ts', () => {
    const { lines } = captureStderr(() => {
      withClock(FROZEN_ISO, () => {
        logJson('deadline-sweeper', 'start', {});
        logJson('ots-poller',       'start', {});
      });
    });
    const stamps = lines.map(l => (JSON.parse(l) as { ts: string }).ts);
    assert.equal(stamps.length, 2, 'two lines flushed');
    assert.equal(stamps[0], FROZEN_ISO, 'first stamp = pinned');
    assert.equal(stamps[1], FROZEN_ISO, 'second stamp = pinned');
    assert.equal(stamps[0], stamps[1],  'byte-identical across jobs');
  });

  test('outside any scope, ts parses back and matches nowISO() shape', () => {
    const { lines } = captureStderr(() => {
      logJson('cron-runner', 'boot', { baseUrl: 'http://localhost:7100' });
    });
    const parsed = JSON.parse(lines[0]) as { ts: string };
    assert.ok(!Number.isNaN(Date.parse(parsed.ts)), 'ts parses as ISO-8601');
    assert.equal(parsed.ts.length, nowISO().length, 'ISO shape matches seam');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Temporarily intercept process.stderr.write and collect JSON lines. */
function captureStderr(fn: () => void): { lines: string[] } {
  const buf: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: (b: string) => boolean }).write =
    (chunk: string) => { buf.push(String(chunk)); return true; };
  try { fn(); } finally {
    (process.stderr as { write: (b: string) => boolean }).write =
      original as unknown as (b: string) => boolean;
  }
  return { lines: buf.join('').split('\n').filter(Boolean) };
}

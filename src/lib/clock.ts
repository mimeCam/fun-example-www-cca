// src/lib/clock.ts
// The ONE seam for "now". Every server-side callsite that needs a wall-clock
// time imports from here — never Date.now() / new Date() directly.
//
// Why: the UI, the engine, and /api/docs/cite must agree on a single "now"
// within one SSR request. Raw Date.now() callsites drift within a single
// payload (HTML head vs. first DB read vs. cite response). This module is
// the fix and the place to pin the clock for tests.
//
// Public surface:
//   · now()       → number  (ms since epoch)
//   · nowDate()   → Date
//   · nowISO()    → string  (ISO-8601, UTC)
//   · withClock(fixedMs|iso, fn)   scoped override (AsyncLocalStorage)
//   · freezeClock(iso) / unfreezeClock()  module-level override for sync tests
//   · _testClock() — build-time sanity check per openloop/inplace-testing-howto.md
//
// Design notes (Mike napkin §5):
//   · AsyncLocalStorage is Node-20 built-in — zero dep cost.
//   · The override is scoped, not global. Parallel node --test workers can
//     each `withClock(frozenISO, fn)` without stomping siblings.
//   · freezeClock() is a convenience for the few sync tests that can't
//     wrap their call stack. Use sparingly.
//   · The browser is NOT in scope. liveDecayScript() still reads Date.now()
//     on the client; the client is a different physical clock.
//
// Credits: Mike Koch (napkin plan — "the pure now() seam"), Elon (§1 red-line:
//          no new deps, seam is the unlock), Jason Fried (named the seam),
//          Krystle Clear (v168 unblock), Paul Kim (one decayFactor, one now).
//          Tanya Donska (§2: the design reads from this scalar, never forks).
//          2026-04-23.
//
// TODO: route SSR middleware `now = Date.now()` at request entry so all
//       handlers in one request see the same "now" (see src/middleware.ts).
// TODO: once all 150+ callsites migrate, flip guard from warn → error.
// TODO: retire src/lib/timeTravel.ts + timeTravelBands.ts (already FROZEN
//       per their own headers); replace with withClock-based QA endpoint.

// Import the namespace, not the named export, so the bundler can resolve the
// module to its browser-empty stub (Vite externalises `node:async_hooks` for
// client bundles transitively pulled in via shared lib code). The named
// `AsyncLocalStorage` is then fetched at runtime: real implementation on the
// server, no-op shim in the browser (the client never pins a scoped clock —
// it just reads `Date.now()` via the shared `now()` helper).
import * as asyncHooks from 'node:async_hooks';

type ClockScope = { fixedMs: number };

class NoopAsyncLocalStorage<T> {
  getStore(): T | undefined { return undefined; }
  run<R>(_store: T, fn: () => R): R { return fn(); }
}

const ALS: { new <T>(): { getStore(): T | undefined; run<R>(store: T, fn: () => R): R } } =
  (asyncHooks as { AsyncLocalStorage?: typeof NoopAsyncLocalStorage }).AsyncLocalStorage
    ?? NoopAsyncLocalStorage;

// ── Internal state ────────────────────────────────────────────────────────

const clockStore = new ALS<ClockScope>();

/** Module-level override. Null = use wall clock. Used only when ALS context
 *  isn't available (sync tests, top-level `_testFoo()` calls). */
let frozenMs: number | null = null;

// ── Public surface (each helper ≤ 3 lines per Sid's ≤-10 rule) ────────────

/** Current time in ms since epoch. Respects withClock / freezeClock. */
export function now(): number {
  const scoped = clockStore.getStore();
  if (scoped) return scoped.fixedMs;
  return frozenMs ?? Date.now();
}

/** Current time as a Date object. */
export function nowDate(): Date {
  return new Date(now());
}

/** Current time as an ISO-8601 string. */
export function nowISO(): string {
  return new Date(now()).toISOString();
}

// ── Scoped override — the preferred test seam ─────────────────────────────

/**
 * Run `fn` under a pinned clock. Nested calls override outer scopes.
 * Accepts an ISO string or a millisecond timestamp.
 * The pinned clock only affects code that imports from this module.
 */
export function withClock<T>(at: string | number, fn: () => T): T {
  const fixedMs = typeof at === 'number' ? at : parseISO(at);
  return clockStore.run({ fixedMs }, fn);
}

// ── Module-level override — escape hatch for sync/top-level tests ─────────

/** Freeze the clock at `iso`. Every subsequent now() returns this value
 *  until unfreezeClock() is called. Prefer withClock() where possible. */
export function freezeClock(iso: string): void {
  frozenMs = parseISO(iso);
}

/** Remove a freeze set by freezeClock(). No-op if none was set. */
export function unfreezeClock(): void {
  frozenMs = null;
}

/** True when any override is active — useful for logging + guard checks. */
export function isClockPinned(): boolean {
  return clockStore.getStore() !== undefined || frozenMs !== null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseISO(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) throw new Error(`clock: invalid ISO "${iso}"`);
  return ms;
}

// ── Isolated-run sanity check (openloop/inplace-testing-howto.md) ─────────

export function _testClock(): void {
  // Baseline: now() tracks Date.now() within a few ms when unpinned.
  const delta = Math.abs(now() - Date.now());
  console.assert(delta < 50, `unpinned drift: ${delta}ms`);
  console.assert(!isClockPinned(), 'no pin at start');

  // freezeClock — module-level override
  freezeClock('2026-04-04T00:00:00Z');
  console.assert(isClockPinned(), 'pin detected after freezeClock');
  console.assert(now() === Date.parse('2026-04-04T00:00:00Z'), 'frozen now()');
  console.assert(nowISO() === '2026-04-04T00:00:00.000Z', 'frozen ISO');
  console.assert(nowDate().getUTCFullYear() === 2026, 'frozen year');

  // unfreezeClock — clears override
  unfreezeClock();
  console.assert(!isClockPinned(), 'unfrozen');
  const resumeDelta = Math.abs(now() - Date.now());
  console.assert(resumeDelta < 50, `resume drift: ${resumeDelta}ms`);

  // withClock — scoped override, returns fn's value
  const got = withClock('2026-04-30T12:00:00Z', () => {
    console.assert(isClockPinned(), 'pin during scope');
    console.assert(nowISO() === '2026-04-30T12:00:00.000Z', 'scoped ISO');
    return 42;
  });
  console.assert(got === 42, 'withClock returns fn value');
  console.assert(!isClockPinned(), 'scope released');

  // Scoped override wins over module-level freeze (innermost pin wins).
  freezeClock('2026-01-01T00:00:00Z');
  withClock('2026-12-31T00:00:00Z', () => {
    console.assert(nowISO() === '2026-12-31T00:00:00.000Z', 'scoped beats frozen');
  });
  console.assert(nowISO() === '2026-01-01T00:00:00.000Z', 'frozen restored');
  unfreezeClock();

  // Numeric input is accepted
  withClock(1_700_000_000_000, () => {
    console.assert(now() === 1_700_000_000_000, 'numeric ms accepted');
  });

  // Invalid ISO rejected with a sharp error — fail fast, not silent 0
  let threw = false;
  try { parseISO('not-a-date'); } catch { threw = true; }
  console.assert(threw, 'parseISO rejects bad input');

  console.log('[clock] OK — now, nowDate, nowISO, withClock, freezeClock verified');
}

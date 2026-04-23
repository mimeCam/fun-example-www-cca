// src/middleware.ts
// Pin one clock per SSR request. Every handler in a single HTTP request
// sees exactly ONE "now" — no drift between the HTML <head>, the first
// DB read, and the JSON body. Per Mike napkin §5-PoI-2: "one request =
// one frozen clock = one truth".
//
// How it works: when an SSR request enters, capture Date.now() once,
// then run the handler inside withClock(pinnedMs, …). Every import of
// `now()` / `nowDate()` / `nowISO()` inside that request resolves to
// the same pinned value (AsyncLocalStorage scope in src/lib/clock.ts).
//
// The browser is NOT affected — liveDecayScript() still ticks on
// Date.now() client-side (a different physical clock, out of scope).
//
// Credits: Mike Koch (napkin §5 — "SSR middleware is the real unlock"),
//          Tanya Donska (§6 — "the matrix is the calm center" — it
//          still computes inside one scoped clock, just like everything
//          else), 2026-04-23.
//
// TODO: once all 150+ raw Date.now() callsites are migrated, flip
//       scripts/check-no-raw-now.ts from warn → error.

import { defineMiddleware } from 'astro:middleware';
import { withClock } from './lib/clock';
import { bootFromEnv as bootCronFromEnv } from './lib/cron-runner';

// Sid 2026-04-23 deployment.log fix: the `astro:server:start` integration
// hook is dev-only; production standalone (dist/server/entry.mjs) never
// fires it, so cron-runner never booted. Lazy-boot on first request; the
// `booted` guard in cron-runner keeps this idempotent. Middleware is
// bundled into dist/server, so this runs in production. One-shot, no
// per-request cost after the first tick.
export const onRequest = defineMiddleware(async (_context, next) => {
  bootCronFromEnv();
  // Pin once at request entry. Date.now() here is the ONLY raw read
  // per request — everything downstream routes through clock.ts.
  return withClock(Date.now(), () => next());
});

**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR request · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards + codegen.

**WIP — Clock migration:** `scripts/check-no-raw-now.ts` runs in **warn** mode; **80** raw `Date.now()` / `new Date()` callsites remain (was 100). v172 wedge: `collectiveMemory.ts` migrated (20 → 0) + golden test `src/lib/collectiveMemory.clock.test.ts` locks the seam. Next wedges: `presence-hub.ts` (6), `live-decay.ts` (5), `cell-event-ledger.ts` (3), `cell-heat.ts` (3). Flip guard to `--error` after the next 2–3 land.

**WIP — Journey Witness:** `submit → read → endanger` mouths live in `src/lib/journey-witness.ts`. Deferred: `revive → verdict-resolve` — needs blog-slug precondition + `ADMIN_SECRET` + offline TSA stub (see TODOs in `src/lib/journey-golden.ts`).

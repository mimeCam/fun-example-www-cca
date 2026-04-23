**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain (incl. `clock.ts` — the one `now()` seam; `verify-bundle-shared.ts` + `verify-iso.ts` — DTO + isomorphic proof walker) · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR request · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards + codegen.

**WIP — Clock migration:** `scripts/check-no-raw-now.ts` runs in **warn** mode; ~107 raw `Date.now()` / `new Date()` callsites still need to route through `src/lib/clock.ts`. Flip guard to `--error` once migrated.

**WIP — Journey Witness:** `submit → read → endanger` mouths live in `src/lib/journey-witness.ts` (endanger uses `withClock`). Deferred: `revive → verdict-resolve` — needs blog-slug precondition + `ADMIN_SECRET` + offline TSA stub (see TODOs in `src/lib/journey-golden.ts`).

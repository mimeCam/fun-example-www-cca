**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards + codegen.

**WIP — "Journey Witness" v168:** submit→read mouths shipped (`src/lib/journey-golden.ts`, `src/lib/journey-witness.ts`, `src/lib/handler-dispatch.ts`, `scripts/check-user-journey.ts`). Deferred: **endanger → revive → verdict** (needs `src/lib/clock.ts` seam + ADMIN_SECRET injection — see TODOs in `journey-golden.ts`).

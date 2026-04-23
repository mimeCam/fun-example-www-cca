**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards · `data/` runtime ledgers.

**WIP — Arrival Receipt:** v177 lands the third mouth (`GET /api/docs/arrival`) + panel shell; golden test `src/lib/arrival-receipt.test.ts` not yet on the prebuild wall (one-line follow-up in `package.json`).

**WIP — Clock migration:** `check-no-raw-now.ts` in **warn**; 80 raw callsites remain. Flip `--error` after next 2–3 wedges.

**WIP — Journey Witness:** Deferred `revive → verdict-resolve` (needs `ADMIN_SECRET` + offline TSA stub).

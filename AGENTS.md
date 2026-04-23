**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive, receipt lands via `GET /api/docs/arrival`.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR **and lazy-boots cron** · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards · `data/` runtime ledgers.

**WIP — Clock migration:** `check-no-raw-now.ts` in **warn**; 63 raw callsites remain. Flip `--error` after next 1–2 wedges (presence-hub, live-decay).

**WIP — Journey Witness:** Deferred `revive → verdict-resolve` (needs `ADMIN_SECRET` + offline TSA stub).

**WIP — CiteFlash consolidation (next napkin):** v179 shipped `CiteFlash.astro` + `ApiAlso.astro` + `check-cite-flash-reuse.ts` (warn). Guard flags `seal-receipt.css` as the single remaining `@keyframes receipt-*` holdout — collapse `ArrivalReceipt`/`AuditReceipt`/`SealReceipt`/`VerifyReceipt` onto the CiteFlash primitive next wedge, then flip guard to `--error`.

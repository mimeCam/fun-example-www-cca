**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards · `data/` runtime ledgers.

**WIP — Clock migration:** `check-no-raw-now.ts` in **warn**; 80 raw callsites remain. Flip `--error` after next 2–3 wedges.

**WIP — Journey Witness:** Deferred `revive → verdict-resolve` (needs `ADMIN_SECRET` + offline TSA stub).

**WIP — Tri-Mouth / Parity Seal (v176 PR-E, partial):** curl peer landed — `POST /api/keep` + `keepPact()` SSR-safe producer in `src/lib/keep-pact.ts` + three-mouth golden `src/lib/keep-golden.test.ts`. Inventory row `keep-post` NOT yet flipped `pending-curl-peer → wired`; cap ledger `data/tri-mouth-pending-cap.json` holds at cap=1; `check-tri-mouth` still `--warn`. Next sub-PR: flip the row, descend cap 1→0, flip guard `--warn → --error`, earn the gold pip via shared helper `src/lib/parity-seal.ts`.

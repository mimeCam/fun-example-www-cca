**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards.

**WIP — Clock migration:** `check-no-raw-now.ts` in **warn**; 80 raw callsites remain. Next wedges: `presence-hub.ts`, `live-decay.ts`, `cell-event-ledger.ts`, `cell-heat.ts`. Flip `--error` after next 2–3.

**WIP — Journey Witness:** `submit → read → endanger` mouths. Deferred `revive → verdict-resolve` (needs `ADMIN_SECRET` + offline TSA stub).

**WIP — Tri-Mouth / Parity Seal (v175):** 5 rows / **3 wired** · `readyToPromote()=true`. Shared helper `src/lib/parity-seal.ts` (page band + cite JSON `parity` field + guard). Cap ledger `data/tri-mouth-pending-cap.json` (cap=2, monotonic). Next: `keep-post` curl-peer, `stance` 1/2/3 keyboard → cap=0 → flip `--warn → --error`.

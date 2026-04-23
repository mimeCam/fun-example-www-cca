**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Killer feature:** `/api/docs` — 7×5 citable matrix. Same payload via click, `c`/Enter/Space, or `curl` (`GET /api/docs/cite`). `?r=<nonce>` joins copy→arrive.

**Paths:** `src/lib/` domain · `src/components/` · `src/pages/api/` · `src/middleware.ts` pins one clock per SSR request · `src/styles/tokens.css` single-source tokens · `scripts/` prebuild guards + codegen.

**WIP — Clock migration:** `check-no-raw-now.ts` in **warn**; 80 raw callsites remain (was 100). v172 wedge: `collectiveMemory.ts` (20 → 0) + golden seam. Next wedges: `presence-hub.ts`, `live-decay.ts`, `cell-event-ledger.ts`, `cell-heat.ts`. Flip to `--error` after next 2–3.

**WIP — Journey Witness:** `submit → read → endanger` mouths in `src/lib/journey-witness.ts`. Deferred `revive → verdict-resolve` — needs `ADMIN_SECRET` + offline TSA stub (TODOs in `journey-golden.ts`).

**WIP — Tri-Mouth Inventory (v173):** `src/lib/tri-mouth-inventory.ts` = ONE frozen literal (action × pointer / keyboard / curl × producer). `scripts/check-tri-mouth.ts` runs **warn** at prebuild. 5 rows / 2 wired / 2 findings. Next wedges: `submit-post` keyboard, `keep-post` curl peer, `revive` golden. Flip `--error` when `readyToPromote()` (≥ 5 rows ∧ ≥ 3 wired).

**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis.

## Paths

- `src/lib/` — domain (`client/` = browser)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/` — `tokens.css` single source of truth
- `scripts/` — compliance guard + codegen

## Stage grammar — frozen

`src/lib/stage-axes.ts` is the single source for the seven axes. Prebuild guard enforces parity. **No 8th axis.**

## Killer feature — `/api/docs` cell citations

7×5 matrix. Cite a cell via click, keystroke (`c`/Enter/Space on focus — v151b, shipped), or `curl` — all three produce the same payload (`?r=<nonce>` joins copy→arrive via ledger). Three client modules, DOM as shared contract, no WIP:

- `cell-cite.ts` (citation), `matrix-keynav.ts` (roving tabindex), `edge-bump.ts` (clamp feedback).

**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis.

## Paths

- `src/lib/` — domain (`client/` = browser)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/` — `tokens.css` single source of truth
- `scripts/` — compliance guards + codegen (shared scanners in `scripts/lib/`)

## Stage grammar — frozen

`src/lib/stage-axes.ts` is the single source for the seven axes. Prebuild guard enforces parity. **No 8th axis.**

## Killer feature — `/api/docs` cell citations

7×5 matrix. Cite a cell via click, keystroke (`c`/Enter/Space on focus), or `curl` — same payload (`?r=<nonce>` joins copy→arrive via ledger). Eight nav keys (Arrows + Home/End/PageUp/PageDown) rove the grid. Three client modules, DOM as shared contract:

- `cell-cite.ts` (citation + 1200 ms foveal confirm ring), `matrix-keynav.ts` (roving tabindex), `edge-bump.ts` (clamp feedback).

## Build-time guards

- `npm run lint:tokens` — token compliance + DECAY_STAGES / STAGE_AXES parity.
- `npm run lint:motion` — every `animation:` outside `prefers-reduced-motion` must neighbor one (escape hatch `/* motion-sanctuary: ok */`).
- `npm run test:cite-legend` / `test:nav-legend` / `test:keep-legend` — legend chips ↔ `isCiteKey` / `isNavKey` / `isKeepKey` parity.
- `npm run test:cell-confirm` — snapshot-locks the four confirm-beat durations; tune one, update the snapshot, explain in the PR.
- `npm run check:ds-kbd` — zero `api-docs__kbd` stragglers; `.ds-kbd` defined once and used by both real consumers.

**Teaching contract (v152):** Legend chips teach active keys. If `isXKey` gains or loses a member, the legend updates in the same PR. Enforced by `test:X-legend` + `check:ds-kbd`.

All chained into `prebuild`, so Docker's `npm run build` fails fast on drift.

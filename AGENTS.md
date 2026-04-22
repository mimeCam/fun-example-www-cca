**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis.

## Paths

- `src/lib/` — domain (`client/` = browser)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/` — `tokens.css` is single source of truth
- `scripts/` — compliance guard + codegen

## Stage grammar — frozen

Canonical literal: `src/lib/stage-axes.ts` (`STAGE_AXES` + `AXIS_TO_CSS_FILE`) is the single source for the seven axes — typography, border, tempo, selection, drag-highlight, focus, underline. One file per axis in `src/styles/stage-*.css`; the prebuild compliance guard enforces axis ⇄ file parity. Add axis → mutate the literal; never branch stage literals in components. **Axis count is frozen — no 8th axis. Instrument, measure, polish.**

`src/lib/stage-tokens.generated.ts` mirrors tokens for non-CSS consumers (`npm run generate:stage-tokens`).

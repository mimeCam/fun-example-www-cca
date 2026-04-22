**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis — typography, border, tempo, drag-highlight.

## Paths

- `src/lib/` — domain (`client/` = browser)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/` — `tokens.css` is single source of truth
- `scripts/` — compliance guard + codegen

## Stage axes

One file per axis in `global.css`: `stage-motion.css` (tempo), `stage-selection.css` (drag-highlight, prose-scoped, reuses `--stage-*-border`). Add axis → add file; never branch stage literals in components.

`src/lib/stage-tokens.generated.ts` mirrors tokens for non-CSS consumers; `npm run generate:stage-tokens`.

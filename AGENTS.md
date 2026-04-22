**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis — typography, border, tempo, drag-highlight, focus-ring.

## Paths

- `src/lib/` — domain (`client/` = browser)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/` — `tokens.css` is single source of truth
- `scripts/` — compliance guard + codegen

## Stage axes

One file per axis in `global.css`: `stage-motion.css` (tempo), `stage-selection.css` (drag-highlight, prose-scoped, reuses `--stage-*-border`), `stage-focus.css` (v148, `:focus-visible` ring on prose-interactive `a/button/summary/[tabindex=0]`, reuses `--stage-*-border` + `--stage-*-duration`), `stage-underline.css` (v149, prose anchor underlines — color follows stage border on bright stages, floors at `--stage-endangered-border` on ghost/fossil for WCAG 1.4.11; geometry carries the age). Add axis → add file; never branch stage literals in components. After v149 the axis count is **frozen** — instrument, measure, polish. No 8th axis.

`src/lib/stage-tokens.generated.ts` mirrors tokens for non-CSS consumers; `npm run generate:stage-tokens`.

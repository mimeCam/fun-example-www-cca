# Persona Blog

Astro 4 · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities (decay math, constellation graph, pulse engine, time bands)
- `src/components/` — Astro components (DecayCard, PlanetariumWindow, PulseTeaser …)
- `src/styles/` — design tokens and global styles
- `src/pages/` — routes (`/`, `/constellations`, `/pulse`, `/now`, `/wall`)
- `src/data/` — JSON flat-file storage

## WIP

- Homepage time bands — Now/Recent/Archive grouping live, needs 20+ posts to fully exercise Recent & Archive bands.
- Page consolidation — `/pulse`+`/wall` → `/now`, `/embers` → `/tidepool` (nav done, routes still separate).
- DecayCard v2 — cover image slot, prev/next navigation.
- Mobile long-press revival — wired, needs real-device testing.

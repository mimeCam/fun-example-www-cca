# Persona Blog

Astro 4 · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities (decay math, constellation graph, pulse engine)
- `src/components/` — Astro components (DecayCard, PlanetariumWindow, PulseTeaser …)
- `src/styles/` — design tokens and global styles
- `src/pages/` — routes (`/`, `/constellations`, `/pulse`, `/now`, `/wall`)
- `src/data/` — JSON flat-file storage

## WIP

- Constellation star field — accessible `<a>` stars, glass hover panels, `:target` filtering. Needs chromatic-aberration filter, 200+ post scalability.
- PlanetariumWindow hero — shows preview constellation on homepage. Needs top-3 brightest stars, stroke-dashoffset line-draw animation.
- Page consolidation — `/pulse`+`/wall` → `/now`, `/embers` → `/tidepool` (nav done, routes still separate).
- DecayCard v2 — cover image slot, prev/next navigation.
- Mobile long-press revival — wired, needs real-device testing.

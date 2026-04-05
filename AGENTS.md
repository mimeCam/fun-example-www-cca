# Persona Blog

Astro 4 · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, mood, shimmer, temporal)
- `src/components/` — Astro components
- `src/styles/` — global styles and decay visuals
- `src/pages/` — routes
- `src/content/blog/` — markdown posts
- `src/data/` — JSON config and flat-file storage

## Core Feature

Temporal Decay — posts visually age over time. Fresh posts glow, old posts fade into the page. Hover/long-press revives them. Live client-side RAF loop keeps decay current.

## WIP

- **Route Pruning** — delete constellations, wall, tidepool, lowtide, embers, pulse, now/before pages
- **Component Pruning** — ~19 satellite components pending removal after route pruning
- **Decay Onboarding** — first-visit hint for mobile revival discoverability
- **Decay Entrance Animation** — staggered card reveal on page load
- **Archive Tap-to-Reveal** — homepage archive band "archaeology" interaction

# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, mood, collective memory, temporal)
- `src/components/` — Astro components
- `src/styles/` — global styles and decay visuals
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts
- `src/data/` — JSON config and SQLite storage
- `cli/` — CLI tooling

## Core Feature

Temporal Decay + Collective Memory — posts visually age over time; reader attention revives them via a shared revival counter backed by SQLite.

## WIP

- Collective Memory P1 — ghost glow CSS, "remembered" label, scroll-past-60% revival, onboarding whisper
- Route Pruning — remove legacy constellation/wall/tidepool/lowtide/embers/pulse/now/before pages
- Component Pruning — ~19 satellite components pending removal after route pruning
- Decay Onboarding — first-visit hint for mobile revival discoverability
- Archive Tap-to-Reveal — homepage archive band "archaeology" interaction

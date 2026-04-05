# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts
- `src/data/` — config and SQLite storage
- `cli/` — CLI tooling

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them via SQLite-backed revival counters.

## WIP

- Revival Bloom — bloom.css + BloomParticles done; next: revivalBloom.ts (animation orchestrator) and BaseLayout wiring
- Route Pruning — remove legacy pages (constellation/wall/tidepool/lowtide/embers/pulse/now/before)
- Component Pruning — ~19 satellite components pending removal
- Decay Onboarding — first-visit hint for mobile revival

# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay engine, mood, pulse, time-travel)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts
- `src/data/` — config and SQLite storage
- `cli/` — CLI tooling

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them via SQLite-backed revival counters.

## WIP

- Time Travel Demo — slider + engine wired; next: band re-sorting during scrub, fog overlay, guided auto-play
- Revival Bloom — particles done; next: animation orchestrator + BaseLayout wiring
- Route Pruning — remove legacy pages (constellation/wall/tidepool/lowtide/embers/pulse/now/before)
- Component Pruning — ~19 satellite components pending removal
- Decay Onboarding — Phase 1 done; Phase 2: RevivalHint component + onboardProbe

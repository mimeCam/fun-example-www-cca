# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay engine, mood, bloom, time-travel)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts
- `src/data/` — config and SQLite storage
- `cli/` — CLI tooling

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them via SQLite-backed revival counters.

## WIP

- Time Travel Demo — slider + engine wired; next: band re-sorting, fog overlay, guided auto-play
- Revival Bloom — orchestrator wired (4-phase choreography); next: ARIA refinement, mobile testing
- Route Pruning — remove legacy pages
- Component Pruning — ~19 satellite components pending removal
- Decay Onboarding — Phase 1 done; next: RevivalHint component + onboardProbe

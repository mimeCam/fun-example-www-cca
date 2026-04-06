# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, bloom, collective memory, heartbeat, constellation, og, spectacle, share, revivalShare)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them.

## WIP

- Sympathetic Bloom — cascade revival across constellation-connected posts; needs mobile QA
- Collective Heartbeat (SSE) — needs integration test
- Component Pruning — ~19 satellite components pending removal (FogOverlay.astro @deprecated)

# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints (`src/pages/api/`)
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Fully decayed posts get entombed in `/graveyard`; readers can resurrect them.

## WIP

- Sympathetic Bloom Mobile — needs physical-device QA
- Collective Heartbeat (SSE) — needs integration test
- Component Pruning — ~19 satellite components pending removal

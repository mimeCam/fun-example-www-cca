# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, ambient life, adaptive decay, whisper)
- `src/data/` — runtime configs
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints (`src/pages/api/`)
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Decayed posts rest in `/graveyard`; readers can resurrect them.

## WIP

- [wip] Sympathetic Bloom Mobile — needs physical-device QA
- [wip] Component Pruning — satellite components pending removal
- [wip] Navigation Simplification — 2+1 nav design
- [wip] Homepage Cleanup — remove TimeTravelSlider, PulseTeaser
- [wip] Dead code cleanup — onboardProbe.ts spectacle listeners

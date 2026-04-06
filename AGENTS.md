# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay engine, ambient life, adaptive decay)
- `src/data/` — runtime configs (adaptive decay tuning, ambient life)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints (`src/pages/api/`)
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Fully decayed posts rest in `/graveyard`; readers can resurrect them. Adaptive decay auto-tunes parameters based on blog maturity.

## WIP

- Sympathetic Bloom Mobile — needs physical-device QA
- Component Pruning — ~19 satellite components pending removal
- Navigation Simplification — 2+1 nav design (blog, now, graveyard ghost link)
- Homepage Cleanup — remove FogOverlay, TimeTravelSlider, FirstVisitSpectacle, PulseTeaser
- First Visit Whisper — replace spectacle gate with ambient onboarding hint

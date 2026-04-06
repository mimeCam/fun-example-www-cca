# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, bloom, collective memory, heartbeat, constellation, og, spectacle)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/styles/` — global and feature CSS
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them.

## WIP

- Unified Revival Interaction — mobile-first touch (session 2/3: RadialRing visual built; needs radialRingA11y.ts, RadialRing.astro, spectacle integration, keepAlive keyboard wiring)
- Sympathetic Bloom — cascade revival across constellation-connected posts; needs mobile QA
- Shareable Revival Card — OG endpoint shipped; needs share bottom sheet polish
- Collective Heartbeat (SSE) — needs integration test
- Component Pruning — ~19 satellite components pending removal (FogOverlay.astro @deprecated)

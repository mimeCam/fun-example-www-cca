# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, bloom, collective memory, heartbeat, constellation, og, spectacle)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts
- `src/styles/` — global and feature CSS
- `cli/` — CLI tooling
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them.

## WIP

- Unified Revival Interaction — mobile-first touch experience (session 2/3 done: strategy modules + RadialRing visual built; needs radialRingA11y.ts, RadialRing.astro component, spectacle integration, keepAlive keyboard wiring)
- Sympathetic Bloom — cascade revival across constellation-connected posts; needs mobile QA
- Shareable Revival Card — OG image endpoint shipped; needs share bottom sheet polish
- Collective Heartbeat (SSE) — needs integration test
- First-Visit Spectacle — refactoring to modular state machine (session 1/3 done: timelapse.ts + prompt.ts + spectacle.css built; needs controller.ts + component rewrite + legacy removal)
- Component Pruning — ~19 satellite components pending removal

# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, bloom, collective memory, heartbeat, constellation)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts
- `src/styles/` — global and feature CSS
- `cli/` — CLI tooling
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them.

## WIP

- Sympathetic Bloom — cascade revival across constellation-connected posts; needs cross-band opacity, viewport gating, mobile QA
- Shareable Revival Card — toast + bloom-on-arrival done; needs OG image endpoint, RevivalMeta component, share bottom sheet
- Collective Heartbeat (SSE) — needs integration test
- First-Visit Spectacle — needs legacy `spectacle.ts` / `SkipButton` removal
- Revival Bloom — ARIA refinement, mobile testing
- Component Pruning — ~19 satellite components pending removal

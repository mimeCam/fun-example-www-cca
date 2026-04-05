# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities (decay, bloom, collective memory, heartbeat, constellation)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — markdown posts (frontmatter drives constellation links)
- `src/styles/` — global + bloom CSS (includes sympathetic cascade tokens)
- `cli/` — CLI tooling
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them.

## WIP

- **Sympathetic Bloom** — cascade revival on constellation-connected posts. Done: server pipeline, SSE resonance, client handler, CSS ring animation, frontmatter on all posts. Next: cross-band opacity for archive cards, viewport gating polish, mobile QA.
- Collective Heartbeat (SSE) — next: integration test
- First-Visit Spectacle — next: remove legacy `spectacle.ts` and `SkipButton`
- Revival Bloom — ARIA refinement, mobile testing
- Component Pruning — ~19 satellite components pending removal
- RevivalReward — mobile testing, reduced-motion QA

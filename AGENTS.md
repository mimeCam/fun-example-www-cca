# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay engine, mood, entomb, collective memory, post meta
- `src/components/` — Astro UI components
- `src/pages/` — routes and API endpoints (`api/` for SSE + JSON)
- `src/content/blog/` — Markdown posts
- `src/styles/` — CSS layers (`decay.css`, `revival.css`, `ambient.css`, `graveyard.css`)

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age; reader attention revives them. Real-time presence via SSE (`src/lib/presence-unified.ts`). Entombed posts live at `/graveyard`.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage
- Author Conviction Notes — P2, own sprint


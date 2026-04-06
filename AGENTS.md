# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — engines and utilities (decay, mood, entomb, collective memory, post meta)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — blog posts (Markdown)
- `src/styles/` — CSS layers: `decay.css`, `revival.css`, `ambient.css`

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age; reader attention revives them. Real-time reader counts via SSE (`presence-unified.ts`). Entombed posts graduate to `/graveyard` with honest timestamps from DB.

## WIP

- Physical device QA pending: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS check on homepage (ErosionBar is SSR-rendered, no expected regression)
- Graveyard redesign — P1, own sprint
- Author Conviction Notes — P2, own sprint


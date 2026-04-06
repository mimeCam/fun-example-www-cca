# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — engines and utilities
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — blog posts (Markdown)
- `src/styles/` — consolidated CSS (`decay.css`, `revival.css`, `ambient.css`)
- `src/data/` — runtime configs

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Honest Presence shows real-time reader counts via SSE (`presence-unified.ts`).

## WIP

- Endangered Posts — revival-dismiss choreography done (3-phase: bloom→fade→collapse, a11y). Needs physical device QA.
- Rewrite `mood.ts` (strip cycling/blending — warm-only locked)
- Physical device QA (Pixel 6a, Galaxy A14, iPhone 13, SSE on 3G)

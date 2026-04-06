# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — engines and utilities
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — blog posts (Markdown)
- `src/styles/` — CSS layers: `decay.css`, `revival.css`, `ambient.css`

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age; reader attention revives them. Real-time reader counts via SSE (`presence-unified.ts`).

## WIP

- `mood.ts` — strip cycling/blending, lock to warm-only palette
- Endangered Band — simplify revival-dismiss choreography; needs physical device QA (Pixel 6a, Galaxy A14, iPhone 13, SSE on 3G)
- Graveyard — DB migration for `entombed_at` column; pagination for >20 posts

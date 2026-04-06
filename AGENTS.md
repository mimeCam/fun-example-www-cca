# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — engines and utilities
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — blog posts (Markdown)
- `src/styles/` — global and feature CSS
- `src/data/` — runtime configs

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Honest Presence shows real-time reader counts via SSE.

## WIP

- Merge `presence-client.ts` into `presence-engine.ts`
- Rewrite `mood.ts` (strip cycling/blending/adaptive)
- Unified `onboarding.ts` (merge remaining onboarding mechanisms)
- Physical device QA (Pixel 6a, Galaxy A14, iPhone 13, SSE on 3G)

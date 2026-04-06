# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared engines and utilities
- `src/data/` — runtime configs
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — blog posts (Markdown)
- `src/styles/` — global and feature CSS

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Honest Presence shows real-time reader counts per slug via SSE.

## WIP

- Honest Presence — homepage PresenceBand now hydrates via `?scope=global` (global presence); physical device QA still pending (SSE on low-end Android/3G, concurrent load)
- Revival Moment — physical device QA pending (Pixel 6a, Galaxy A14, iPhone 13); old bloom/onboarding files kept for rollback
- Consolidated Engines v2 — physical device QA pending; old lib files kept for rollback
- Sitemap reduction (11→6 pages) — nav updated, page removals deferred

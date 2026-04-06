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

Temporal Decay + Collective Memory — posts visually age; reader attention revives them.

## WIP

- Consolidated Engines v2 — physical device QA pending (Pixel 6a, Galaxy A14, iPhone 13); old lib files kept for rollback
- Ambient life gating for new visitors (fvh_visits < 3) — helper exported, not yet wired into ambientLife.ts
- Sitemap reduction (11→6 pages) — nav updated, page removals deferred
- Bloom phase reduction (5→3) — spec ready, implementation deferred

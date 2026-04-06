# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities and engine modules
- `src/data/` — runtime configs (mood, ambientLife, adaptiveDecay)
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `src/content/blog/` — blog posts (Markdown)
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Decayed posts rest in `/graveyard`; readers can resurrect them.

## WIP

- Consolidated Engines v2 — `decay-engine.ts` + `revival-engine.ts` replace 17 scattered client scripts; BaseLayout reduced from ~30 to ~13 inline scripts; old lib files kept for rollback
- Physical device QA pending: Pixel 6a, Galaxy A14, iPhone 13

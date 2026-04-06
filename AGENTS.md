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

- Endangered Band — simplify revival-dismiss choreography; add "Saved." moment when band empties; needs physical device QA (Pixel 6a, Galaxy A14, iPhone 13, SSE on 3G)
- Countdown timer: show only at `urgency: final` (Tanya P1)
- Erosion bar: warm→danger gradient (Tanya P1)

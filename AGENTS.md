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

## Done (last sprint)

- **Cinematic Revival Moment** — 5-phase sequence: anticipation SVG arc → localStorage 7-day gate → WAAPI dissolve + chromatic h1 flash at t=200ms → witness badge (decay% + monthly count) → SSE ripple
- **Bug fixes** — `MAX_DAYS_DEFAULT` 365→180 (cold-start fix), `readingBonus` cap 0.08→0.15; both in `decay-engine.ts` and client IIFE
- **Author Conviction Notes** — `ConvictionPanel.astro` (inline `<details>` collapsible), `convictions[]` frontmatter schema, `[⚖ beliefs]` nav link in post header; `hello-world.md` seeded with example convictions
- **API enrichment** — `/api/revive` now returns `decayPct` + `monthlyCount`; `getMonthlyRevivalCount()` added to `collectiveMemory.ts`


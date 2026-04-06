# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay engine, mood, entomb, collective memory, revival history
- `src/components/` — Astro UI components (inc. `GhostEchoes.astro`, `ConvictionPanel.astro`)
- `src/pages/api/` — SSE + JSON endpoints
- `src/content/blog/` — Markdown posts
- `src/styles/` — CSS layers

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age; reader attention revives them.
Ghost Echoes sparkline (`GhostEchoes.astro` + `/api/ghost-echoes` + `src/lib/revivalHistory.ts`) surfaces revival history so solo readers feel collective presence.
Real-time presence via SSE (`src/lib/presence-unified.ts`). Entombed posts live at `/graveyard`.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage
- `src/lib/variants.ts` — consolidate into decay-engine client script (freeze-sprawl)


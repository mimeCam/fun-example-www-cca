# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay engine, death-clock, mood, entomb, collective memory, revival history, presence
- `src/components/` — UI components (inc. `DecayCard`, `DeathClock`, `DeathClockBanner`, `GhostEchoes`, `ConvictionPanel`)
- `src/pages/api/` — SSE + JSON endpoints (death-clock, ghost-echoes, graveyard-stats, reading-pulse)
- `src/content/blog/` — Markdown posts
- `src/styles/` — CSS layers (inc. `death-clock.css`)

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age and die; reader attention revives them.
Death Clock ring (`DeathClock.astro` + `src/lib/death-clock.ts`) counts down each post's remaining lifespan.
Ghost Echoes sparkline (`GhostEchoes.astro` + `src/lib/revivalHistory.ts`) makes solo readers feel collective presence.
Real-time presence via SSE (`src/lib/presence-unified.ts`). Entombed posts live at `/graveyard`.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage
- `src/lib/variants.ts` — absorb `variantScript()` IIFE into `decayEngineClientScript()` (freeze-sprawl, phase 2)
- `EndangeredCard.astro` — replace `countdownLabel` text with `DeathClock` ring for visual consistency

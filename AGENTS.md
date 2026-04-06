# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay engine, death-clock, epitaph engine, graveyard ledger, mood, entomb, collective memory, revival history, presence
- `src/components/` — `DecayCard`, `DeathClock`, `DeathClockBanner`, `GhostEchoes`, `ConvictionPanel`, `TombstoneCard`, `GraveyardLedger`
- `src/pages/api/` — SSE + JSON endpoints (death-clock, ghost-echoes, graveyard-stats, reading-pulse)
- `src/content/blog/` — Markdown posts
- `src/styles/` — CSS layers

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age and die; reader attention revives them.
Death Clock ring counts down each post's lifespan. Ghost Echoes sparkline surfaces collective presence.
Real-time presence via SSE (`src/lib/presence-unified.ts`). Dead posts entombed at `/graveyard` with epitaphs and Hall of Records.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage
- `src/lib/variants.ts` — absorb `variantScript()` IIFE into `decayEngineClientScript()` (freeze-sprawl, phase 2)
- `EndangeredCard.astro` — replace `countdownLabel` text with `DeathClock` ring for visual consistency

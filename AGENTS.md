# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay engine, death-clock, endangered, epitaph engine, graveyard ledger, mood, entomb, collective memory, revival history, presence
- `src/components/` — `DecayCard`, `EndangeredCard`, `DeathClock`, `GhostEchoes`, `ConvictionPanel`, `TombstoneCard`, `GraveyardLedger`
- `src/pages/api/` — SSE + JSON endpoints (death-clock, ghost-echoes, graveyard-stats, reading-pulse)
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan` days, `convictions`, `mood`, `echo`)
- `src/styles/` — CSS layers

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age and die; reader attention revives them.
DeathClock SVG ring counts down each post's lifespan (per-post `lifespan` frontmatter, default 365 days).
EndangeredCard shows ring + erosion bar when a post nears entombment. Ghost Echoes surfaces collective presence.
Real-time presence via SSE (`src/lib/presence-unified.ts`). Dead posts land at `/graveyard` with epitaphs + Hall of Records.
Author conviction modulates decay physics — `still-true` slows the clock, `wrong`/`abandoned` accelerates it.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage
- `src/lib/variants.ts` — dead code; safe to delete once `ageTier()` confirmed unused by all callers

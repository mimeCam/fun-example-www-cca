# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay engine, death-clock, endangered, epitaph engine, graveyard ledger, mood, entomb, collective memory, revival history, presence, revival-counter
- `src/components/` — `DecayCard`, `EndangeredCard`, `DeathClock`, `GhostEchoes`, `ConvictionPanel`, `TombstoneCard`, `GraveyardLedger`, `RevivalCounter`, `KeepButton`
- `src/pages/api/` — SSE + JSON endpoints (death-clock, ghost-echoes, graveyard-stats, reading-pulse, revive, heartbeat)
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan` days, `convictions`, `mood`, `echo`)

## Core Feature

**Temporal Decay + Collective Memory** — posts visually age and die; reader attention revives them.
DeathClock SVG ring counts down each post's lifespan. Reader revivals slow the decay and add days back.
`RevivalCounter` shows live collective count with odometer animation + days-gained banner (SSE-synced).
Dead posts land at `/graveyard`. Author conviction modulates decay — `still-true` slows it, `wrong`/`abandoned` accelerates it.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage

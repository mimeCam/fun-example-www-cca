# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay-engine, death-clock, collective-memory, revival-engine, revival-counter, revival-moment, heartbeat, session-token, keep-pact
- `src/components/` — `DecayCard`, `DeathClock`, `RevivalCounter`, `KeepButton`, `PactPanel`, `GhostEchoes`, `GraveyardLedger`
- `src/pages/api/` — `heartbeat` (SSE), `revive`, `graveyard-stats`, `reading-pulse`, `ghost-echoes`, `death-clock`
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan`, `convictions`, `mood`, `echo`)

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them via `KeepButton`. DeathClock SVG ring counts down lifespan; conviction modulates decay rate; dead posts land at `/graveyard`.

## WIP

- Physical device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage

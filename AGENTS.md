# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them. Author conviction scores are sealed before publish (SHA-256 hash chain, SQLite STRICT) and displayed above the fold. Dead posts land at `/graveyard`.

## Key Paths

- `src/lib/` — decay-engine, conviction-ledger, cold-start, collective-memory, revival-engine, death-clock, heartbeat, nav, temporal, batting-average
- `src/components/` — ConvictionHero, ConvictionMeter, DeathClock, DecayCard, KeepButton, GhostEchoes, SiteNav
- `src/pages/api/` — conviction-seal, conviction-audit, conviction-stats, cold-start-status, revive, entomb, heartbeat (SSE)
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan`, `convictions`, `mood`, `echo`)
- `cli/` — seal-conviction.mjs (run on all posts before ConvictionMeter goes live)

## WIP

- **P0 — Data**: `node cli/seal-conviction.mjs` must run on all 6 posts; ConvictionMeter shows cold until then
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Verify `reader_events` table migration on existing `revivals.db`

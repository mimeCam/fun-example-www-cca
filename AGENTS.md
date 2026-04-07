# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them. Author conviction scores are sealed before publish (SHA-256 hash chain, SQLite STRICT). Reviving a post prompts the reader to record their adversarial stance; live tension score surfaces disagreement as social signal.

## Key Paths

- `src/lib/` — decay-engine, conviction-ledger, cold-start, collective-memory, revival-engine, death-clock, heartbeat, stance-ledger, tension-score
- `src/components/` — ConvictionHero, ConvictionMeter, DeathClock, DecayCard, KeepButton, GhostEchoes, StanceDrawer, TensionBadge
- `src/pages/api/` — conviction-seal, conviction-audit, revive, entomb, stance, heartbeat (SSE)
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan`, `convictions`, `mood`, `echo`)
- `cli/` — seal-conviction.mjs

## WIP

- **P0 — Data**: `node cli/seal-conviction.mjs` must run on all 6 posts; ConvictionMeter shows cold until then
- Graveyard cause-of-death labels
- TensionBadge inside ConvictionHero block
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Verify `reader_events` table migration on existing `revivals.db`

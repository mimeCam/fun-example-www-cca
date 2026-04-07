# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them. Author conviction scores are sealed before publish (SHA-256 hash chain, SQLite STRICT). Reader adversarial stances surface live tension as social signal.

## Key Paths

- `src/lib/` — decay-engine, conviction-ledger, tension-score, live-conviction-hero, stance-ledger, revival-engine, heartbeat (SSE)
- `src/components/` — ConvictionHero (embeds TensionBadge + live countdown), DeathClock, StanceDrawer, DecayCard
- `src/pages/api/` — conviction-seal, conviction-audit, revive, entomb, stance, heartbeat
- `src/content/blog/` — Markdown posts (`lifespan`, `convictions`, `mood`, `echo` frontmatter)
- `cli/` — seal-conviction.mjs

## WIP

- **P0 — Data**: `node cli/seal-conviction.mjs` must run on all 6 posts; ConvictionMeter shows cold until then
- Graveyard cause-of-death labels
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Verify `reader_events` table migration on existing `revivals.db`

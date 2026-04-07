# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them. Author conviction scores are sealed before publish (HMAC-verified, SQLite). Reader adversarial stances surface live tension as social signal.

## Key Paths

- `src/lib/` — decay-engine, conviction-ledger, tension-score, live-conviction-hero, stance-ledger, revival-engine, heartbeat (SSE)
- `src/components/` — ConvictionHero, AdminSealForm, DeathClock, StanceDrawer, DecayCard
- `src/pages/` — admin.astro (conviction seal dashboard), blog/[slug], graveyard, now
- `src/pages/api/` — conviction-seal (cookie + body auth), conviction-audit, revive, entomb, stance, heartbeat
- `src/content/blog/` — Markdown posts
- `cli/` — seal-conviction.mjs

## WIP

- **P0.5** — Run seal on all 6 posts via `/admin` (ADMIN_SECRET env required)
- Verify `reader_events` table migration on live `revivals.db`
- Graveyard cause-of-death labels
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G

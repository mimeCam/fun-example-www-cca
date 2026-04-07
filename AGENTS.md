# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them. Author conviction scores are sealed before publish (SHA-256 hash chain, SQLite STRICT) and displayed above the fold. Dead posts land at `/graveyard`.

## Key Paths

- `src/lib/` — decay-engine, conviction-ledger, cold-start, collective-memory, revival-engine, death-clock, heartbeat, nav, temporal
- `src/components/` — ConvictionHero, DeathClock, DecayCard, KeepButton, GhostEchoes, SiteNav
- `src/pages/` — index (The Field), now (Author Signal), blog/[slug] (The Sealed Bet), graveyard (Hall of Memory)
- `src/pages/api/` — conviction-seal, conviction-audit, cold-start-status, revive, entomb, heartbeat (SSE)
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan`, `convictions`, `mood`, `echo`)
- `cli/` — seal-conviction.mjs (seal posts at publish time)

## Sitemap

```
/            ← The Field: living posts, decay visible
/now         ← Author's living signal: NowLine + Murmurs
/blog/[slug] ← The Sealed Bet: ConvictionHero above fold
/graveyard   ← Hall of Memory: entombed posts
```

## WIP

- **P0**: `node cli/seal-conviction.mjs` on all 6 existing posts — ConvictionHero renders empty without sealed conviction data
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Verify `reader_events` table migration on existing `revivals.db`

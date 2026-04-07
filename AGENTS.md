# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — decay-engine, conviction-ledger, collective-memory, revival-engine, death-clock, heartbeat
- `src/components/` — ConvictionDeclaration, ConvictionAuditTrail, DecayCard, DeathClock, KeepButton, PactPanel, GhostEchoes
- `src/pages/api/` — conviction-seal, conviction-audit, revive, entomb, heartbeat (SSE)
- `cli/` — seal-conviction.mjs (seal posts at publish time)
- `src/content/blog/` — Markdown posts (frontmatter: `lifespan`, `convictions`, `mood`, `echo`)

## Core Feature

**Temporal Decay + Collective Memory** — posts age and die; readers revive them. DeathClock SVG ring counts down lifespan; conviction modulates decay rate; dead posts land at `/graveyard`. Author conviction scores are cryptographically sealed (SHA-256 hash chain, SQLite STRICT) and displayed above the fold — readers can audit the full chain at `GET /api/conviction-audit?slug=...`.

## WIP

- Run `node cli/seal-conviction.mjs` on existing posts to backfill conviction scores
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G throttle
- Lighthouse CLS pass on homepage
- Tanya §UX: `/now` page extraction (move NowLine + Murmurs from homepage)

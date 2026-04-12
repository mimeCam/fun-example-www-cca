**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥1 resolved verdict.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, OTS/RFC 3161 clients, seal-phases state machine
- `src/components/` — UI layer: cards, drawers, ceremonies (ConvictionSeal, NotarizeStamp), badges, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/tokens.css` — design tokens · `src/styles/motion.css` — keyframes · `src/styles/atmosphere.css` — stage palette

## WIP

- [wip] Seal posts via `/admin` to activate TrustBadge + batting average
- [wip] Set `GITHUB_PAT` in `.env` (gist scope) for Conviction Anchor on `/track-record`
- [wip] Offline-verifiable `/audit/[slug]` page with raw DER bytes + openssl commands
- [wip] OTS observability cron + alerting

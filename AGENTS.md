**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute, conviction ledger, OTS/RFC 3161, seal-phases, batting average, author-token, cron
- `src/lib/client/` — client-side animation orchestrators and sensory utilities
- `src/components/` — UI cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/tokens.css` — master design token registry (single source of truth)
- `scripts/` — dev tooling; `npm run lint:tokens` checks CSS token compliance

## Env

`ADMIN_SECRET` (req) · `HMAC_SECRET` (req) · `GITHUB_PAT` (opt) · `RFC3161_URL` (opt)

## WIP

None.

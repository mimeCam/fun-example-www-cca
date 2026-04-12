**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, OTS/RFC 3161 clients, seal-phases state machine, batting average adapter, author-token, cron
- `src/lib/og/` — OG image pipeline
- `src/lib/client/` — sensory (audio/haptic) clients
- `src/components/` — UI cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/tokens.css` — master design token registry (single source of truth)
- `src/styles/` — card geometry (`card-base.css`), motion, atmosphere
- `scripts/check-token-compliance.ts` — CSS raw-value linter (`npm run lint:tokens`)

## Env

`ADMIN_SECRET` (req) · `HMAC_SECRET` (req) · `GITHUB_PAT` (opt) · `RFC3161_URL` (opt)

## WIP

- **Nav overflow pill** (P2) — collapse Community + overflows to `···` pill at 768 px — stub exists, not started.

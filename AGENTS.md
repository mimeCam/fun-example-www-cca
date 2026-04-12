**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, OTS/RFC 3161 clients, seal-phases state machine, batting average adapter, author-token (capability tokens), cron scheduler + jobs; OG pipeline at `src/lib/og/`
- `src/components/` — UI cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/` — design tokens (`tokens.css`), shared card geometry (`card-base.css`), motion, atmosphere

## Env

`ADMIN_SECRET` (req) · `HMAC_SECRET` (req) · `GITHUB_PAT` (opt, gist scope) · `RFC3161_URL` (opt, timestamp authority)

## WIP

- `src/lib/seal-receipt.ts` — Satori OG receipt card (title · seal date · RFC3161 hash · batting avg snapshot); wires into `src/lib/og/`
- Cold-start empty state: ghost timeline + "Seal your first conviction" CTA on track-record page
- Tanya's shadow E1–E4 system in `tokens.css` + `card-base.css`
- Sticky stance bar on blog posts (reposition `DisputeChallenge.astro`)

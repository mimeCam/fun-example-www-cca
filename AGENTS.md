**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, OTS/RFC 3161 clients, seal-phases state machine, batting average adapter, author-token, cron; OG pipeline at `src/lib/og/`; sensory clients at `src/lib/client/`
- `src/components/` — UI cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/` — design tokens (`tokens.css`), shared card geometry (`card-base.css`), motion, atmosphere
- `scripts/` — `check-token-compliance.ts` lints CSS for raw values (`npm run lint:tokens`)

## Env

`ADMIN_SECRET` (req) · `HMAC_SECRET` (req) · `GITHUB_PAT` (opt) · `RFC3161_URL` (opt)

## WIP

- `seal-ceremony.css` + `motion.css` have pre-existing raw `rgba()` failing `lint:tokens` — not our debt.
- `ConvictionSeal.astro` ~800 LOC — split into per-phase files next sprint (Elon §refactor).
- Nav surgery: 3 primary links + overflow pill — Tanya §2 — next session.

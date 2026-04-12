**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute, conviction ledger, OTS/RFC 3161, seal-phases, batting average, author-token, cron; `client/` holds animation orchestrators + sensory
- `src/lib/client/frame-scheduler.ts` — master RAF singleton (priority buckets, FPS watchdog, battery saver); all animations route through this
- `src/components/FrameSchedulerProvider.astro` — bootstraps RAF in `<head>`; must precede all animation islands
- `src/components/` — UI cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/tokens.css` — master design token registry (single source of truth)
- `scripts/check-token-compliance.ts` — CSS raw-value linter (`npm run lint:tokens`)

## Env

`ADMIN_SECRET` (req) · `HMAC_SECRET` (req) · `GITHUB_PAT` (opt) · `RFC3161_URL` (opt)

## WIP — Seal Ceremony Consolidation (Phase 2)

- Delete `ConvictionSealCeremony.astro` → `SealCeremony variant="conviction"` (update `admin.astro`)
- Delete `ConvictionSeal.astro`, `ConvictionSealDisplay.astro`, `SealReceipt.astro` → inline into `SealCeremony.astro`

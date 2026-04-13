**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute, conviction ledger, OTS/RFC 3161, seal-phases, batting average, author-token, cron; `client/` holds animation orchestrators + sensory
- `src/lib/client/frame-scheduler.ts` — master RAF singleton; all animations route through this
- `src/components/` — UI cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/tokens.css` — master design token registry (single source of truth)
- `scripts/check-token-compliance.ts` — CSS raw-value linter (`npm run lint:tokens`)

## Env

`ADMIN_SECRET` (req) · `HMAC_SECRET` (req) · `GITHUB_PAT` (opt) · `RFC3161_URL` (opt)

## BA Cold-Start Progress System (shipped 2026-04-13)

`src/components/BattingAverageUnlockProgress.astro` — 5-dot progress track + mechanic explainer (SSR-only).  
`src/components/TrophyTierLadder.astro` — Bronze→diamond preview strip; dimmed until unlock.  
`src/styles/ba-unlock-progress.css` — token-compliant dot + ladder styling.  
`src/lib/client/ba-unlock-progress.ts` — SSE `verdict:declared` → dot fill orchestrator; fires `bah:unlock` at 5th resolve.  
`BattingAverageHero.astro` modified — imports new components in cold path; hidden `.bah-live` pre-rendered for DOM swap; `bah:unlock` listener drives fade-out + spring-in reveal.  
`BattingAverageChip.astro` modified — inline SVG mini-dots in provisional state (1–4 verdicts).  
`src/styles/batting-average.css` — added `.ba-locked--unlocked` spring-in animation.  
`src/styles/tokens.css` — added `--ba-dot-*` and `--tier-ladder-*` token families.

`npm run lint:tokens` ✅ · `npm run build` ✅ · No new routes · No schema changes.

## Seal Ceremony

`src/components/SealCeremony.astro` — two variants (`self` / `conviction`), sealed display branch (zero JS).  
`src/components/SealReceipt.astro` — trophy artifact at ceremony end; populated via `data-*` slots by `SealCeremony` JS.  
`src/styles/seal-receipt.css` — certificate visual language for receipt card.  
DB orchestration lives in callers (`admin.astro`, `blog/[slug].astro`), never in components.

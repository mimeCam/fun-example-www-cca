**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥1 resolved verdict.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, RFC 3161 + OTS clients
- `src/components/` — ConvictionSeal, KeepButton, VerdictReveal, BattingAverageHero, DecayBar, OpenLoopCard
- `src/pages/api/` — conviction-seal, ots-upgrade, verdict-resolve, revive, verdict-dispute, deadline-sweep
- `src/styles/tokens.css` — design tokens · `src/styles/motion.css` — keyframes + duration scale

## WIP

- Seal posts via `/admin` to activate TrustBadge + batting average
- Set `GITHUB_PAT` in `.env` (gist scope) for Conviction Anchor on `/track-record`
- Sitemap consolidation: redirect `/endangered` + `/graveyard` to main feed with `?stage=` filter

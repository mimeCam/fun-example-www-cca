**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥1 resolved verdict.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, RFC 3161 + OTS clients, river-data
- `src/components/` — ConvictionSeal, KeepButton, VerdictReveal, BattingAverageHero, DecayBar, OpenLoopCard, StagePill, RiverFilter
- `src/pages/api/` — conviction-seal, ots-upgrade, verdict-resolve, revive, verdict-dispute, deadline-sweep, stage-counts
- `src/styles/tokens.css` — design tokens · `src/styles/motion.css` — keyframes + duration scale · `src/styles/river-filter.css` — stage pill rail

## WIP

- Pagination for graveyard stage once post count > 20
- Seal posts via `/admin` to activate TrustBadge + batting average
- Set `GITHUB_PAT` in `.env` (gist scope) for Conviction Anchor on `/track-record`

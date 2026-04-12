**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥1 resolved verdict.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, RFC 3161 + OTS clients, river-data, pagination
- `src/components/` — ConvictionSeal, KeepButton, BloomParticles, VerdictReveal, BattingAverageHero, DecayBar, OpenLoopCard, StanceDrawer, StagePill, RiverFilter, Pagination, TombstoneCard, VerdictCard
- `src/pages/api/` — conviction-seal, ots-upgrade, verdict-resolve, revive, verdict-dispute, deadline-sweep, stage-counts, graveyard-page
- `src/styles/tokens.css` — design tokens · `src/styles/motion.css` — keyframes + duration scale · `src/styles/atmosphere.css` — stage palette shifts
- `src/lib/atmosphere.ts` — client-side atmosphere controller (`body[data-atmosphere]` mutations)
- `src/lib/ceremony-atmosphere.ts` — ceremony lifecycle → atmosphere mapping

## WIP

- [wip] Seal posts via `/admin` to activate TrustBadge + batting average
- [wip] Set `GITHUB_PAT` in `.env` (gist scope) for Conviction Anchor on `/track-record`
- [wip] DecayCard shadow transitions (500ms deliberate ease-in-out between stages)
- [wip] BattingAverageHero live % count-up ceremony (spring easing on verdict resolution)
- [wip] StanceDrawer semantic button colors per stance (agree/torn/disagree stance-specific color tokens)

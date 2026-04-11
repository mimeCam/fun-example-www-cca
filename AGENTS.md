**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥1 resolved verdict.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, RFC 3161 + OTS clients, river-data, pagination
- `src/components/` — ConvictionSeal, KeepButton, VerdictReveal, BattingAverageHero, DecayBar, OpenLoopCard, StagePill, RiverFilter, Pagination, TombstoneCard, VerdictCard
- `src/pages/api/` — conviction-seal, ots-upgrade, verdict-resolve, revive, verdict-dispute, deadline-sweep, stage-counts, graveyard-page
- `src/styles/tokens.css` — design tokens · `src/styles/motion.css` — keyframes + duration scale

## WIP

- Seal posts via `/admin` to activate TrustBadge + batting average
- Set `GITHUB_PAT` in `.env` (gist scope) for Conviction Anchor on `/track-record`
- P1: Migrate remaining hardcoded rgba → token in StanceDrawer, DisputeTally, VerdictCeremony, TrackRecord, TensionBadge, dispute.css
- P1: Section break standardisation, stage-transition atmosphere palette shift
- P2: BattingAverageHero cold-state ghost progress indicator, share button glow-on-confirm

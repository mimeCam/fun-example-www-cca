Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST); community disputes within 72h → upheld/overturned; batting average unlocks at ≥1 resolved verdict.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, batting average, RFC 3161 client
- `src/components/` — ConvictionSeal (unified seal ceremony), KeepButton, VerdictReveal, BattingAverageHero, DecayBar, DecayClock, DisputeTally
- `src/pages/api/` — conviction-seal, verdict-resolve, revive, verdict-dispute, deadline-sweep
- `src/styles/tokens.css` — design token registry (fonts, colors, spacing, motion)
- `src/styles/seal-ceremony.css` — five-phase seal ceremony animations

## WIP

- Seal posts via `/admin` to activate TrustBadge + batting average
- Set `GITHUB_PAT` in `.env` (gist scope) for Conviction Anchor on `/track-record`
- Nav reduction to 4 items
- OpenTimestamps (replace FreeTSA)

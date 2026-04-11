Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST); verdicts close the accountability loop; community can dispute within 72h window → upheld/overturned; batting average gated until ≥3 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, batting average, RFC 3161 client
- `src/components/` — KeepButton, VerdictReveal, BattingAverageHero, DisputeTally, EndangeredFeed
- `src/pages/api/` — conviction-seal, verdict-resolve, revive, verdict-dispute, deadline-sweep
- `src/styles/tokens.css` — master design token registry (fonts, colors, spacing, motion)

## WIP

- Seal all 6 posts via `/admin` — TrustBadge goes green; verdicts needed to activate batting average
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor in /track-record
- `ErosionBar` + `FreshnessIndicator` → consolidate to `DecayBar` (Tanya P0)
- `DeathClock` + `DeadlineClock` → consolidate to `DecayClock` (Tanya P0)
- Nav reduction to 4 items (Tanya P0) — currently has extra routes
- OpenTimestamps (replace FreeTSA) — next ~500 LOC scope

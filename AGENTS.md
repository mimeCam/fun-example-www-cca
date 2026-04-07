Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC) at publish; readers challenge. Verdicts close the accountability loop and drive a public batting average anchored to a public GitHub Gist for tamper-evidence.

## Key Paths

- `src/lib/` — decay, conviction-ledger, conviction-anchor, verdict-resolver, verdict-dispute, deadline-clock, batting-average, prediction-engine
- `src/lib/client/` — live-conviction (SSE → rAF tween), verdict-reveal
- `src/lib/og/` — OG card pipeline
- `src/components/` — AuditReceipt, ConvictionMeter, VerdictCeremony, VerdictCard, PredictionVault, DisputeChallenge
- `src/pages/api/` — conviction-seal, verdict-resolve, verdict-dispute, deadline-sweep, seal-prediction, og/*.png
- `src/pages/verdict/` — ceremony pages at `/verdict/[slug]`
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required) — audit pages show "NOT YET SEALED" until done
- Seal verdicts for resolved posts — batting average stays `cold` until first verdict sealed
- Verify `reader_events` table migration on live `revivals.db`
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G
- Set `GITHUB_PAT` in `.env` (gist scope) then re-seal posts via `/admin` to activate Conviction Anchor

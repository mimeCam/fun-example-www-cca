Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC) at publish; verdicts close the accountability loop; public batting average anchored to a GitHub Gist for tamper-evidence.

## Key Paths

- `src/lib/` — decay, conviction-ledger, verdict-resolver, verdict-dispute, batting-average, prediction-engine, deadline-clock
- `src/lib/client/` — live-conviction (SSE→rAF), verdict-reveal, river (60s decay tick)
- `src/lib/og/` — OG card pipeline (`battingAverageLayout.ts` for share card)
- `src/components/BattingAverageHero.astro` — Zone 1 conviction hero (homepage above fold)
- `src/components/RiverFilter.astro` — verdict filter tabs (all/correct/wrong/pending, URL-param state)
- `src/pages/map.astro` — Conviction River at `/map`
- `src/pages/verdict/[slug].astro` — verdict ceremony pages
- `src/pages/api/` — conviction-seal, verdict-resolve, verdict-dispute, deadline-sweep, og/*.png
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required)
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor
- Verify `reader_events` table migration on live `revivals.db`
- Zone 3 (River preview on homepage): deferred until ≥15 posts
- Verdict Wall dual filter rows: deferred to next session
- Add pagination to homepage once post count exceeds ~20

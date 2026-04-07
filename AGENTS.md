Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

# About you
Pragmatic ghostwriter. Dry wit. No fluff, no corporate speak — find the story in the code and tell it straight. *"Every sentence earns its place."*

---

# Persona Blog

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts age on a decay clock; readers revive them. Author seals conviction (HMAC) at publish; readers challenge. Verdicts close the accountability loop and drive a public batting average.

## Key Paths

- `src/lib/` — decay, conviction-ledger, verdict-resolver, verdict-dispute, deadline-clock, deadline-enforcer, batting-average, prediction-engine, stance-ledger
- `src/lib/client/` — live-conviction (SSE → rAF counter tween), verdict-flash (ephemeral verdict banner)
- `src/lib/og/` — accountability OG card pipeline (data contract, Satori layout, renderer)
- `src/components/` — VerdictResolutionPanel, ConvictionMeter, DeadlineClock, PredictionVault, DisputeChallenge
- `src/pages/` — index, blog/[slug], graveyard, now, admin, audit/[slug], verdict, predictions
- `src/pages/api/` — conviction-seal, verdict-resolve, verdict-dispute, deadline-sweep, seal-prediction, og/[slug].png, og/home.png
- `src/content/blog/` — Markdown posts (\`predictions[]\` frontmatter)
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via \`/admin\` (ADMIN_SECRET required) — audit pages show "NOT YET SEALED" until done
- Seal verdicts for resolved posts — batting average stays \`cold\` until first verdict sealed
- Seal prediction verdicts via \`POST /api/seal-prediction\` (ADMIN_SECRET required)
- Verify \`reader_events\` table migration on live \`revivals.db\`
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G

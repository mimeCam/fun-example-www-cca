Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST) at publish; verdicts close the accountability loop; public batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay, conviction-ledger, verdict-resolver, batting-average, track-record, rfc3161-client/verifier, timestamp-store
- `src/lib/client/` — live-conviction (SSE), verdict-reveal, river (decay tick)
- `src/pages/api/` — conviction-seal, verdict-resolve, trust-verify/[slug]
- `src/pages/track-record.astro` — authoritative ledger (Act I hero · Act II table · Act III sparkline)
- `src/pages/verdict.astro` — conviction-outcome wall (correct/wrong/pending filters, stats bar)
- `src/pages/audit/` — conviction proof page
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required) — TrustBadge goes green; /track-record sparkline activates once verdicts resolve
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor in /track-record ledger
- Zone 3 (River preview on homepage): deferred until ≥15 posts
- Paginate homepage once post count exceeds ~20

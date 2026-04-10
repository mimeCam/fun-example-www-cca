Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST) at publish; verdicts close the accountability loop; public batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay, conviction-ledger, verdict-resolver, batting-average, track-record, rfc3161-client/verifier, timestamp-store, communityPosts
- `src/lib/client/` — live-conviction (SSE), verdict-reveal, river (decay tick)
- `src/pages/api/` — conviction-seal, verdict-resolve, trust-verify/[slug], submit-post
- `src/pages/author/` — /author landing + /author/submit PoW wizard
- `src/pages/community/` — SSR community post listing
- `src/pages/track-record.astro` — authoritative ledger
- `src/pages/verdict.astro` — conviction-outcome wall
- `src/pages/audit/` — conviction proof page
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `public/llms.txt` — machine-readable posting protocol (humans + AI agents)
- `public/pow-worker.js` — Web Worker: WebCrypto SHA-256 nonce miner
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required) — TrustBadge goes green; /track-record sparkline activates once verdicts resolve
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor in /track-record ledger
- Zone 3 (River preview on homepage): deferred until ≥15 posts
- Paginate homepage once post count exceeds ~20
- `/community/[slug]` detail pages + Markdown rendering for community post bodies
- Wire community posts into the decay engine (currently static, no revival counter)

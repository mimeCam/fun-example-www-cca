Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST); verdicts close the accountability loop; batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay-engine, mood-simple, conviction-ledger, verdict-resolver, batting-average, track-record, rfc3161-client/verifier, timestamp-store, communityPosts, wall, now
- `src/lib/client/` — live-conviction (SSE), verdict-reveal, river (decay tick)
- `src/pages/api/` — conviction-seal, verdict-resolve, trust-verify/[slug], submit-post
- `src/styles/tokens.css` — master design token registry (color, type, spacing, radius, shadow, z-index)
- `src/styles/motion.css` — easing functions, duration scale, shared @keyframes
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `public/pow-worker.js` — Web Worker: WebCrypto SHA-256 nonce miner
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Map legacy article moods (contemplative, etc.) → closest simple mood (warm/sharp/raw)
- Seal all 6 posts via `/admin` — TrustBadge goes green; /track-record sparkline activates once verdicts resolve
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor in /track-record
- `/community/[slug]` detail pages + Markdown rendering for community post bodies
- Wire community posts into decay engine (currently static, no revival counter)
- Tokenize death-clock.css, verdict.css, graveyard.css; update SiteNav + DecayCard `<style>` blocks to reference motion tokens

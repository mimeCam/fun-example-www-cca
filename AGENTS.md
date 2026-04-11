Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST); verdicts close the accountability loop; batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay-engine, communityPosts, conviction-ledger, verdict-resolver, batting-average, rfc3161-client/verifier, timestamp-store
- `src/lib/client/` — live-conviction (SSE), verdict-reveal, river (decay tick)
- `src/pages/api/` — conviction-seal, verdict-resolve, revive, submit-post
- `src/pages/community/` — index (decay wall), [slug] (detail + KeepButton), submit (→ /author/submit)
- `src/styles/tokens.css` — master design token registry
- `src/styles/motion.css` — easing functions, duration scale, shared @keyframes
- `public/pow-worker.js` — Web Worker: WebCrypto SHA-256 nonce miner
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- `/community/submit` canonical URL established; content move from `/author/submit` pending
- Map legacy article moods (contemplative, etc.) → closest simple mood (warm/sharp/raw)
- Seal all 6 posts via `/admin` — TrustBadge goes green; /track-record sparkline activates once verdicts resolve
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor in /track-record
- Load IBM Plex Mono for numeric display contexts (batting %, score numerals, hash displays)

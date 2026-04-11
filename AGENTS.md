Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST); verdicts close the accountability loop; batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay-engine, communityPosts, conviction-ledger, verdict-resolver, batting-average, rfc3161-client/verifier, timestamp-store, dispute-quorum
- `src/lib/client/` — revival-orchestrator (state machine + CSS bus), revival-ceremony (PactPanel, keep until pact migrated), cascade-bloom, haptics, live-conviction (SSE), verdict-reveal, river
- `src/pages/api/` — conviction-seal, verdict-resolve, revive, submit-post, verdict-dispute, dispute-sse, endangered (JSON feed), endangered-sse (live SSE delta stream)
- `src/components/` — KeepButton (SVG arc hold-to-revive), DisputeChallenge, DisputeTally, DisputeQuorum, EndangeredBand, EndangeredFeed
- `src/pages/community/` — index (decay wall), [slug] (detail + KeepButton), submit (→ /author/submit)
- `src/pages/endangered.astro` — urgency-ranked discovery feed (SSR + live SSE)
- `src/styles/tokens.css` — master design token registry (fonts, colors, spacing, motion)
- `public/pow-worker.js` — Web Worker: WebCrypto SHA-256 nonce miner
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- `/community/submit` canonical URL established; content move from `/author/submit` pending
- Map legacy article moods (contemplative, etc.) → closest simple mood (warm/sharp/raw)
- Seal all 6 posts via `/admin` — TrustBadge goes green; /track-record sparkline activates once verdicts resolve
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor in /track-record
- `ErosionBar` + `FreshnessIndicator` duplicate components — cleanup ticket open

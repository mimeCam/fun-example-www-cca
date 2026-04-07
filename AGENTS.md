Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST) at publish; verdicts close the accountability loop; public batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay, conviction-ledger, verdict-resolver, batting-average, prediction-engine, deadline-clock; rfc3161-client (FreeTSA), rfc3161-verifier (genTime), timestamp-store (tst_* on conviction_ledger)
- `src/lib/client/` — live-conviction (SSE→rAF), verdict-reveal, river (60s decay tick)
- `src/pages/api/` — conviction-seal, verdict-resolve (both stamp RFC 3161 TST)
- `src/pages/audit/` — conviction proof page (TST + openssl verify command)
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- TODO (rfc3161-verifier.ts): install pkijs + validate CMS SignedData sig against FreeTSA CA cert
- TODO (TrustBadge.astro): show badge on blog post pages (currently prerendered; needs SSR or API)
- Seal all 6 posts via `/admin` (ADMIN_SECRET required)
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor
- Zone 3 (River preview on homepage): deferred until ≥15 posts
- Verdict Wall dual filter rows: deferred to next session
- Add pagination to homepage once post count exceeds ~20

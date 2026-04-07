Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 TST) at publish; verdicts close the accountability loop; public batting average anchored to GitHub Gist + external timestamp authority for tamper-evidence.

## Key Paths

- `src/lib/` — decay, conviction-ledger, verdict-resolver, batting-average, prediction-engine, deadline-clock; rfc3161-client (FreeTSA), rfc3161-verifier (CMS SignedData via pkijs), timestamp-store (tst_* on conviction_ledger)
- `src/lib/client/` — live-conviction (SSE→rAF), verdict-reveal, river (60s decay tick)
- `src/pages/api/` — conviction-seal, verdict-resolve (both stamp RFC 3161 TST), trust-verify/[slug] (live re-verify)
- `src/pages/audit/` — conviction proof page (TST + openssl verify command)
- `src/assets/freetsa-ca.der` — FreeTSA root CA cert (DER) used by rfc3161-verifier for chain validation
- `src/content/blog/` — Markdown posts (`predictions[]` frontmatter)
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required) — TrustBadge renders green lock once sealed
- Set `GITHUB_PAT` in `.env` (gist scope) to activate Conviction Anchor
- Zone 3 (River preview on homepage): deferred until ≥15 posts
- Verdict Wall dual filter rows: deferred to next session
- Add pagination to homepage once post count exceeds ~20

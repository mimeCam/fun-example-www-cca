**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average.

## Paths

- `src/lib/` — domain logic (decay engine, verdict, seals, batting average, OG images)
- `src/components/` — UI layer
- `src/pages/api/` — REST API
- `src/styles/tokens.css` — design token source of truth (`npm run lint:tokens` guards compliance)
- `cli/` — CLI tools

## WIP

- Token compliance sweep — Tier 1 guard locked (8 files); ~531 violations remain (next: AuditReceipt, VerdictResolutionPanel, SealCeremony)
- Sitemap restructure — merge /predictions→/verdict, /track-record→/author/[slug]
- Blog detail surgery — consolidate bottom zones into single "Conviction Record" card
- Nav simplification — reduce to 2 primary links (posts, verdict)

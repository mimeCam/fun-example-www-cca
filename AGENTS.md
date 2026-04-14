**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average.

## Paths

- `src/lib/` — domain logic (decay engine, verdict, seals, batting average, OG images)
- `src/components/` — UI layer
- `src/pages/api/` — REST API
- `src/styles/` — design system (`tokens.css` is single source of truth)
- `scripts/` — dev tooling (token lint guard: `npm run lint:tokens`)
- `cli/` — CLI tools

## WIP

- Token compliance sweep — Tier 1 guard locked (8 files); ~530 violations in Tier 2+ (next: AuditReceipt, VerdictResolutionPanel, SealCeremony)
- Sitemap restructure — merge /predictions→/verdict, /track-record→/author/[slug]
- Blog detail surgery — consolidate bottom zones into single "Conviction Record" card
- Nav simplification — reduce to 2 primary links (posts, verdict)

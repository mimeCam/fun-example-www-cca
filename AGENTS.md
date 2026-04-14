**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average.

## Paths

- `src/lib/` — domain logic (decay, verdict, seals, batting average, OG image layouts)
- `src/lib/design-tokens.ts` — server-side color mirror for Satori OG renderer
- `src/components/` — UI layer
- `src/pages/api/` — REST API
- `src/styles/tokens.css` — design token registry (single source of truth)
- `scripts/` — dev tooling (`npm run lint:tokens`)

## WIP

- Token compliance sweep — 593 remaining rgba() violations across 40+ components
- Sitemap restructure — merge /predictions→/verdict, /track-record→/author/[slug]
- Blog detail surgery — consolidate bottom zones into single "Conviction Record" card

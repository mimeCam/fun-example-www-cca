**Stack:** Astro 4 · TypeScript · Tailwind CSS v4 · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average. Time is typography: the 5-stage decay grammar (`fresh → fading → endangered → ghost → fossil`) drives post-TTL visuals and author-record age (voice softens, record hardens).

## Paths

- `src/lib/` — domain logic; `client/` for browser-side modules
- `src/components/` — UI components
- `src/pages/api/` — REST API
- `src/styles/` — design system; `tokens.css` is the single source of truth for stage values
- `scripts/` — build tooling (token-compliance guard, codegen)

## Stage-token codegen

`src/lib/stage-tokens.generated.ts` mirrors `--stage-*` atoms from `tokens.css` for non-CSS surfaces (Satori OG). Edit `tokens.css`, then `npm run generate:stage-tokens`. The prebuild guard blocks builds if the mirror is stale.

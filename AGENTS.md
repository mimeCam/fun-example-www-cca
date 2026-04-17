**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average.

## Paths

- `src/lib/` — domain logic (decay, verdict, seals, batting average, OG images)
- `src/components/` — UI components
- `src/pages/api/` — REST API
- `src/styles/` — design system (tokens, surfaces, typography, motion)
- `scripts/` — build tooling (token compliance guard)
- `cli/` — CLI tools

## WIP

- Homepage hero — BattingAverageHero Zone 1 (warm/cold states)
- Blog detail — consolidate bottom zones into single "Conviction Record" card
- EndangeredFeed — reuse EndangeredCard component
- Typography migration — 258 WARN-level issues in unguarded files

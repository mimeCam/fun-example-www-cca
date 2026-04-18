**Stack:** Astro 4 · TypeScript · Tailwind CSS v4 · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average.

## Paths

- `src/lib/` — domain logic; `client/` for browser-side modules (`revival-gate.ts` = stage gate source of truth)
- `src/components/` — UI components
- `src/pages/api/` — REST API
- `src/styles/` — design system (tokens, stages, decay, ceremony)
- `scripts/` — build tooling (token compliance guard)

## WIP

- [wip] Verdict Seal Ceremony — integration tests for state machine pending.
- [wip] ConvictionRecord simplification (P1-A) — collapse to 3-zone layout. Separate sprint.

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average.

## Paths

- `src/lib/` — domain logic (`revival-gate.ts` = stage gate source of truth)
- `src/components/` — UI components
- `src/pages/api/` — REST API
- `src/styles/` — design system (tokens, stages, decay, keep-button)
- `scripts/` — build tooling

## WIP

- [wip] Verdict Seal Ceremony — 3-phase (deliberation → declaration → reckoning). Needs: integration tests, SSE live-update, share button
- [wip] ConvictionRecord simplification (P1-A) — collapse to 3-zone layout (button + evidence bar + collapsed audit). Separate sprint.

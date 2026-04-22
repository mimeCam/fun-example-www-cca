**Stack:** Astro 4 · TypeScript · Tailwind CSS v4 · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock — readers revive them. Authors seal conviction; community disputes → batting average. Time is typography: the 5-stage decay grammar (`fresh → fading → endangered → ghost → fossil`) drives both post-TTL visuals and — since v143 — author-record age (voice softens, record hardens).

## Paths

- `src/lib/` — domain logic; `client/` for browser-side modules (`revival-gate.ts` = stage gate source of truth; `record-stage.ts` = author-record-age classifier, shares DecayStage ontology)
- `src/components/` — UI components
- `src/pages/api/` — REST API
- `src/styles/` — design system (tokens, stages, decay, ceremony)
- `scripts/` — build tooling (token compliance guard)


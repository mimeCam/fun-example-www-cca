# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities (mood, nav, time, snapshot helpers)
- `src/components/` — Astro components
- `src/pages/api/` — SSR endpoints
- `src/data/` — JSON flat-file storage
- `cli/` — author CLI tools

## WIP

- **Shareable Mood Snapshots** — `?snap=<mood>.<phase>` URL encoding so shared
  links preserve atmosphere. Foundation in `snapshot.ts`; share button upgraded.
  Next: OG preview card generation, snapshot banner UI component.
- Ambient atmosphere — mood palettes, time-phase tints, seasonal drift, shimmer,
  erosion bar, celestial witness. Respects `prefers-reduced-motion`.
- Ambient drone — generative Web Audio, shifts with time/season.
- Living Now Page — three-tier temporal decay (`rightNow` → `season` → `residue`).
- Drift Navigation — `DriftNav` footer bar + shared `src/lib/nav.ts` route helpers.

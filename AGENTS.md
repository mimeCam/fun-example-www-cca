# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/pages/api/` — SSR endpoints
- `src/data/` — JSON flat-file storage
- `cli/` — author CLI tools

## WIP

- **Pulse Page** — `/pulse` showing open loops (decaying questions) + contradictions (disagreeing post pairs). Data: `src/data/pulse.json`. Shared logic: `src/lib/pulse.ts`. Nav registered. Next: page component (`src/pages/pulse.astro`), section components (`OpenLoops`, `Contradictions`, `FreshnessIndicator`).
- **Now Page Memory** — `/now/before` archive with geological eras. Next: permalink anchors, auto-archival at build time.
- **Mood Snapshots** — `?snap=` URL encoding. Next: OG preview, snapshot banner.
- Ambient atmosphere & drone — mood palettes, shimmer, generative Web Audio.
- Drift Navigation — `DriftNav` footer bar (pulse dot added).

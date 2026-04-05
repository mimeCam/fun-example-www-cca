# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Core Feature

**Decay-Aware Blog Feed** — posts visually age over time (opacity, blur, saturation fade). Hover revives them. The signature interaction. Built on `src/lib/decay.ts` → `src/styles/decay.css`.

## Key Paths

- `src/lib/` — shared utilities (decay, temporal, mood, pulse, postMeta)
- `src/components/` — Astro components
- `src/pages/api/` — SSR endpoints
- `src/data/` — JSON flat-file storage

## WIP

- **DecayCard component** — next: build `DecayCard.astro`, wire into homepage `index.astro`. Foundation (`decay.ts`, `decay.css`, `postMeta.ts` display data) is done.
- **Open Loop Pulse** — 3-zone lifecycle on `/pulse`, teaser on homepage.
- **Nav consolidation** — 5-item nav, secondary pages via DriftNav.

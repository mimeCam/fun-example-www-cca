# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Core Feature

**Decay-Aware Blog Feed** — posts visually age (opacity, blur, saturation). Hover revives them. `DecayCard.astro` renders each post with live decay CSS vars from `postMeta.ts` → `decay.ts` → `decay.css`.

## Key Paths

- `src/lib/` — shared utilities (decay, temporal, mood, pulse, postMeta)
- `src/components/` — Astro components (DecayCard is the signature card)
- `src/pages/api/` — SSR endpoints
- `src/data/` — JSON flat-file storage

## WIP

- **Open Loop Pulse** — 3-zone lifecycle on `/pulse`, teaser on homepage.
- **Nav consolidation** — 5-item nav, secondary pages via DriftNav.
- **DecayCard extras** — cover image slot, prev/next links (v2).

# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Core Feature

**Temporal Decay** — posts visually age (opacity, blur, saturation, shadow). Hover revives them. The decay pipeline: `src/lib/` → `src/styles/` → `src/components/DecayCard.astro`.

## Key Paths

- `src/lib/` — shared utilities (decay math, post metadata, mood, pulse)
- `src/components/` — Astro components
- `src/styles/` — decay CSS, global styles
- `src/pages/` — routes and API endpoints
- `src/data/` — JSON flat-file storage

## WIP

- Layout cleanup — remove floating overlays from BaseLayout.
- Page consolidation — reduce to 3 pages (blog, pulse, now) + RSS.
- Nav simplification — `blog | pulse | now` only.
- DecayCard extras — cover image slot, prev/next links (v2).

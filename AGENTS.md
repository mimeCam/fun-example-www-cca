# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Core Feature

**Temporal Decay** — posts visually age (opacity, blur, saturation, shadow). Hover/long-press revives them.

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/styles/` — styling and design tokens
- `src/pages/` — routes and API endpoints
- `src/data/` — JSON flat-file storage

## WIP

- Page consolidation — secondary pages need progressive disclosure hooks.
- DecayCard extras — cover image slot, prev/next links (v2).
- Mobile long-press — wired in, needs real-device testing.
- Post Constellation — data layer done, needs SVG renderer + layout integration.

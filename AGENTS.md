# Persona Blog

Astro 4 · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/styles/` — design tokens and global styles
- `src/pages/` — routes
- `src/content/blog/` — blog posts (frontmatter drives mood)
- `src/data/` — JSON flat-file storage

## Core Feature

Temporal Decay — posts visually age over time. Fresh posts float with deep shadows, old posts sink into the ground. Shadow depth is the primary age signal. Hover revives any card. The 3-second test: landing on the homepage, you should immediately notice posts are fading.

- Decay engine: `src/lib/decay.ts` → CSS custom properties
- Decay visuals: `src/styles/decay.css` → hover revival
- Time bands: `src/lib/timeBands.ts` → Now / Recent / Archive grouping

## WIP

- **Mood Simplification** — Old system (13 moods) being replaced with 3 moods (warm/sharp/raw). New engine: `src/lib/mood-simple.ts`. MoodDot component in nav: `src/components/MoodDot.astro`. Next: fully wire into BaseLayout, remove old MoodPills + radio machinery.
- **Route Pruning** — Target: cut constellations, wall, tidepool, lowtide, embers pages. Homepage already cleaned (PlanetariumWindow removed). Routes still exist, pending deletion.
- **Component Pruning** — Target: ~10 components. Many satellite components still present, pending removal after route pruning.

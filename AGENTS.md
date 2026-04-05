# Persona Blog

Astro 4 · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/styles/` — design tokens and global styles
- `src/pages/` — routes
- `src/content/blog/` — blog posts (frontmatter drives constellations)
- `src/data/` — JSON flat-file storage

## Core Feature

Constellations — force-directed star field where proximity = relatedness. Posts become stars; shared themes cluster visually. Zero client JS.

## WIP

- Force-layout tuning — attraction/repulsion constants may need adjustment with 20+ posts.
- Page consolidation — `/pulse`+`/wall` → `/now`, `/embers` → `/tidepool` (nav done, routes still separate).
- Constellation decay — dim older paths over time (TODO in constellation.ts).
- Mobile long-press revival — wired, needs real-device testing.

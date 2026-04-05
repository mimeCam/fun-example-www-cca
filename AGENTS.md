# Persona Blog

Astro 4 · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/styles/` — design tokens and global styles
- `src/pages/` — routes
- `src/content/blog/` — blog posts (frontmatter drives constellations)
- `src/data/` — JSON flat-file storage

## WIP

- Homepage time bands — needs 20+ posts to fully exercise Recent & Archive bands.
- Page consolidation — `/pulse`+`/wall` → `/now`, `/embers` → `/tidepool` (nav done, routes still separate).
- DecayCard v2 — cover image slot (schema field needed).
- Mobile long-press revival — wired, needs real-device testing.
- Constellation pipeline — posts declare stars via frontmatter; static JSON being phased out.

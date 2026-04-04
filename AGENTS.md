# Persona Blog

Astro 4 hybrid · Tailwind CSS v4 · TypeScript strict · @astrojs/node standalone · Docker

A personal site with temporal decay: content ages visually over time. Mood system (lo-fi/focus/hyperpop/jazz) drives CSS vars globally. Six content types: blog posts, wall (micro-thoughts), embers (shorter posts), now (status card), ghosts (abandoned ideas), tidepool (curated links). All data lives in flat JSON files. Zero client-side frameworks.

## Key Paths

- `src/lib/` — shared utilities (temporal decay engine, mood system, per-content-type logic)
- `src/data/` — JSON flat-file storage (wall, embers, ghosts, now, tidepool)
- `src/components/` — Astro components
- `src/pages/api/` — SSR endpoints
- `src/content/` — blog collection (Markdown)
- `src/layouts/` — page shells (BaseLayout)
- `cli/` — author CLI tools

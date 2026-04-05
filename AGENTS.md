# Persona Blog

Astro 4 hybrid · TypeScript strict · @astrojs/node standalone · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/components/` — Astro components
- `src/layouts/` — page shells
- `src/data/` — JSON flat-file storage
- `src/styles/` — CSS modules
- `src/pages/api/` — SSR endpoints
- `cli/` — author CLI tools

## WIP

- Ambient atmosphere stack (mood palettes, time-phase tints, seasonal drift,
  shimmer, dissolve, erosion bar, celestial witness) — all CSS custom properties,
  zero client framework, respects `prefers-reduced-motion`.
- Ambient audio drone — generative Web Audio synthesis shifts with time-of-day
  and season. Toggle button wired. DONE: cross-fade on phase boundary (4s smooth
  transition), visibility lifecycle (suspend/resume AudioContext), mood label API
  (`window.__drone.label()`). TODO: DroneToggle tooltip showing mood label,
  pulse animation when playing, play/pause icon states.

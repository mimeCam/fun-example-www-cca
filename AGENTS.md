# Persona Blog

Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

## Key Paths

- `src/lib/` — shared utilities
- `src/data/` — runtime configs
- `src/components/` — Astro components
- `src/pages/` — routes and API endpoints
- `data/` — runtime data (SQLite, JSON)

## Core Feature

Temporal Decay + Collective Memory — posts visually age; reader attention revives them. Decayed posts rest in `/graveyard`; readers can resurrect them.

## WIP

- Sympathetic Bloom Mobile — needs physical-device QA
- Dead code cleanup — orphaned old files (onboardProbe.ts, onboardHint.ts, revivalReward.ts, revivalToast.ts, FirstVisitWhisper.astro, whisperSequence.ts, whisperA11y.ts) pending deletion after deploy validation

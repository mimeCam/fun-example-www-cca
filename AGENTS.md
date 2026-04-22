**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis.

## Paths

- `src/lib/` — domain (`client/` = browser modules)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/tokens.css` — single source of truth for design tokens
- `scripts/` — compliance guards + codegen

## Killer feature — `/api/docs` cell citations

7×5 matrix. Cite a cell via click, keystroke (`c`/Enter/Space on focus), or `curl` — same payload (`?r=<nonce>` joins copy→arrive via ledger). Four client modules, DOM as shared contract: `cell-cite.ts`, `arrival.ts`, `matrix-keynav.ts`, `edge-bump.ts`.

## Build-time guards

Prebuild chain runs: token compliance (DECAY_STAGES / STAGE_AXES parity), motion sanctuary (`animation:` must neighbor `prefers-reduced-motion`), `.ds-kbd` rule-of-three, chip-lit fence on `arrival.ts`, plus node:test suites for keep-hotkey, legend parity, chip-lit normaliser, and arrival. All chained into `prebuild`, so Docker's `npm run build` fails fast on drift.

**Contracts to preserve:** legend chips ⇔ `isXKey` predicates · chip-lit fires only on user keystrokes (never on arrival) · `?r=<nonce>` lands a `.cell--arrived-shared` badge · zero new tokens without a PR note.

## Deferred

- **Triple-mode payload parity test** (Mike, `_reports/from-michael-koch-project-architect-48.md`). Architecturally blocked as a prebuild gate: `astro preview` requires `astro build` first. Revisit as a postbuild harness when CI can afford the spawn cost. The oracle (`cellCitationPayload` in `stage-axes.ts`) is already the single source every mouth routes through — the invariant holds even without the executable guard.

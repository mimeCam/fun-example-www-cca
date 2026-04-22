**Stack:** Astro 4 · TS · Tailwind v4 · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts decay on a clock; readers revive, authors seal, disputes → batting average. 5-stage grammar (`fresh → fading → endangered → ghost → fossil`) drives every axis.

## Paths

- `src/lib/` — domain (`client/` = browser)
- `src/components/`, `src/pages/api/` (docs at `/api/docs`)
- `src/styles/` — `tokens.css` single source of truth
- `scripts/` — compliance guards + codegen (shared scanners in `scripts/lib/`)

## Stage grammar — frozen

`src/lib/stage-axes.ts` is the single source for the seven axes. Prebuild guard enforces parity. **No 8th axis.**

## Killer feature — `/api/docs` cell citations

7×5 matrix. Cite a cell via click, keystroke (`c`/Enter/Space on focus), or `curl` — same payload (`?r=<nonce>` joins copy→arrive via ledger). Eight nav keys (Arrows + Home/End/PageUp/PageDown) rove the grid. Three client modules, DOM as shared contract:

- `cell-cite.ts` (citation + 1200 ms foveal confirm ring), `matrix-keynav.ts` (roving tabindex), `edge-bump.ts` (clamp feedback).

## Build-time guards

- `npm run lint:tokens` — token compliance + DECAY_STAGES / STAGE_AXES parity.
- `npm run lint:motion` — every `animation:` outside `prefers-reduced-motion` must neighbor one (escape hatch `/* motion-sanctuary: ok */`).
- `npm run test:cite-legend` / `test:nav-legend` / `test:keep-legend` — legend chips ↔ `isCiteKey` / `isNavKey` / `isKeepKey` parity.
- `npm run test:cell-confirm` — snapshot-locks the four confirm-beat durations; tune one, update the snapshot, explain in the PR.
- `npm run test:chip-lit` — v153 `keyToChipLabels` normaliser ↔ legend labels set-equality.
- `npm run check:ds-kbd` — zero `api-docs__kbd` stragglers; `.ds-kbd` defined once and used by both real consumers.

**Teaching contract (v152):** Legend chips teach active keys. If `isXKey` gains or loses a member, the legend updates in the same PR. Enforced by `test:X-legend` + `check:ds-kbd`.

**Chip-lit contract (v153):** When a user presses a key that has a visible `.ds-kbd` chip on screen, the matching chip lifts E0→E1 for `--motion-snap-duration` (120ms) — or for the duration of a hold on the keep key. Wired by `src/lib/client/ds-kbd-lit.ts` (one pure normaliser + two DOM toggles). If `keyToChipLabels` grows a new branch, `test:chip-lit` fails the build. Tokens: `--legend-leading`, `--legend-baseline-nudge`, `--legend-prose-docs`, `--legend-prose-overlay` (one `/* Legend voice */` block in `tokens.css`).

## Deferred

- **Triple-mode payload parity test** (Mike, `_reports/from-michael-koch-project-architect-48.md`). Architecturally blocked as a **prebuild** gate: `astro preview` requires `astro build` to have completed first. Revisit as a **postbuild** harness in v154+ when CI can afford the ~5s spawn cost. The oracle (`cellCitationPayload` in `stage-axes.ts`) is already the single source every mouth routes through — the invariant holds even without the executable guard.

All chained into `prebuild`, so Docker's `npm run build` fails fast on drift.

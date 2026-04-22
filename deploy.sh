#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v150c — Cited-Cell Round-Trip Ledger (2026-04-22)
#   Sprint: Close the TODO beacon loop from v150b. The citation ritual
#     now has causal telemetry: a copy mints a short nonce, bakes it into
#     the pasted URL as `?r=…`, and the arrival (hashchange + matching
#     `?r=`) POSTs an `arrive` event. The ratio of matched arrivals to
#     copies over a rolling 7-day window is the baseline number the next
#     cycle's polish-vs-pivot argument reads from. Pure code-quality +
#     one API pair — zero infrastructure changes.
#   Key changes:
#     src/lib/cell-event-ledger.ts (new) — the ledger. Single SQLite table
#       `cell_events(id, event, axis, stage, ref, ts, ua)` plus two
#       indexes (event+ts, ref). Pure functions only: `ensureSchema()`
#       (idempotent CREATE IF NOT EXISTS), `isValidEventRow()`,
#       `clampTimestamp()` (±1h server-trusted window), `record()` (INSERT
#       wrapper), `roundTripRatio()` (headline number, sub-ms on SQLite),
#       `baseline()` (one-shot snapshot: copies, arrivals, ratio, per-cell
#       grid). No parallel DB connection — piggybacks on collective-
#       memory's singleton via the new `sharedDatabase()` accessor. Mike
#       napkin §5: "A second definition of the metric in a SQL string is
#       where reality splits — keep it in code." So API and future
#       dashboard both read the single `ratio()` helper.
#     src/lib/cell-event-ledger.test.ts (new, dev-only) — node:test suite
#       over an in-memory `:memory:` DB (swapped via the new
#       `__setSharedDbForTests` hatch). Covers schema idempotency, valid-
#       cell product (7×5 = 35, no 36th), ref regex, ts clamp, ratio math
#       (incl. 0/0 → 0), baseline shape, matched-arrivals join semantics.
#       Run via: `node --test --import=tsx/esm src/lib/cell-event-ledger.test.ts`
#       NOT executed at Docker build or runtime.
#     src/lib/collectiveMemory.ts — two small exports added without
#       touching existing behaviour. `sharedDatabase()` returns the same
#       lazy singleton this file uses (sibling modules piggyback — no
#       parallel connection, no close(), one WAL). `__setSharedDbForTests`
#       is the test-only override hatch. No schema changes to existing
#       tables; `revivals.db` (under `/app/data`, mounted to SQLITE_VOLUME)
#       now additionally hosts the `cell_events` table after first access.
#     src/pages/api/ingest/cell-event.ts (new) — POST beacon endpoint.
#       Always returns 202 (fire-and-forget — Elon §4.6); validation
#       failures are logged server-side and swallowed. Accepts
#       `{ event: 'copy'|'arrive', axis, stage, ref, ts? }`, pins UA from
#       request headers (never client-supplied, Mike §3). GET/other
#       verbs → 405 with `Allow: POST`. Helpers each ≤10 lines.
#     src/pages/api/metrics/cited-cells.ts (new) — read-only GET snapshot.
#       Returns `{ window:{days,since}, copies, arrivals, roundTripRatio,
#       byCell[] }`. Rolling 7-day default; `?days=N` narrows to 1..30
#       (clamped). `Cache-Control: public, max-age=30` so tooling can
#       poll cheaply. POST/other verbs → 405 with `Allow: GET`.
#     src/lib/client/cell-cite.ts — replaces the v150b TODO no-op
#       `beacon()` with a real wire. `mintRef()` uses `crypto.randomUUID`
#       with a Math.random fallback (still REF_RE-safe). Copy path bakes
#       the ref into the clipboard payload via the updated
#       `cellCitationPayload(…, ref)`; arrival path reads `?r=` off
#       location.search, pairs it with `data-axis`/`data-decay-stage`
#       from the bloomed cell, and fires the `arrive` beacon.
#       `sendIngest()` prefers `navigator.sendBeacon` (survives unload)
#       with a `fetch({keepalive:true})` fallback. try/catch blanket
#       around the emit path — telemetry must never block the ritual.
#     src/lib/stage-axes.ts — `cellCitationPayload()` gains an optional
#       `ref` fourth argument. When present, emits
#       `${origin}/api/docs?r=${encodeURIComponent(ref)}#${anchor}`. When
#       absent, emits the legacy v150b shape verbatim (existing tests
#       pin that string — backward-compatible).
#     src/pages/api/docs.astro — new "Two endpoints." appendix section
#       documents POST /api/ingest/cell-event and GET /api/metrics/
#       cited-cells inline with the existing vocabulary page (API parity
#       vow: every public verb shows up here alongside the grammar it
#       uses). Pure SSR HTML — no new client scripts.
#     AGENTS.md — new "Cited-cell round-trip (v150c, shipped)" section
#       points at the ledger module + the two endpoints as canonical
#       reuse anchors. One paragraph, well under the 100-word cap.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     CONTAINER still exposes 7100 for external Caddy. DATA_VOLUME and
#     SQLITE_VOLUME unchanged — `cell_events` lives inside the existing
#     `revivals.db` at `/app/data/revivals.db` (mounted from
#     persona-blog-a-sqlite). ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Dockerfile already copies
#     `src/` wholesale into the builder stage — the new
#     `cell-event-ledger.ts`, `api/ingest/cell-event.ts`,
#     `api/metrics/cited-cells.ts`, updated `collectiveMemory.ts`,
#     `cell-cite.ts`, `stage-axes.ts`, `docs.astro`, and the dev-only
#     `.test.ts` file all ship without any Dockerfile edits. The
#     `cell_events` schema is lazily created on first write/read via
#     `ensureSchema()` — the new step 8 warm-up (GET /api/metrics/
#     cited-cells) forces that creation during deploy so the very first
#     real beacon hits a ready table and the baseline snapshot appears
#     in deployment.log for operator sanity-check. The prebuild
#     compliance guard (token drift + DECAY_STAGES immutability +
#     STAGE_AXES ⇄ file inventory parity) is unchanged and still runs
#     inside `npm run build` during the Docker builder stage. The
#     `.test.ts` files are never executed at build or runtime.
#     deploy.sh startup sequence now has nine steps (1–9): the cell-
#     metrics warm-up sits between OTS upgrade and the image prune so
#     it runs after the container is confirmed healthy and before the
#     idle cleanup.
#
# Architecture v150b — Copy-Cell-Anchor Citation Ritual (2026-04-22)
#   Sprint: Make every cell of the 7×5 grammar matrix citable. Hover/focus
#     a cell → a top-right ⌗ button reveals; click → single-line clipboard
#     payload (`{axis} × {stage} · {origin}/api/docs#{anchor}`) plus an
#     aria-live toast. Land on a deep-link → the matched cell paints a
#     stage-keyed arrival bloom (fresh/fading: bloom; endangered: pulse;
#     ghost: outline; fossil: still 800ms hold). Pure UIX polish + code-
#     quality dedupe — zero infrastructure changes. The clipboard *string*
#     is the product (Paul §non-negotiable); the toast and bloom make the
#     string believable.
#   Key changes:
#     src/lib/client/clipboard.ts (new) — extracted `copyText(text)` async
#       helper from ShareSealButton.astro. Modern `navigator.clipboard`
#       primary path with `document.execCommand('copy')` legacy fallback
#       on hostile contexts (older browsers, non-secure origins, iframes).
#       Returns boolean — never throws — caller owns user-facing failure.
#       One source of truth for both share-card and docs-citation paths.
#     src/lib/client/cell-cite.ts (new) — citation ritual module. One
#       delegated click listener on `.api-docs__matrix`, one hashchange
#       handler for arrival bloom, one shared aria-live toast. Reads
#       `data-cell-axis` + `data-cell-stage` off the SSR button, builds
#       the payload at copy time via `cellCitationPayload()` so prerendered
#       HTML never bakes in a build-time host. Optional `navigator.sendBeacon`
#       analytics no-op (TODO: wire `/api/ingest/copy-cell` ingest endpoint).
#       Auto-boots on DOMContentLoaded; safe on pages without the matrix.
#     src/lib/stage-axes.ts — two new pure SSR-safe helpers:
#       `cellCitationLabel(axis, stage)` → `${axis} × ${stage}` (uses
#         U+00D7 multiplication sign, never `x` / `*` — renders identically
#         in Slack, Discord, GitHub, iMessage, terminal).
#       `cellCitationPayload(axis, stage, origin)` →
#         `{label} · {origin}/api/docs#{cellAnchorId(axis, stage)}` (uses
#         U+00B7 middle dot separator; single-line per Elon §4.1 — newlines
#         break Slack's Enter-to-send and URL-bar paste).
#       Reuses existing `cellAnchorId()` verbatim — one anchor source.
#       Pure stateless module — no DOM, no `window`, no `import.meta.env`;
#       safe for SSR, tests, and a future `/api/docs.json` endpoint.
#     src/lib/stage-axes.test.ts — describe block 6b adds 7 new test cases
#       covering character-for-character payload format, dashed axis names,
#       middle-dot separator, anchor reuse, and no-double-slash invariant.
#       Loops over all 35 (axis, stage) combinations. Run via:
#         `npx tsx --test src/lib/stage-axes.test.ts`
#       NOT executed at Docker build or runtime (dev-only).
#     src/components/ShareSealButton.astro — clipboard inline copy/legacyCopy
#       deleted; now imports `copyText` from `../lib/client/clipboard`.
#       Tighter call-site, identical behaviour. Mike §6 anti-pattern
#       (duplicate clipboard path) eliminated.
#     src/pages/api/docs.astro — every matrix cell gains a `<button data-
#       cell-copy>` (top-right, 28×28 visual / 44×44 effective hit, hidden
#       at rest, revealed on `:hover` / `:focus-within`). One shared
#       `<div data-cell-toast role="status" aria-live="polite">` lives
#       outside the matrix grid (clean table semantics for screen readers).
#       Single `<script>import '../../lib/client/cell-cite';</script>` boot.
#       New CSS scoped to `.cell-copy` + `.cell-toast`: per-stage hover
#       lift, mono ⌗→✓ icon swap on confirm, touch-device dim-but-visible
#       affordance, `prefers-reduced-motion` + `forced-colors` sanctuaries.
#       Zero net-new tokens — every value pulled from existing tokens.css.
#     src/styles/stage-focus.css — arrival bloom rule block appended.
#       `.api-docs__matrix-cell.cell--arrived[data-decay-stage="…"]` selectors
#       drive five `@keyframes`: cell-arrive-bloom (fresh/fading), cell-
#       arrive-pulse (endangered, with outline-offset 2→5→2px), cell-
#       arrive-quiet (ghost: outline only), cell-arrive-still (fossil:
#       static outline 800ms hold — stillness as signal per Elon §4.2).
#       Each rule consumes the stage's own `--stage-{s}-duration` /
#       `--stage-{s}-ease` so the bloom inherits the v146 motion grammar.
#       `prefers-reduced-motion` collapses to static outline; `forced-
#       colors: active` yields to `Highlight`. Lives inside stage-focus.css
#       (the canonical focus axis file) — inherits compliance-guard parity
#       without a new file (axis count still 7, frozen per v149).
#     AGENTS.md — new "Shared helpers — reuse, don't duplicate" section
#       lists `clipboard.ts`, `stage-axes.ts` citation helpers, and
#       `cell-cite.ts` as canonical reuse anchors. Stage grammar paragraph
#       trimmed for density. Well under the 100-word cap.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `src/` wholesale into the
#     builder stage, so the new `src/lib/client/clipboard.ts`, the new
#     `src/lib/client/cell-cite.ts`, the extended `src/lib/stage-axes.ts`
#     citation helpers, the new dev-only test cases, the refactored
#     ShareSealButton.astro, the docs.astro copy buttons + toast, the
#     stage-focus.css arrival bloom, and the refreshed AGENTS.md all ship
#     without any Dockerfile edits. The prebuild compliance guard continues
#     to run inside `npm run build` during the Docker builder stage and
#     enforces the seven-axis freeze + token compliance + DECAY_STAGES
#     literal-set immutability + STAGE_AXES ⇄ file inventory parity. The
#     `.test.ts` file is never executed at build or runtime (dev-only).
#     The TODO `/api/ingest/copy-cell` analytics endpoint is a deliberate
#     no-op today (sendBeacon to a 404 is silent — safe). deploy.sh
#     startup sequence (steps 1–8) identical to v150a.
#
# Architecture v150a — Canonical Axis Literal & Grammar-Matrix Appendix (2026-04-22)
#   Sprint: Close the seven-axis grammar on a single, executable source of
#     truth. One literal (`STAGE_AXES`) now governs every reader of the
#     axis vocabulary — the `/api/docs` page, the prebuild compliance
#     guard, and the dev-only textual-parity tests. The freeze declared
#     in v149 ("no 8th axis") becomes executable policy: drift between
#     the axis tuple and the `src/styles/stage-*.css` files on disk
#     fails the Docker builder stage at prebuild. Pure code-quality +
#     UIX-surface polish — zero infrastructure changes.
#   Key changes:
#     src/lib/stage-axes.ts (new) — canonical `STAGE_AXES` as-const tuple
#       (seven literals: typography, border, tempo, selection,
#       drag-highlight, focus, underline) + `AXIS_TO_CSS_FILE` map +
#       `STAGE_FILE_EXEMPT` list (stage-transitions.css is crossing
#       orchestrator, not an axis). Exports `axisStageExample(axis,
#       stage)` → `{ tokenRefs, exampleElement }` for the docs matrix;
#       `stageAxisGrid()` enumerates the full 7 × 5 = 35-cell grid;
#       `cellAnchorId` / `rowAnchorId` / `stageAnchorId` emit stable
#       URL fragments for deep links. Pure stateless module — safe for
#       SSR, tests, and the guard. Mike §napkin single-literal rule.
#     src/lib/stage-axes.test.ts (new, dev-only) — `node:test` textual +
#       shape parity suite. Asserts: STAGE_AXES.length === 7,
#       DECAY_STAGES.length === 5 (re-assertion of engine freeze), every
#       axis maps to a file that exists on disk, every (axis, stage)
#       cell has non-empty token refs + an example element, no dupes/
#       gaps across the 35 combinations, and the `STAGE_AXES` tuple can
#       be extracted with the exact regex the guard uses. Run via:
#         `npx tsx --test src/lib/stage-axes.test.ts`
#       NOT executed at Docker build or runtime.
#     scripts/check-token-compliance.ts — new `checkStageAxisInventory()`
#       guard. Parses `src/lib/stage-axes.ts` at prebuild time, extracts
#       the `STAGE_AXES` tuple + `AXIS_TO_CSS_FILE` + `STAGE_FILE_EXEMPT`,
#       then enforces bi-directional inventory parity: (forward) every
#       axis maps to a file that exists on disk; (reverse) every non-
#       exempt `src/styles/stage-*.css` file is referenced by at least
#       one axis. Teaching error tells the dev exactly which file/axis
#       drifted and how to fix it ("update STAGE_AXES, AXIS_TO_CSS_FILE,
#       or STAGE_FILE_EXEMPT"). Runs as part of `npm run prebuild` → any
#       drift fails the Docker builder stage.
#     src/pages/api/docs.astro — new grammar-matrix appendix section
#       ("The grammar, whole."). 7 × 5 = 35 cells rendered with the
#       exact CSS they document — each cell wears `[data-decay-stage]`
#       on itself, so if a cell looks wrong, the axis is wrong, not the
#       page. Per-axis mini-demos: typography (mono "Aa" with stage
#       weight + opacity), border (pill with stage border), tempo
#       (hairline animated at per-stage duration), selection (pre-
#       painted span mirroring stage-selection.css), drag-highlight
#       (dashed drop-zone), focus (real tabbable <button>),
#       underline (prose paragraph with real anchor). Deep-linkable via
#       `cellAnchorId` / `rowAnchorId` / `stageAnchorId` — :target paints
#       a one-shot focus ring (dim stages floor at endangered border per
#       v149 color-floor reasoning). 480px mobile: matrix collapses to
#       one card per axis with a five-cell inline strip. `forced-colors:
#       active` + `prefers-reduced-motion: reduce` sanctuaries honored.
#       API enum + JSON sample + stage definition list UNCHANGED — the
#       matrix is an appendix, not a wire contract (Elon §4).
#     AGENTS.md — stage-axes paragraph reorganised to point at the one
#       literal in `src/lib/stage-axes.ts` as the source of truth for
#       the axis/file inventory; freeze language retained verbatim.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `src/` and `scripts/`
#     wholesale into the builder stage, so the new `stage-axes.ts` module,
#     the new dev-only test file, the extended compliance guard, and the
#     docs.astro matrix appendix all ship without any Dockerfile edits.
#     The prebuild compliance guard now runs THREE checks inside
#     `npm run build` during the Docker builder stage: (1) token drift,
#     (2) DECAY_STAGES literal-set immutability, (3) STAGE_AXES ⇄ file
#     inventory — any of them failing aborts the Docker build with a
#     teaching error. The `.test.ts` file is never executed at build or
#     runtime (dev-only). deploy.sh startup sequence (steps 1–8)
#     identical to v149.
#
# Architecture v149 — Stage-Keyed Prose Underline (Seventh & Final Axis) (2026-04-22)
#   Sprint: Close the decay grammar on the reader's *archival cue* — the
#     underline under every prose anchor now reflects the post's stage.
#     Seventh and FINAL axis: after v149 the axis count is frozen per
#     AGENTS.md ("instrument, measure, polish. No 8th axis."). Pure UIX
#     polish — zero infrastructure changes, zero new tokens, zero new
#     codegen, zero new guards. One grammar, seven axes (typography,
#     border, tempo, selection, drag-highlight, focus-ring, underline).
#   Key changes:
#     src/styles/stage-underline.css (new) — five `[data-decay-stage="…"]`
#       blocks paint `text-decoration-{line,color,thickness}` +
#       `text-underline-offset` on prose anchors (`p, li, h2-h6, blockquote,
#       figcaption` descendants). Bright stages (fresh / fading / endangered)
#       cite their matching `--stage-{s}-border` token verbatim. Dim stages
#       (ghost / fossil) FLOOR text-decoration-color at
#       `--stage-endangered-border` so WCAG 1.4.11 non-text contrast
#       (≥ 3:1 vs. `--surface-base`) holds at fossil's L≈38 without
#       inventing a halo token (Mike §5, Elon's contrast-physics veto).
#       Geometry carries the age instead: thickness 0.08em → 0.16em,
#       offset 3px → 5px. `text-decoration-skip-ink: auto` dodges
#       descenders so fossil's 0.16em thickness never reads as
#       strike-through (Tanya §3.4, non-negotiable). Tempo reuses v146
#       motion — `transition: text-decoration-color var(--stage-{s}-duration)
#       var(--stage-{s}-ease)` only; geometry never transitions (would
#       wobble the baseline mid-paragraph). `forced-colors: active`
#       sanctuary yields `text-decoration-color: LinkText` and drops
#       thickness/offset. `prefers-reduced-motion: reduce` drops the
#       color tween, keeps the stage hue.
#     src/styles/global.css — imports `./stage-underline.css` right after
#       `./stage-focus.css` so the three reader-contact axes (selection,
#       focus, underline) sit adjacent in cascade order. Same "one file
#       per axis" shape as stage-motion / stage-selection / stage-focus.
#     scripts/check-token-compliance.ts — adds `src/styles/stage-underline.css`
#       to `GUARD_FILES`. Prebuild token-compliance guard now fails fast
#       if any raw hex / rgb / hsl / duration literal slips into the new
#       file. Same ratchet v146 / v147 / v148 used.
#     src/lib/stage-underline.test.ts (new) — `node:test` textual-parity
#       + WCAG-contrast suite. Reads the CSS file as text and asserts:
#       every DecayStage appears exactly once, every rule cites the
#       correct border token (bright → own, dim → endangered floor),
#       every rule carries skip-ink + color-only transition on the
#       stage's own `--stage-{s}-duration` / `--stage-{s}-ease`,
#       forced-colors + reduced-motion sanctuaries exist, scope fence
#       is never widened (prose anchors only; never bare `a`, never
#       chrome tags), and no hover/active/focus bloat. Plus a live
#       contrast resolver: each stage's chosen color is walked through
#       `--color-decay-{s}` OKLCH → linear sRGB → WCAG relative
#       luminance and compared vs `--surface-base`, asserting ≥ 3:1
#       for every stage. Dev-only; NOT part of Docker build or runtime.
#       Run: `npm run test:stage-underline` (new package.json script —
#       mirrors `test:stage-tokens` / `test:ceremony` / `test:dates`
#       shape exactly; dev-only, no new dependencies).
#     src/pages/api/docs.astro — one prose sentence in the "How the five
#       stages feel" section extends the axis list from six to seven,
#       naming the underline as a v149 axis. API enum + JSON sample
#       untouched (Elon §4 — axis list is prose, not wire contract).
#     AGENTS.md — Stage-axes paragraph extended with stage-underline.css
#       (v149) + the color-floor/geometry-carry rationale. Ends with
#       the explicit axis-count freeze: "After v149 the axis count is
#       frozen — instrument, measure, polish. No 8th axis."
#     package.json — new dev-only script `test:stage-underline`. Zero
#       new runtime or dev dependencies.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `src/` and `scripts/`
#     wholesale into the builder stage, so the new CSS file, the new
#     dev-only test, the extended GUARD_FILES set, the docs.astro
#     sentence, the new package.json script, and the refreshed AGENTS.md
#     all ship without any Dockerfile edits. The prebuild compliance
#     guard continues to run inside `npm run build` during the Docker
#     builder stage and will fail fast if the new file introduces
#     raw-value drift. The `.test.ts` file is never executed at build
#     or runtime (dev-only). deploy.sh startup sequence (steps 1–8)
#     identical to v146 / v147 / v148.
#
# Architecture v148 — Stage-Keyed :focus-visible (Focus Ring, Sixth Axis) (2026-04-22)
#   Sprint: Close the decay grammar on the keyboard contact event. The tab key
#     is now a full stage axis — `:focus-visible` on prose-interactive
#     descendants of `[data-decay-stage]` inherits the post's weather, painting
#     the ring with the same `--stage-{s}-border` token that drives the other
#     five axes (typography, border, tempo, selection, drag-highlight). Pure
#     UIX polish — zero infrastructure changes, zero new tokens, zero new
#     codegen, zero new guards. Six axes, one token family, one grammar.
#   Key changes:
#     src/styles/stage-focus.css (new) — five `[data-decay-stage="…"]` blocks
#       paint `:focus-visible` on prose-interactive targets
#       (`a, button, summary, [tabindex="0"]`). Bright stages (fresh / fading
#       / endangered) use a 2px outline on their own border color; dim stages
#       (ghost / fossil) add `box-shadow: inset 0 0 0 1px var(--surface-base)`
#       as a keyline that forces 3:1 non-text contrast (WCAG 2.4.11) against
#       low-L card grounds without inventing a halo token (Tanya §2a). Tempo
#       borrows from v146 stage-motion — `transition` reads each stage's own
#       `--stage-{s}-duration` / `--stage-{s}-ease`, so the ring feels faster
#       on fresh posts and heavier on fossils without any new timing token.
#       `forced-colors: active` sanctuary yields `outline-color: Highlight`
#       and drops the keyline; `prefers-reduced-motion: reduce` drops the
#       transition, keeping color. Native form fields (input / textarea /
#       pre / code / [contenteditable]) are deliberately OUT of scope —
#       decay-weather on a form field is a metaphor inversion (Elon §2a,
#       Tanya §4). Site chrome outside any [data-decay-stage] subtree
#       continues to use the global gold `*:focus-visible` ring.
#     src/styles/global.css — imports `./stage-focus.css` right after
#       `./stage-selection.css` so both reader-contact axes sit adjacent in
#       cascade order. The universal `*:focus-visible` rule is kept verbatim
#       as the chrome fallback half of the scope fence — its header comment
#       is updated to point at stage-focus.css so future edits don't delete
#       the fallback by accident.
#     scripts/check-token-compliance.ts — adds `src/styles/stage-focus.css`
#       to `GUARD_FILES` (count: 135 → 136). The prebuild token-compliance
#       guard now fails fast if any raw hex / rgb / hsl / duration slips
#       into the new file. Same ratchet v147 used.
#     src/lib/stage-focus.test.ts (new) — `node:test` textual-parity suite
#       (28 tests across 7 describe blocks). Reads the CSS file as text and
#       asserts: every DecayStage appears exactly once, every rule cites the
#       matching `--stage-{s}-border` token, every rule consumes the stage's
#       own tempo tokens, dim stages carry the keyline and bright stages do
#       not, forced-colors + reduced-motion sanctuaries exist, scope fence
#       is never widened (no input/textarea/pre/code/[contenteditable]),
#       and no raw color / duration literals leak. Pure parser check — no
#       JSDOM, no Puppeteer, same shape as decay-wire.test.ts and
#       generate-stage-tokens.test.ts. Run: `npx tsx --test src/lib/stage-focus.test.ts`.
#     src/pages/api/docs.astro — one prose sentence in the "How the five
#       stages feel" section names the six axes the reader touches
#       (typography, border, tempo, selection, drag-highlight, focus-ring).
#       The API enum and the JSON sample are untouched per Elon §4 — the
#       axis list is prose, not contract.
#     AGENTS.md — axis list extended from "typography, border, tempo,
#       drag-highlight" to "typography, border, tempo, drag-highlight,
#       focus-ring". Stage-axes paragraph names stage-focus.css and its
#       prose-interactive scope fence. Well under the 100-word cap.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `src/` and `scripts/`
#     wholesale into the builder stage, so the new CSS file, the extended
#     GUARD_FILES set, the new test file, the docs.astro sentence, and the
#     refreshed AGENTS.md all ship without any Dockerfile edits. The
#     prebuild compliance guard continues to run inside `npm run build`
#     during the Docker builder stage and will fail fast if the new file
#     introduces raw-value drift. deploy.sh startup sequence (steps 1–8)
#     identical to v146 / v147.
#
# Architecture v147 — Stage-Keyed ::selection (Drag-Highlight Axis) (2026-04-22)
#   Sprint: Add the reader's *own brush* to the decay grammar — drag-highlight
#     color on blog prose now reflects the post's decay temperature. Same five-
#     stage vocabulary, no new tokens, no new codegen, no new guards. One axis,
#     one paint rule per stage, prose-only scope fence. Pure UIX polish — zero
#     infrastructure changes.
#   Key changes:
#     src/styles/stage-selection.css (new) — five `[data-decay-stage="…"]`
#       blocks paint `::selection` + `::-moz-selection` on prose descendants
#       (h1-h6, p, li, blockquote, figcaption, time). Bright stages (fresh/
#       fading/endangered) use dark ink on saturated fill; dim stages (ghost/
#       fossil) flip to light ink on dusty fill for WCAG AA contrast at the
#       dim end of the ramp (Tanya §4.1/§4.2). Reuses existing
#       `--stage-{s}-border` tokens verbatim — any future border retune
#       automatically retunes selection. `forced-colors: active` sanctuary
#       yields to OS Highlight/HighlightText (Mike §5.4, Tanya §8). Firefox
#       parity preserved via sibling `::-moz-selection` rule (never comma-
#       listed with `::selection` — selector-list invalidation would kill
#       both). Inputs, textarea, pre, code, chrome never receive the paint —
#       scope lives in the selector list, not a neutralizing override.
#     src/pages/blog/[slug].astro — `<article class="post-body">` now carries
#       `data-decay-stage={decayStage}` so the prose container is the stamp
#       anchor for stage-selection.css's descendant selectors. `decayStage`
#       already computed above for existing cover-decay physics (v140) — no
#       new derivation, just a second consumer.
#     src/styles/global.css — imports `./stage-selection.css` right after
#       `./stage-motion.css` so both axes (motion tempo + selection paint)
#       sit adjacent in cascade order. The "one file per axis" shape mirrors
#       stage-motion.css (v146) verbatim — napkin consistency (Mike §shape).
#     scripts/check-token-compliance.ts — new file added to `GUARD_FILES` so
#       the prebuild token-compliance guard covers it (no raw colors, no
#       hardcoded stage literals outside the per-stage rows). Runs inside
#       `npm run build` during the Docker builder stage; fails fast on drift.
#     AGENTS.md — core-feature paragraph rewritten to call out the 5-stage
#       grammar as a grammar of *axes* ("typography, border, tempo, drag-
#       highlight"). New "Stage axes" section documents the one-file-per-axis
#       convention + prose-scope fence. The v146 codegen paragraph moved
#       under the axes section. "Add axis → add file; never branch stage
#       literals in components" contract made explicit.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `src/` and `scripts/`
#     wholesale into the builder stage, so the new CSS file, the updated
#     `<article>` stamp, the extended GUARD_FILES set, and the refreshed
#     AGENTS.md all ship without any Dockerfile edits. The prebuild
#     compliance guard continues to run inside `npm run build` during the
#     Docker builder stage and will fail fast (non-zero) if the new file
#     introduces raw-value drift or if the stage-tokens mirror has drifted.
#     deploy.sh startup sequence (steps 1–8) identical to v146.
#
# Architecture v146 — Stage-Keyed Motion (Fresh-Spike, One Axis) (2026-04-22)
#   Sprint: Turn interaction timing into the fifth axis of the decay grammar.
#     Only `fresh` carries bespoke spring values (120ms · spring easing); every
#     other stage aliases to `--motion-snap-*` so nothing hovers slower than
#     today. The cascade dispatches — components never branch on a stage
#     literal. Pure UIX polish — zero infrastructure changes.
#   Key changes:
#     src/styles/stage-motion.css (new) — five `[data-decay-stage="…"]` /
#       `[data-stage="…"]` rows map each stage's `--stage-*-duration` +
#       `--stage-*-ease` onto the resolver pair `--stage-transition-duration`
#       / `--stage-transition-ease`. Dual-key selectors cover both the DecayCard
#       `data-decay-stage` stamp and the supporting-surface `data-stage`
#       stamp (DecayClock, StagePill, …) without a plumbing sweep. Add a
#       stage → add one row; downstream consumers change nothing.
#     src/styles/tokens.css — ten new stage-motion tokens
#       (`--stage-{fresh|fading|endangered|ghost|fossil}-{duration,ease}`)
#       plus the two resolver aliases `--stage-transition-duration` /
#       `--stage-transition-ease` that default to the snap profile (so
#       non-stage-aware elements keep today's feel). Only `fresh` spikes to
#       120ms with `--motion-easing-spring`; every other row aliases to
#       `--motion-snap-*`. Ten tokens, one behavioural change — Elon §first-
#       principles veto on slowing the ramp anywhere else.
#     src/styles/motion.css — `prefers-reduced-motion: reduce` block gains
#       `--stage-fresh-duration: 0ms` and `--stage-transition-duration: 0ms`
#       so the fresh spring collapses to instant for accessibility.
#     src/styles/global.css — imports `./stage-motion.css` right after
#       `./motion.css` so the cascade dispatch is live before any card sheet
#       reads the resolver pair.
#     src/styles/card-base.css — `.card-base` transition consumes
#       `var(--stage-transition-duration) var(--stage-transition-ease)` for
#       box-shadow + transform. Never names a stage — the card's
#       `[data-decay-stage]` stamp drives dispatch.
#     src/styles/keep-button.css — `.keep-btn` transition consumes the same
#       resolver pair for color/border-color/box-shadow. Fresh-card KeepButton
#       springs eagerly; revive-on-ghost stays ceremonial exactly like today.
#     scripts/generate-stage-tokens.ts — parser + formatter extended with
#       string-passthrough extractor `extractPerStageStr()`. `StageTokens`
#       gains `transitionDuration` + `transitionEase` records (strings, no
#       numeric coercion — value may be raw `120ms` or `var(…)` alias).
#       `formatStageTokensFile()` emits two new `Record<StageKey, string>`
#       blocks: `STAGE_TRANSITION_DURATION_MS`, `STAGE_TRANSITION_EASE`.
#     src/lib/stage-tokens.generated.ts — regenerated artefact now carries
#       both new records; verified against tokens.css at commit time. The
#       prebuild staleness guard (check-token-compliance.ts) continues to
#       diff in-memory — edit tokens.css without regen → build fails fast.
#     scripts/generate-stage-tokens.test.ts — six new `node:test` cases
#       cover: fresh row verbatim passthrough, every-other-stage alias
#       capture, easing string passthrough including `var()`, missing-row
#       throw (both duration + ease), and record-block shape in output.
#       Dev-only; not part of Docker build or runtime.
#     AGENTS.md — new "Stage-keyed motion (v146)" paragraph documents the
#       token pair, the fresh-only spike, the dual-key cascade dispatch,
#       and the "components never branch on stage" contract.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `src/` and `scripts/`
#     wholesale into the builder stage, so the new CSS file, extended
#     codegen, regenerated artefact, and codegen tests all ship without
#     any Dockerfile edits. The prebuild compliance guard + stage-tokens
#     staleness diff run inside `npm run build` during the Docker builder
#     stage and will fail fast (non-zero) if either the DECAY_STAGES
#     literal set or the stage-tokens mirror has drifted. deploy.sh
#     startup sequence (steps 1–8) identical to v145.
#
# Architecture v145 — DecayStage Wire Contract & Public API Docs Page (2026-04-22)
#   Sprint: Freeze the five-name `DecayStage` vocabulary as a published wire
#     contract, wire a single-producer helper into every JSON endpoint, and
#     ship a human-readable reference page (`/api/docs`) that renders the
#     canonical tuple live from source. Pure code-quality + UIX surface —
#     zero infrastructure changes.
#   Key changes:
#     src/lib/decay-engine.ts — new `DECAY_STAGES` as-const tuple (the five
#       literal strings `fresh/fading/endangered/ghost/fossil`, frozen and
#       exported as the canonical wire vocabulary). New `wireDecayStage()`
#       helper — the sole server-side producer of the wire `decayStage`
#       string. Callers pass `(pubDateISO, revivals?, readingSeconds?,
#       conviction?, maxDays?, now?)` and get back one of DECAY_STAGES; the
#       helper calls `decayFactor` + `stageFromFactor` under the hood so the
#       wire label can never disagree with the UI-card label for the same
#       tuple (Mike §7.1/§7.2, Paul immutability commitment §7.6). New
#       `_testDecayEngine()` assertions cover wire/UI parity, conviction
#       multiplier propagation, default-maxDays fallback, and tuple length.
#     src/lib/endangered.ts — `EndangeredPost` interface gains a required
#       `decayStage: DecayStage` field; `DecayStage` type imported and
#       re-exported through the endangered surface. The field is always
#       populated by the wire helper — never re-derived at the call site.
#     src/pages/api/death-clock.ts — response JSON adds `decayStage`, sourced
#       from `wireDecayStage()` using the same `(pubDate, revivals, reading,
#       conviction, CLOCK_MAX_DAYS, now)` tuple already passed to `decayFactor`.
#     src/pages/api/endangered.ts — `buildEntry()` emits `decayStage` on every
#       entry via the wire helper (null conviction — community feed surface).
#     src/pages/api/endangered-sse.ts — SSE frame wire contract updated: each
#       pushed entry carries `decayStage` so clients dismissing endangered
#       cards off the live float never flicker on a stage mismatch.
#     src/pages/api/revive.ts — response JSON adds post-revival `decayStage`
#       computed with the *post-increment* revival count so it agrees with
#       the `decayAfterRevival` float the client already reads (Mike §7.3).
#     src/pages/api/docs.astro (new, public page at `/api/docs`) — one-column
#       BaseLayout surface with three sections: JSON sample block, the five
#       DecayStage rows (colour + glow per `--color-decay-*`), and a tone
#       paragraph. List is driven by `DECAY_STAGES.map(...)` so the page
#       cannot drift from the tuple. No new components; all spacing, type,
#       and colour values pull from the existing token system (Tanya §1).
#       Referenced from the footer + README.
#     scripts/check-token-compliance.ts — new `checkDecayStagesLiteralSet()`
#       guard. Parses `src/lib/decay-engine.ts` at prebuild time, extracts
#       the `DECAY_STAGES` tuple, and fails the build with a teaching error
#       message if the literal set has been renamed, reordered, or grown.
#       Also adds `src/pages/api/docs.astro` to GUARD_FILES (token-compliance
#       coverage for the new page).
#     src/lib/decay-wire.test.ts (new, dev-only) — node:test unit tests
#       covering wire/UI parity, tuple immutability, conviction multiplier
#       propagation, buildEntry-shape round-trip, and post-revival count
#       semantics. Invoked via `npx tsx --test src/lib/decay-wire.test.ts`.
#       NOT executed at Docker build or runtime — pure dev artefact.
#     README.md — new "API" section linking to the published docs page.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `scripts/` and `src/`
#     wholesale into the builder stage, so the new wire helper, the new
#     docs page, the new literal-set guard, and the dev-only test file all
#     ship without any Dockerfile edits. The extended prebuild guard runs
#     inside `npm run build` during the Docker builder stage and will fail
#     fast (non-zero) if either the stage-tokens mirror or the DECAY_STAGES
#     literal set has drifted. deploy.sh startup sequence (steps 1–8)
#     identical to v144.
#
# Architecture v144 — Stage-Token Codegen (CSS → TS, Move A) (2026-04-22)
#   Sprint: Cut the hard-coded duplication between `tokens.css` (CSS truth) and
#     the Satori OG layout by introducing a codegen artefact sourced from CSS.
#     Move A (Mike's napkin §2/§5): presentational atoms only — text-primary
#     opacity + title weight. Decay OKLCH, Satori 0.88 composite, and API
#     `stage` field stay in place (YAGNI / surface-transform / Move C deferred).
#   Key changes:
#     scripts/generate-stage-tokens.ts (new) — pure parser+formatter codegen.
#       Reads `src/styles/tokens.css` (the single source of truth), emits
#       `src/lib/stage-tokens.generated.ts` with a DO-NOT-EDIT header and a
#       compile-time assertion that StageKey ≡ DecayStage. Exposes
#       `parseStageTokens()` + `formatStageTokensFile()` for reuse by the
#       compliance guard. Invoked via: `npm run generate:stage-tokens`.
#     scripts/generate-stage-tokens.test.ts (new) — dev-only unit tests for
#       the parser + formatter (golden fixture, missing-key throw, idempotent
#       output, DO-NOT-EDIT header, DecayStage assertion, STAGE_KEYS coverage).
#       Run via: `npm run test:stage-tokens`. Not executed at build or runtime.
#     src/lib/stage-tokens.generated.ts (new, tracked-via-.gitattributes-as-
#       generated) — auto-generated artefact. Exports STAGE_KEYS, StageKey,
#       STAGE_TEXT_PRIMARY_OPACITY, STAGE_TITLE_WEIGHT. Imported by Satori
#       (non-CSS) surfaces; CSS side continues reading --stage-* directly.
#     scripts/check-token-compliance.ts — prebuild guard extended: regenerates
#       stage-tokens in-memory from tokens.css and diffs against the committed
#       artefact. Teaching error message tells the dev exactly what to run
#       (`npm run generate:stage-tokens && git add …`). Runs as part of
#       `npm run prebuild` → blocks build if tokens.css was edited without
#       regenerating the TS mirror. No impact on deploy if the artefact is
#       fresh (which it is — verified against tokens.css lines 120-124 + 837-841).
#     src/lib/og/battingAverageLayout.ts — removed hard-coded
#       WEIGHT_BY_STAGE / NAME_OPACITY_BY_STAGE tables; now imports
#       STAGE_TEXT_PRIMARY_OPACITY + STAGE_TITLE_WEIGHT from the generated
#       file. Kept the Satori-only 0.88 composite multiplier locally as
#       SATORI_TEXT_PRIMARY_ALPHA — it is a surface transform, not a grammar
#       value (Mike §6.3 / Elon §5). `nameColorForStage` composites opacity
#       onto the :root --text-primary alpha; `pctNumber` reads weight from
#       the generated table. One stage table, every surface.
#     package.json — new scripts: `generate:stage-tokens` (codegen runner),
#       `test:stage-tokens` (dev-only unit tests). Zero new dependencies.
#     AGENTS.md — documents the codegen artefact path, the "edit tokens.css
#       → regen → stage" workflow, and the prebuild guard contract.
#     .gitattributes (new) — marks `*.generated.ts` as linguist-generated so
#       GitHub collapses the diff view. Editor signal; zero runtime impact.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies `scripts/` and `src/`
#     wholesale into the builder stage, so the new codegen script, its test,
#     and the generated artefact all ship without any Dockerfile edits.
#     The prebuild compliance guard runs inside `npm run build` during the
#     Docker builder stage and will fail fast (non-zero) if the committed
#     stage-tokens.generated.ts has drifted from tokens.css. The `.test.ts`
#     file is never executed at build or runtime (dev-only). deploy.sh
#     startup sequence (steps 1–8) identical to v143.
#
# Architecture v143 — Author Record-Age Grammar (Voice Softens, Record Hardens) (2026-04-22)
#   Sprint: Apply the five-stage decay ontology to a NEW time axis — author
#     record age (time since first seal). Same DecayStage vocabulary
#     (fresh/fading/endangered/ghost/fossil), inverted typography:
#       voice softens (slug name dims) · record hardens (BA number bolds).
#     Pure UIX polish — zero infrastructure changes.
#   Key changes:
#     src/lib/record-stage.ts (new) — pure stateless classifier:
#       recordStage(firstSealMs?, now?) → RecordStage. Single source of truth
#       for the age-band table (RECORD_STAGE_DAYS: 30 / 180 / 365 / 1095 days).
#       Reuses DecayStage type from decay-engine.ts. Null-safe: brand-new
#       authors and clock-skewed timestamps render as 'fresh'. No DB access
#       — callers fetch firstSealDate at the page/API boundary.
#     src/lib/record-stage.test.ts (new) — boundary tests via node:test.
#       Dev-only; not part of Docker build/runtime. Run via:
#         npx tsx --test src/lib/record-stage.test.ts
#     src/pages/author/[slug].astro — derives `stage = recordStage(track
#       Data.firstSealDate)` and forwards as `data-record-stage` on the
#       <main class="ap-page"> root + `recordStage` prop on AuthorProfileHero.
#     src/components/AuthorProfileHero.astro — new optional `recordStage`
#       prop (defaults to 'fresh'). Renders `data-record-stage` on .aph-hero.
#       Scoped CSS: .aph-gauge-pct + .aph-tier-badge gain weight & tighten
#       letter-spacing per stage (the "record hardens" half).
#     src/styles/author-profile.css — `.ap-slug` + `.ap-since` opacity &
#       weight ramps consume existing `--stage-*-text-primary/secondary`
#       tokens. Transitions via `--motion-duration-deliberate`. The "voice
#       softens" half. NO new tokens; opacity/weight values pull from
#       tokens.css's stage table (lines 120–131).
#     src/pages/api/og/batting-average.png.ts — OG card mirrors the live
#       page's stage. Computes stage via getSealsByAuthor → buildTrackRecord
#       → recordStage. Passes through new `OGAuthor.recordStage` field.
#     src/lib/og/battingAverageLayout.ts — Satori cannot read CSS custom
#       props, so WEIGHT_BY_STAGE + NAME_OPACITY_BY_STAGE ramps are
#       hard-coded next to COLORS. Author-name color and pct-number weight/
#       letter-spacing now stage-driven. Mirror of HTML side; if HTML stage
#       table changes, mirror here.
#     AGENTS.md — Core feature description expanded to call out the v143
#       inversion: "time is typography… voice softens, record hardens".
#       record-stage.ts added to the lib path index.
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies src/ wholesale into the
#     builder stage, so record-stage.ts (and its dev-only test) ship without
#     any Dockerfile edits — but the test is never executed at build or
#     runtime. deploy.sh startup sequence (steps 1–8) identical to v142.
#
# Architecture v142 — DecayStage API Parity, Headstone Date Ramp & Dev Test Hygiene (2026-04-22)
#   Sprint: Pure UIX polish + dev-only test-hygiene pass. Zero infrastructure
#     changes — all deploy.sh steps (1–8) identical to v141.
#   Key changes:
#     src/lib/postMeta.ts — PostDisplayData now exposes `decayStage: DecayStage`
#       (computed by stageFromFactor() in decay-engine.ts). Single source of
#       truth for stage derivation; API consumers no longer re-derive thresholds.
#       Tanya §10 / Paul MH-5 — "same five-stage behavior without re-deriving
#       the 0.25/0.50/0.75/0.97 thresholds at the render edge".
#     src/components/DecayCard.astro — local stageAttr() removed; reads
#       post.decayStage directly. Fossil footer text shortened ("Faded" instead
#       of "Faded {date}") — the date lives once, up top, as the headstone
#       marker (Tanya §6 no-duplicate-date rule). .post-date now transitions
#       opacity via var(--date-opacity) with --motion-drift-* timing.
#     src/lib/decay-engine.ts — docstring clarification on stageFromFactor()
#       (now consumed via postMeta.decayStage, not duplicated in DecayCard).
#     src/styles/tokens.css — 5 new tokens: --stage-{fresh,fading,endangered,
#       ghost,fossil}-date-opacity (0.60 → 0.80 monotone non-decreasing). The
#       ONE inversion in the design system — "Voice Fades, Date Hardens"
#       (Tanya §4 / Mike §napkin). Date caps at 0.80 so it stays below body
#       text, never above title's effective contrast.
#     src/styles/decay-stage-identity.css — per-stage [data-decay-stage]
#       selectors set --date-opacity from the new tokens.
#     src/lib/dates.ts + scripts/test-dates.ts (new) — _testDates() now throws
#       on failure (was silent console.assert). scripts/test-dates.ts is the
#       isolated-run entrypoint; invoked via `npm run test:dates`. Dev-only,
#       not part of Docker build. Follows openloop/inplace-testing-howto.md.
#     package.json — adds "test:dates" script (dev-only, tsx-based).
#   Infrastructure: no new services, volumes, env vars, ports, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. Container still exposes 7100 for
#     external Caddy. Dockerfile already copies scripts/ into the builder
#     stage (prebuild token-compliance guard) so the new test-dates.ts file
#     ships without any Dockerfile edits — but it is never executed at
#     build or runtime (dev-only).
#
# Architecture v141 — DecayCard Title/Excerpt Saturation & Opacity Decay (2026-04-18)
#   Sprint: Three targeted bug-fixes in DecayCard.astro — pure UIX/CSS polish,
#     zero infrastructure changes.
#   Key changes:
#     src/components/DecayCard.astro:
#       Bug 1 fix — .post-title font-weight now consumes --card-title-weight
#         (set by decay.css on the card element for ghost/fossil stages) via
#         font-weight: var(--card-title-weight, var(--weight-semibold)).
#         Pure CSS cascade; no JS, no new tokens needed.
#       Bug 2 fix — .post-title color replaced with color-mix() in oklch:
#         fresh (factor=0) → 100% mood-accent; fossil (factor=1) → 45% mood-accent +
#         55% text-secondary. Opacity calc(1 - factor * 0.30) added at element
#         level (0.70 floor); stage-identity.css overrides to precise stage
#         targets. Smooth transitions via --motion-drift-* tokens.
#       Bug 3 fix — .post-excerpt opacity changed from static 0.7 to
#         calc(0.7 - factor * 0.25) for continuous decay; transition wired
#         to --motion-drift-* tokens. stage-identity.css retains stage-snap
#         overrides.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v140).
#
# Architecture v140 — Detail Page Cover Decay Physics (2026-04-18)
#   Sprint: Live decay animation on blog detail page cover images/gradients —
#     same physics as feed DecayCard, separate IIFE, separate CSS class.
#     Mike §PoI-1 / Tanya §P4. Pure UIX polish — zero infra changes.
#   Key changes:
#     src/lib/decay-engine.ts — new detailDecayCoverScript() export: independent
#       client-side IIFE targeting .detail-decay-cover[data-pub-date]. Ticks every
#       60s via requestAnimationFrame; respects document.visibilityState and
#       timetravel:seek / timetravel:exit events. Math subroutines (rb/rdg/df/pf/
#       stg/grn/patch) copied from feed IIFE — independently deployable without a
#       bundler step. Sanity checks added to _testDecayEngine().
#     src/pages/blog/[slug].astro — detail-decay-cover class applied to both
#       .post-cover-wrap (image) and .post-cover-gradient (fallback). SSR initial
#       state via decayStyleString(postDecay). detailDecayCoverScript() inlined as
#       <script set:html={...}>. Imports updated. Aspect-ratio 16/6 → 16/7 for
#       feed→detail visual continuity (Tanya §P0). h1 color: --mood-accent →
#       --text-primary (Tanya §P5: mood accent must not tint headings). Author
#       link hover: underline affordance added (text-underline-offset: 2px).
#     src/styles/decay.css — new .detail-decay-cover block: opacity/filter
#       (blur/saturate/sepia) + border-radius calcification (14px→8px with
#       --decay-factor). Grain ::after overlay (same SVG noise as .decay-card).
#       Fossil stage: cursor:default (inert). Ghost/endangered: amber inset
#       vignette (60px inset box-shadow, no filter chain interference).
#       Reduced-motion guards for .detail-decay-cover and ::after.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v139).
#
# Architecture v139 — ConvictionRecord 3-Zone Layout (P1-A Sprint) (2026-04-18)
#   Sprint: CSS Grid 3-zone refactor of ConvictionRecord — author signal (A),
#     decay pressure (B), verdict moment (C). Hero KeepButton 52px full-width.
#     Fossil-hiding on FloatingKeepButton. Pure UIX polish, zero infra changes.
#   Key changes:
#     src/components/ConvictionRecord.astro — restructured to CSS Grid named
#       areas (zone-a/b/c). New props: authorSlug, totalPublished, daysRemaining.
#       Zone A: author link, BattingAverageChip, stage pill, conditional DecayClock
#       (endangered/ghost only). Zone B: GhostEchoes + DisputeTally. Zone C: hero
#       full-width KeepButton (52px), DisputeChallenge, ConvictionAuditTrail.
#     src/pages/blog/[slug].astro — passes 3 new props to ConvictionRecord:
#       authorSlug, totalPublished, daysRemaining. No logic changes.
#     src/styles/conviction-record.css — display:flex → CSS Grid with named areas.
#       @property --cr-gold-tint (animated border tint). Stage-pill styles.
#       cr-zone-a/b/c replace old cr-header/cr-action/cr-evidence/cr-challenge/cr-audit.
#     src/styles/floating-keep.css — fossil stage hides FloatingKeepButton
#       (opacity:0, pointer-events:none) per Tanya Zone C spec.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v138).
#
# Architecture v138 — BA Cache, SealCeremony A11y & UIX Polish (2026-04-18)
#   Sprint: In-process batting-average cache + seal ceremony accessibility &
#     micro-interaction polish pass.
#   Key changes:
#     src/lib/batting-average.ts — in-process TTL cache (30s per author).
#       getBattingAverageCached(authorSlug, totalPublished) replaces direct
#       getBattingAverageResult calls in SSR hot paths. invalidateBACacheFor()
#       for write-path eviction. Single-server Docker model — no Redis needed.
#     src/pages/api/conviction-seal.ts — calls invalidateBACacheFor(authorSlug)
#       after sealing so the next BA read reflects the new sealed count.
#     src/pages/api/verdict-resolve.ts — calls invalidateBACacheFor(authorSlug)
#       before verdict broadcast so SSE subscribers read fresh batting average.
#       authorSlug lookup hoisted (DRY — removes duplicate getSealEntry call).
#     src/components/SealCeremony.astro — aria-live phase announcer
#       (data-phase-announce, sr-only) for screen readers. is-hovering class
#       managed via onHover/onUnhover callbacks (was no-op). triggerHesitation()
#       fires on score change in compose phase. announcePhase() centralises
#       PHASE_LABELS screen-reader text. Redundant data-sealed guard removed
#       (sealed posts never render .seal-ceremony; guard was dead code).
#     src/components/VerdictSealCeremony.astro — sealedAt parsed with Number()
#       + isNaN guard; graceful fallback label on invalid timestamp.
#       data-ba-current-val stores numeric BA value for animateBACounter.
#       BA preview TypeError (network failure) swallowed; other errors logged.
#     src/styles/seal-ceremony.css — .seal-ceremony.is-hovering arc glow and
#       button box-shadow now active (onHover/onUnhover wired). Removed
#       seal-hesitation-pulse @keyframes block (hesitation now in tokens/JS).
#     src/styles/tokens.css — semantic shadow aliases: --shadow-sm, --shadow-md,
#       --shadow-lg, --shadow-glow-gold, --shadow-glow-mood (Tanya §2.3).
#     src/lib/seal-ceremony.test.ts (new) — integration tests for seal-ceremony
#       state machine (happy path, abort, 409, 5xx, phase sequence, hover guard).
#       Run via: npm run test:ceremony. Dev-only; not part of Docker build.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v137).
#
# Architecture v137 — Verdict Seal Ceremony SSE + ShareSealButton (2026-04-18)
#   Sprint: Reckoning-phase live update & share integration for VerdictSealCeremony.
#   Key changes:
#     src/lib/client/verdict-seal-ceremony-sse.ts (new) — reuses window.__presenceES
#       SSE channel; polls 500ms / 8s timeout; fires OnVerdictDeclared callback when
#       verdict:declared event matches the watched slug. Zero new SSE connections.
#     src/components/VerdictSealCeremony.astro — attachVerdictSSE() wired into
#       initCeremony(); animates BA counter in reckoning phase on live verdict.
#       ShareSealButton rendered in .vsc-share-wrap; revealed via showShareWrap()
#       inside scheduleReceiptReveal (800ms after reckoning). data-conviction-score
#       propagated to share card via populateShareCard().
#     src/styles/verdict-seal-ceremony.css — .vsc-share-wrap fade-in animation;
#       reduced-motion guard (animation-duration: 1ms).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v136).
#
# Architecture v136 — Stage-Gated Revival System (2026-04-18)
#   Sprint: Defense-in-depth revival gating — API + SSR + client runtime layers.
#   Key changes:
#     src/lib/revival-gate.ts — single source of truth: REVIVABLE = {endangered, ghost}.
#       canRevive(stage) / gateReason(stage) exported for all consumers.
#     src/lib/client/revival-gate-client.ts — client mirror of revival-gate.ts.
#       regate(card, stage) toggles data-gated on KeepButton.
#       watchFeedGates() wires MutationObserver for stage attribute changes.
#     src/pages/api/revive.ts — API-level stage gate (403 stageGated response).
#       Imports stageFromFactor + decayFactor to derive current stage at request time.
#       Guards direct API calls that bypass the UI.
#     src/lib/client/heartbeat-orchestrator.ts — regate() integrated into
#       writeStaticState() and tickColor() so KeepButton gates update on every
#       stage transition (fossil exit + live color tick paths).
#     src/components/KeepButton.astro — new stage prop; SSR gate via data-gated.
#       canRevive() from revival-gate.ts sets initial gate state server-side.
#     src/components/DecayCard.astro — fossil cards render epitaph instead of clock;
#       footer-meta and KeepButton not rendered for fossil stage (Tanya P1-C).
#       watchFeedGates() wired in boot() for MutationObserver runtime re-gating.
#     src/styles/decay.css — stage-specific hover rules: fresh/fading → subtle lift
#       only; endangered/ghost → full revival hover (emotional core); fossil → inert.
#     src/styles/keep-button.css — data-gated styles: pointer-events none, opacity 0.25.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v135).
#
# Architecture v135 — Typography Token Expansion & Design-System-Wide Migration (2026-04-18)
#   Sprint: Final typography & radius token vocabulary expansion + blanket
#     migration across 61 files. Pure UIX polish — zero infra changes.
#   Key changes:
#     src/styles/tokens.css — 14 new --tracking-* letter-spacing steps
#       (tightest through widest), --weight-light (300), 3 new radius
#       tokens (--radius-detail, --radius-tag, --radius-inset).
#     ~55 .astro components & pages — hardcoded letter-spacing, font-weight,
#       border-radius, and remaining raw values migrated to design tokens.
#       Components: AnchorStrip, AuditReceipt, AuditVerdictPanel,
#       ConvictionAuditTrail, ConvictionMeter, DecayClock, DisputeChallenge,
#       GraveyardLedger, Murmurs, NowLine, PactPanel, Pagination, PostBadge,
#       PredictionCard, PredictionVault, PresenceBand, RevivalBadge,
#       ShareSealButton, ShareSheet, StickyStanceBar, TensionBadge,
#       TombstoneCard, TrackRecord, TrustBadge, VerdictCard, VerdictCeremony,
#       VerdictReveal, and all page templates.
#     ~12 .css style files — endangered, ghost-echoes, leaderboard, river,
#       seal-ceremony, seal-receipt, tokens, verdict, etc. All raw values
#       replaced with canonical token references.
#     scripts/check-token-compliance.ts — guard expanded/hardened for
#       letter-spacing and font-weight token enforcement.
#     AGENTS.md — border-radius, breakpoint, typography migrations marked
#       [done]; WIP items updated.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v129).
#
# Architecture v134 — Verdict Seal Ceremony (2026-04-18)
#   Sprint: Interactive 3-phase verdict sealing ceremony.
#   Infrastructure: no changes. (see git log for full details)
#
# Architecture v133 — Above-Fold Simplification, FloatingKeepButton & Bloom Profiles (2026-04-18)
#   Sprint: P1 UIX polish — content-first layout, KeepButton promotion,
#     stage-proportional bloom duration.
#   Infrastructure: no changes. (see git log for full details)
#
# Architecture v132 — Semantic Motion Aliases, Cycle Tokens & Duration Error Ratchet (2026-04-17)
#   Sprint: Final design-token sweep — semantic motion aliases, ambient
#     cycle tokens, duration linter ratcheted to error severity, and
#     comprehensive raw-duration → token migration across 55 files.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     (see git log for full details)
#
# Architecture v131 — Design Token Deep Migration & Compliance Hardening (2026-04-17)
#   Sprint: Motion/duration/z-index/breakpoint/radius token migration across
#     25 files. Token compliance checker expanded with 4 new enforcement rules.
#   Infrastructure: no changes. (see git log for full details)
#
# Architecture v130 — Token Compliance 100% Ratchet & UIX Polish (2026-04-17)
#   Sprint: Token compliance ratchet to 100% + component UIX polish pass.
#   Infrastructure: no changes. (see git log for full details)
#
# Architecture v129 — Decay Stage Transition Orchestrator (2026-04-17)
#   Sprint: Stage boundary crossing choreography — visual transitions
#     when cards cross decay stage boundaries (fresh→fading→endangered→
#     ghost→fossil) and revival bloom burst (ANY→fresh). New orchestrator
#     module (stage-transitions.ts). 6 @keyframes in stage-transitions.css.
#     Battery saver & reduced-motion guards. 21 new design tokens.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#
# Architecture v128 — BattingAverageHero Thermal State System (2026-04-17)
#   Sprint: Conviction maturity visual language — cold/warming/hot thermal
#     states derived from resolved verdict count. Pure derivation — zero new
#     DB columns. 27 new tokens, 130 LOC new CSS. SSE integration.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#
# Full version history (v1–v127) removed for maintainability — see git log.

set -euo pipefail

CONTAINER_NAME="persona-blog-a"
IMAGE_NAME="persona-blog-a"
HOST_PORT=7100
CONTAINER_PORT=7100
DATA_VOLUME="persona-blog-a-data"
SQLITE_VOLUME="persona-blog-a-sqlite"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/deployment.log"

# Reset deployment.log; redirect both stdout and stderr for full traceability
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "==> [deploy] Starting deployment of ${CONTAINER_NAME} at $(date)"

# ── 1. Stop & remove existing container (idempotent) ─────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> [deploy] Stopping existing container: ${CONTAINER_NAME}"
  docker stop --time 15 "${CONTAINER_NAME}" || true
  echo "==> [deploy] Removing existing container: ${CONTAINER_NAME}"
  docker rm --force "${CONTAINER_NAME}" || true
fi

# ── 2. Ensure named data volumes exist (data dir + SQLite collective memory) ──
echo "==> [deploy] Ensuring data volume: ${DATA_VOLUME}"
docker volume create "${DATA_VOLUME}" || true
echo "==> [deploy] Ensuring SQLite volume: ${SQLITE_VOLUME}"
docker volume create "${SQLITE_VOLUME}" || true

# ── 3. Build Docker image ────────────────────────────────────────────────────
echo "==> [deploy] Building Docker image: ${IMAGE_NAME}"
docker build \
  --pull \
  --no-cache \
  --tag "${IMAGE_NAME}" \
  "${SCRIPT_DIR}"

# ── 4. Run the new container ─────────────────────────────────────────────────
echo "==> [deploy] Starting container: ${CONTAINER_NAME} on port ${HOST_PORT}"
GITHUB_PAT_VAL="$(grep -oP '^GITHUB_PAT=\K.*' "${SCRIPT_DIR}/.env" 2>/dev/null || echo '')"
DISPUTE_QUORUM_RATIO_VAL="$(grep -oP '^DISPUTE_QUORUM_RATIO=\K.*' "${SCRIPT_DIR}/.env" 2>/dev/null || echo '')"
HMAC_SECRET_VAL="$(grep -oP '^HMAC_SECRET=\K.*' "${SCRIPT_DIR}/.env" 2>/dev/null || echo '')"

docker run \
  --detach \
  --init \
  --restart unless-stopped \
  --name "${CONTAINER_NAME}" \
  --publish "${HOST_PORT}:${CONTAINER_PORT}" \
  --memory 768m \
  --volume "${DATA_VOLUME}:/app/dist/server/data" \
  --volume "${SQLITE_VOLUME}:/app/data" \
  --env ADMIN_SECRET="$(grep -oP '^ADMIN_SECRET=\K.*' "${SCRIPT_DIR}/.env" 2>/dev/null || echo '')" \
  --env HMAC_SECRET="${HMAC_SECRET_VAL}" \
  ${GITHUB_PAT_VAL:+--env GITHUB_PAT="${GITHUB_PAT_VAL}"} \
  ${DISPUTE_QUORUM_RATIO_VAL:+--env DISPUTE_QUORUM_RATIO="${DISPUTE_QUORUM_RATIO_VAL}"} \
  "${IMAGE_NAME}"

# ── 5. Health check with retry ───────────────────────────────────────────────
echo "==> [deploy] Waiting for container to become healthy…"
HEALTHY=false
for i in 1 2 3; do
  sleep 2
  if docker ps --filter "name=^${CONTAINER_NAME}$" --filter "status=running" --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    HEALTHY=true
    break
  fi
  echo "==> [deploy] Health check attempt ${i}/3 — not yet running…"
done

if [ "${HEALTHY}" = true ]; then
  echo "==> [deploy] ✓ Container is running"
else
  echo "==> [deploy] ✗ Container failed to start — check deployment.log" >&2
  docker logs "${CONTAINER_NAME}" >&2 || true
  exit 1
fi

# ── 6. Deadline sweep — auto-seal any expired-unsealed posts ─────────────────
# POST /api/deadline-sweep seals posts whose resolution_deadline has passed but
# whose verdict was never sealed by the author (auto-verdict: 'abandoned').
# Idempotent — already-sealed posts are skipped. Skipped silently if no secret.
FILE_SECRET="$(grep -oP '^ADMIN_SECRET=\K.*' "${SCRIPT_DIR}/.env" 2>/dev/null || echo '')"
if [ -n "${FILE_SECRET}" ]; then
  echo "==> [deploy] Running deadline sweep…"
  # Give the Node process a moment to fully bind before hitting the endpoint.
  sleep 3
  SWEEP_RESPONSE=$(curl --silent --show-error --max-time 15 \
    --request POST \
    --header "Authorization: Bearer ${FILE_SECRET}" \
    "http://localhost:${HOST_PORT}/api/deadline-sweep" || echo '{"error":"curl failed"}')
  echo "==> [deploy] Deadline sweep response: ${SWEEP_RESPONSE}"
else
  echo "==> [deploy] Skipping deadline sweep (ADMIN_SECRET not set in .env)"
fi

# ── 7. OTS upgrade — promote any pending Bitcoin anchor proofs ───────────────
# POST /api/ots-upgrade upgrades pending OTS proofs to confirmed Bitcoin
# attestations where the calendar has already anchored (typically ~60 min after
# seal; no-op on first deploy). Safe to call repeatedly — idempotent by design.
if [ -n "${FILE_SECRET}" ]; then
  echo "==> [deploy] Running OTS upgrade sweep…"
  OTS_RESPONSE=$(curl --silent --show-error --max-time 20 \
    --request POST \
    --header "Authorization: Bearer ${FILE_SECRET}" \
    --header "Content-Type: application/json" \
    --data '{"limit":50}' \
    "http://localhost:${HOST_PORT}/api/ots-upgrade" || echo '{"error":"curl failed"}')
  echo "==> [deploy] OTS upgrade response: ${OTS_RESPONSE}"
else
  echo "==> [deploy] Skipping OTS upgrade (ADMIN_SECRET not set in .env)"
fi

# ── 8. Cell-metrics warm-up — eager-create cell_events schema & log baseline ─
# v150c — GET /api/metrics/cited-cells is read-only and unauthenticated;
# hitting it forces `ensureSchema()` inside the ledger module, which creates
# the `cell_events` table + indexes on the SQLite volume the very first time
# a deploy happens. Captures the rolling 7-day round-trip snapshot in
# deployment.log so operators have a before/after trail across deploys.
# Idempotent — safe to call on every redeploy. Never fails the script.
echo "==> [deploy] Warming up cell-metrics endpoint…"
METRICS_RESPONSE=$(curl --silent --show-error --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/metrics/cited-cells" \
  || echo '{"error":"curl failed"}')
echo "==> [deploy] Cell-metrics baseline: ${METRICS_RESPONSE}"

# ── 9. Prune dangling images from previous builds ────────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

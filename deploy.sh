#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
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

# ── 8. Prune dangling images from previous builds ────────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v76 — DecayClock Heartbeat + Atmosphere Cascade (2026-04-12)
#   Sprint: Pure UIX polish — DecayClock stage visibility rules, three heartbeat
#     profiles, card-scoped atmosphere, and a full color-mix() migration away from
#     the illegal rgba(var(--rgb), var(--alpha)) two-argument pattern.
#   Key changes:
#     src/lib/spring-easing.ts — HEARTBEAT_FRESH (833ms 72bpm ease-in-out delay:0),
#       HEARTBEAT_FADING (1090ms 55bpm ease-in-out delay:200ms), HEARTBEAT_CRITICAL
#       (1578ms 38bpm linear delay:600ms) typed profile constants; HeartbeatProfile
#       type exported. CSS vars --heartbeat-duration/easing/delay injected into
#       DecayClock inline style string.
#     src/styles/tokens.css — --clr-gold-400 (oklch(78% 0.14 68deg)) + --gold
#       backward-compat bridge; three --motion-heartbeat-{fresh/fading/critical}-*
#       duration/easing tokens matching profile constants above.
#     src/components/DecayClock.astro — decayFactor prop added; toDecayStage()
#       maps factor to fresh/fading/endangered/ghost/fossil; ring hidden for fresh
#       (<0.25) and fossil (>0.95); 30% opacity for fading; heartbeat CSS vars
#       emitted per stage; --clock-ring-opacity drives opacity rule; data-decay-stage
#       attr enables CSS [data-decay-stage] heartbeat animation selector.
#     src/components/DecayCard.astro — cardAtmosphere() computes per-card
#       fresh/fading/endangered/ghost/entombed; data-atmosphere attr scopes
#       --atm-bloom-color cascade to the card cell; decayFactor passed to DecayClock;
#       border + cover-gradient migrate rgba(--mood-accent-rgb) → color-mix(oklch).
#     src/components/KeepButton.astro — all six rgba(--mood-accent-rgb) usages
#       replaced with color-mix(in oklch, var(--atm-bloom-color, var(--keep-base)) N%,
#       transparent); pact-seal-pulse @keyframes migrated to color-mix too.
#     src/components/BloomParticles.astro — @media prefers-reduced-motion guard:
#       .bloom-particles, .bloom-ring, .bloom-flash { display: none } (Mike §6).
#     src/styles/decay.css — box-shadow migrated to color-mix(oklch); shadow
#       transition fixed to var(--motion-duration-deliberate) ease-in-out (was
#       --motion-drift-easing — Priority 1 bug); --card-computed-radius CSS var
#       introduced (calc: 20px → 4px, expanded from 16→8px); footer + cover-wrap
#       use var(--card-computed-radius) for concentric corners (Tanya §1.3).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v75 — Ghost Ring + Handle Polish (2026-04-12)
#   Sprint: Pure UIX polish — two P0 micro-details and one CSS correctness fix.
#     BattingAverageHero cold-state gets a dashed ghost ring (SVG, 10s linear
#     orbit, --gold-border amber stroke) that signals "the clock is running,
#     earning in progress" without implying data that doesn't exist yet. Ring
#     stays visible but paused under prefers-reduced-motion (clock metaphor
#     persists). StanceDrawer gains a 40×4px drag handle pill (border-radius:
#     9999px; CSS-only hover brightens from 18 % → 28 % white) — the standard
#     "pullable" vocabulary in the design system (Tanya §5.2 radius law).
#     tokens.css shadow system corrected: the illegal CSS pattern
#     rgba(var(--foo), var(--alpha)) (two-argument var inside rgba) replaced
#     by color-mix(in oklch, <color> <pct>%, transparent) — spec-compliant and
#     now works in all Baseline 2024 engines.
#   Updated files:
#     src/components/BattingAverageHero.astro — .bah-ghost-ring absolutely
#       positioned inside .bah-score--cold; two concentric SVG circles
#       (.bah-ring-outer stroke-dasharray 8 5, .bah-ring-inner 5 8 opacity 0.6);
#       @keyframes bah-ring-spin carries translate(-50%,-50%) on both from/to
#       to avoid first-frame position jump; mobile: 3.8rem (Tanya §18); reduced-
#       motion: animation-play-state paused.
#     src/components/StanceDrawer.astro — .stance-handle div inserted above
#       progress bar; 40×4px pill, margin 8px auto 0, rgba(255,255,255,0.18)
#       rest → 0.28 hover, transition var(--motion-duration-fast) ease.
#     src/styles/tokens.css — --shadow-card-fresh and --shadow-card-hover
#       converted from rgba(var(--mood-accent-rgb), var(--alpha)) to
#       color-mix(in oklch, var(--clr-amber-400) 22%/28%, transparent).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v74 — VerdictCeremony Entrance Choreography (2026-04-12)
#   Sprint: Three-act staggered entrance animations for VerdictCeremony; pure
#     CSS choreography extracted to verdict-ceremony.css. Each act has its own
#     kinetic signature: Act I slides in from left (conviction arrives),
#     Act II drops with a scale-spring (the gavel lands), Act III rises from
#     below (the reckoning settles). Child elements stagger at --child-index ×
#     80 ms (same engine as seal-ceremony.css receipt rows). IntersectionObserver
#     fallback in verdict-reveal.ts handles older browsers lacking @starting-style
#     CSS support — data-act-entered attribute triggers equivalent transitions.
#     Act III cold/muted state now uses filter-only (not opacity) so animation-
#     fill-mode: forwards in verdict-ceremony.css owns opacity without conflict.
#     Act II receives data-verdict attribute for outcome-tinted entrance hue.
#     --shadow-ceremony token added: deep ambient shadow for Act II badge drop.
#   New files:
#     src/styles/verdict-ceremony.css — three-act entrance choreography; pure
#       CSS @starting-style + animation-fill-mode: both (Baseline 2024); Act I
#       @keyframes vc-act-slide, Act II vc-act-drop, Act III vc-act-rise;
#       vc-child-enter stagger (--child-index custom property); @supports fallback
#       block for browsers without :has() hides [data-act] until JS sets
#       data-act-entered; prefers-reduced-motion guard collapses all to instant
#       opacity cross-fade; all timing from motion.css tokens.
#   Updated files:
#     src/components/VerdictCeremony.astro — imports verdict-ceremony.css;
#       data-act="1|2|3" on all three .vc-act divs; data-verdict={verdictOutcome}
#       on Act II; data-act-state="entered|pending" on Act III; .vc-act3 CSS
#       revised to filter-only (saturate+brightness muted, filter: none revealed);
#       @starting-style block for .vc-act3--revealed removed (verdict-ceremony.css
#       owns entrance via [data-act="3"] selector instead).
#     src/lib/client/verdict-reveal.ts — initActFallback() added: detects CSS
#       @starting-style / :has() support via CSS.supports(); if absent builds an
#       IntersectionObserver (threshold 0.1) that sets data-act-entered on each
#       [data-act] element when scrolled into view; always called before SSE init.
#       revealActThree() also sets act3.dataset.actState='entered' to re-trigger
#       vc-act-rise entrance animation on live SSE verdict resolution.
#     src/styles/tokens.css — --shadow-ceremony added: deep ambient two-layer
#       box-shadow (oklch 45% + 20% opacity) for Act II verdict badge drop.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v73 — KEEP-WEIGHT Bloom (2026-04-12)
#   Sprint: KeepButton bloom ceremony — hold-to-keep now fires a 3-phase micro-
#     animation on the DecayCard: particle burst (12 orbs, staggered 0–80 ms),
#     bloom ring (spring overshoot, 800 ms), warm-breath card glow (600 ms fade).
#     Atmosphere-aware: --atm-bloom-color overrides per stage so the burst hue
#     matches the page mood (amber endangered → emerald risen → gold vindicated).
#     DecayCard footer reduced to exactly 3 slots (clock · badge · keep) with a
#     48px fixed height, border-top, backdrop-filter blur(8px), and bottom-radius
#     pinned to --radius-card. Badge priority cascade: risen > tension > revival.
#     decay-freshness span and footer-dot removed (de-cluttered).
#   Updated files:
#     src/components/BloomParticles.astro — <style> block added: .bloom-particles,
#       .bloom-particle (opacity 0 at rest), .bloom-ring, .bloom-flash; .decay-card
#       .blooming trigger rules; @keyframes bloom-burst / bloom-ring-expand /
#       bloom-warm-breath. No new HTML — animations are CSS-only class toggles.
#     src/components/KeepButton.astro — adds/removes .blooming on .decay-card
#       ancestor on optimistic success; rolled back on network error; aria-label
#       updated to reflect hold interaction weight.
#     src/lib/client/revival-orchestrator.ts — onRevived() fires .blooming on the
#       enclosing .decay-card element after successful POST /api/revive; clears
#       class after ceremony duration (800 ms).
#     src/components/DecayCard.astro — footer rewritten: 3-slot flex row, 48px
#       height, margin-top: auto (card is now flex-column), border-top, glass
#       backdrop, bottom corner radius. Badge slot is a single conditional render
#       (risen > tensionResult ≠ 'indifferent' > revivalCount > 0 > null).
#     src/styles/tokens.css — --radius-card/drawer/pill/badge/input/modal aliases
#       (single source of truth for border-radius; --radius kept as legacy alias);
#       --keep-base/pressed/accent/warm palette; --atm-bloom-color default.
#     src/styles/atmosphere.css — --atm-bloom-color per stage overrides (fresh:
#       gold, endangered: amber, entombed: dim, risen: emerald, verdict: slate,
#       vindicated: emerald, gold: amber); atmosphere-aware --shadow-card-lift and
#       --shadow-card-hover per Tanya §7.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v72 — Ceremony Atmosphere (2026-04-11)
#   Sprint: Conviction seal ceremony now drives body atmosphere lifecycle.
#     Two new AtmosphereStage values ('gold', 'vindicated') wire the seal
#     hold → POST-in-flight → receipt-landed flow to full-page ambient lighting.
#     RiverFilter pill rail made sticky (top: 48px, glass backdrop blur) so the
#     stage filter stays reachable while scrolling the river. BattingAverageHero
#     min-height tightened to clamp(480px, 60vh, 680px) — invites scroll.
#   New files:
#     src/lib/ceremony-atmosphere.ts — ceremony lifecycle → atmosphere bridge;
#       ceremonyStart() (phase 2 → gold), ceremonyResolve() (phase 4 → vindicated,
#       300 ms settle delay), ceremonyAbort() (escape / nav → fresh); dispatches
#       ceremony:start / ceremony:resolved / ceremony:aborted CustomEvents for
#       loose pub/sub. Pure client side — zero DB or API impact.
#   Updated files:
#     src/lib/atmosphere.ts — AtmosphereStage union extended with 'gold' and
#       'vindicated' (seal-ceremony lifecycle stages; RIVER_TO_ATMOSPHERE
#       unchanged — stages are ceremony-only, not river-filter stages).
#     src/components/ConvictionSeal.astro — imports ceremony-atmosphere; boxed
#       active flag guards abort against spurious phase-0 fires; Escape key
#       aborts when phase < 3 (POST not yet in flight); astro:before-preparation
#       listener ensures gold atmosphere never leaks across View Transition pages.
#     src/components/BattingAverageHero.astro — min-height: calc(100vh - 48px)
#       → clamp(480px, 60vh, 680px); hero is present but no longer full-screen.
#     src/components/RiverFilter.astro — sticky pill rail; top:48px tracks
#       SiteNav height; surface-overlay glass backdrop; border-bottom faint rule.
#     src/styles/atmosphere.css — [data-atmosphere="gold"]: amber 2.5% tint +
#       gold-breathe 3s pulse keyframe (0.4% amplitude — subliminal); [data-
#       atmosphere="vindicated"]: emerald clarity settle (no keyframe — DRIFT
#       transition from gold handles it naturally).
#     src/styles/seal-ceremony.css — receipt rows gain @starting-style staggered
#       entrance (80 ms/row via --row-index); seal-receipt-hash gains hash-ink-dry
#       keyframe (ghost-white → gold-dim over 800 ms — etching feel).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v71 — Token Migration Sprint (2026-04-11)
#   Sprint: Pure UIX/design-system polish — all remaining hardcoded rgba() values
#     in StanceDrawer, DisputeTally, VerdictCeremony, TrackRecord, TensionBadge,
#     and dispute.css migrated to global design-system tokens. 27 new tokens added
#     to tokens.css; `.section-break` / `.section-rule` utility classes added to
#     global.css. Atmosphere cascade now fully covers all migrated components.
#     Local token fork in TrackRecord deleted (single source of truth restored).
#   Updated files:
#     src/components/DisputeTally.astro — dispute-state border/bg replaced with
#       --color-dispute-contested-border/bg, --color-dispute-overturned-border/bg,
#       --color-dispute-upheld-border/bg tokens.
#     src/components/StanceDrawer.astro — 27 inline rgba() values replaced with
#       --overlay-scrim, --surface-modal, --border-light, --shadow-drawer,
#       --text-secondary, --text-dim, --text-ghost, --surface-raised, --surface-hover,
#       --border-subtle, --border-interactive-hover, --gold-bg-strong,
#       --gold-border-strong, --stance-torn, --stance-disagree-bg/border/color,
#       --border-medium, --gold, --surface-base tokens.
#     src/components/TensionBadge.astro — hardcoded colours replaced with tokens.
#     src/components/TrackRecord.astro — local token fork removed; global tokens used.
#     src/components/VerdictCeremony.astro — rgba() values replaced with tokens.
#     src/styles/dispute.css — state badge border/bg and @keyframes glow replaced
#       with --color-dispute-*-border/bg and --color-dispute-flash-glow tokens.
#     src/styles/global.css — .section-break and .section-rule utility classes added
#       (replaces 12+ inline border-top patterns across components).
#     src/styles/tokens.css — 27 new tokens: dispute state bg/border tints
#       (color-mix oklch); --color-dispute-flash-glow; overlay/modal/shadow/drawer
#       surface tokens; stance-disagree alias set; section-break spacing tokens.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v70 — Atmosphere System (2026-04-11)
#   Sprint: Stage-scoped page atmosphere — body[data-atmosphere] CSS palette shift
#     driven SSR-side and updated client-side on river filter pill change.
#     Each lifecycle stage (fresh / endangered / entombed / risen / verdict)
#     paints its own surface token set so the whole page breathes the stage mood.
#     Pure UIX/design-system sprint — zero infrastructure changes.
#   New files:
#     src/lib/atmosphere.ts — client-side atmosphere controller; single mutation
#       point for body[data-atmosphere]; RIVER_TO_ATMOSPHERE map; MutationObserver
#       watches river-filter aria-pressed changes; re-boots on astro:page-load
#       (View Transitions safe).
#     src/styles/atmosphere.css — [data-atmosphere] attribute CSS; stage overrides
#       (endangered: amber tension; entombed: fossil charcoal + grain; risen: dawn
#       luminous; verdict: outcome-conditional 4% color-mix into near-black);
#       [data-disputed="true"] composable modifier; TensionBadge heartbeat keyframe;
#       share-confirm-pulse glow animation; body transition uses --motion-drift-*.
#   Updated files:
#     src/layouts/BaseLayout.astro — imports atmosphere.css; Props extended with
#       atmosphere, verdictOutcome, disputed; data-atmosphere / data-disputed /
#       data-verdict-outcome attrs on <body>; <script> imports atmosphere.ts for
#       client-side observer boot.
#     src/pages/index.astro — STAGE_TO_ATMOSPHERE map; atmosphere SSR-set from
#       currentStage; atmosphere prop passed to <BaseLayout>.
#     src/pages/blog/[slug].astro — atmosphere='fresh' passed to <BaseLayout>.
#     src/pages/verdict/[slug].astro — atmosphere='verdict' + verdictOutcome +
#       disputed forwarded to <BaseLayout>.
#     src/styles/tokens.css — --atm-* token family added to :root defaults
#       (--atm-bg-primary, --atm-bg-secondary, --atm-tint, --atm-border-color,
#       --atm-shadow-lift, --atm-grain-opacity, --atm-sepia-filter, --atm-glow-color).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v69 — Design Token Standardization (2026-04-11)
#   Sprint: Replaced hardcoded hex colours in VerdictCard, TombstoneCard,
#     keep-button.css and verdict.css with design-system tokens from tokens.css.
#     Pure UIX/design-system polish sprint — zero infrastructure changes.
#   Updated files:
#     src/styles/tokens.css — added --clr-emerald-500, --clr-amber-500 (oklch);
#       --stance-agree/torn/disagree semantic aliases; --verdict-*-bg and
#       --verdict-*-border color-mix tints (oklch P3-safe); backward-compat
#       --correct-bg/wrong-bg/pending-bg/evolved-bg aliases preserved;
#       --radius-tombstone updated to "8px 8px 0 0" (crown-rounded, flat base);
#       --shadow-card-disputed now uses color-mix(oklch) instead of rgba().
#     src/components/VerdictCard.astro — all hardcoded #f59e0b/#10b981/#f87171
#       replaced with --gold, --stance-agree, --stance-torn, --stance-disagree.
#     src/components/TombstoneCard.astro — border-radius switched from literal
#       "8px 8px 0 0" to var(--radius-tombstone) (single source of truth).
#     src/styles/keep-button.css — removed #f87171 fallback from --verdict-wrong
#       (token now always defined; fallback was a dead letter).
#     src/styles/verdict.css — filter-tab border/background replaced with
#       --verdict-*-border / --verdict-*-bg token pairs.
#     AGENTS.md — sprint logged.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v68 — Graveyard Pagination (2026-04-11)
#   Sprint: Server-side paginated graveyard view (?stage=graveyard&page=N);
#     20 tombstones/page; URL-driven, crawlable, shareable. Pure SSR/UIX sprint.
#   New files:
#     src/lib/pagination.ts — generic paginate<T>(), parsePage(), paginateURL()
#       utilities; pure functions, zero side-effects, zero DB access; includes
#       inline sanity checks (_testPagination). Reusable for any list beyond
#       graveyard.
#     src/components/Pagination.astro — accessible page-turn nav; window of 5
#       pills centered on current page; ellipsis for large ranges; ← older graves
#       / newer graves → edge arrows; aria-current="page"; aria-disabled on dead
#       edges; 44px tap targets; FLOW (200ms) active ring; reduced-motion guard;
#       graveyard design tokens (--color-grave-border, --color-grave-ghost, --gold).
#     src/pages/api/graveyard-page.ts — GET /api/graveyard-page?page=N&pageSize=20;
#       returns { posts: LedgerEntry[], pagination: PaginationMeta }; pageSize
#       capped at 50; Cache-Control: no-store (live revival counts); prerender=false.
#   Updated files:
#     src/pages/index.astro — ?page=N param parsed via parsePage(); graveyard stage
#       renders gravePagePosts slice (20/page) via paginate(); GraveyardLedger still
#       receives allEntombed (aggregate — unchanged); <Pagination> rendered below
#       tombstone grid when totalPages > 1; non-graveyard stages unaffected.
#     AGENTS.md — graveyard pagination added to Done list; Key Paths updated with
#       pagination.ts and graveyard-page API.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v67 — Stage Filter Pill Rail (2026-04-11)
#   Sprint: RiverFilter refactored from verdict-outcome tabs to lifecycle-stage
#     pill rail (live / endangered / graveyard). Stage IS the product's navigation
#     identity — always visible, no cold-start hide rule. Pure UIX/design sprint.
#   New files:
#     src/components/StagePill.astro — single pill button; renders active/inactive
#       states; shows SSR count badge; data-pill-id + data-count attrs for client
#       refresh; accessible <a> link that drives ?stage= URL param.
#     src/pages/api/stage-counts.ts — GET /api/stage-counts → { live, endangered,
#       graveyard, computedAt }; public, no auth; Cache-Control 30s/60s SWR;
#       used by RiverFilter client-side refresh to keep count badges current
#       without a full page reload.
#     src/styles/river-filter.css — design-token-compliant stage filter styles;
#       pill rail layout; active/inactive pill tokens; count badge; zero magic
#       colours; extracted from RiverFilter.astro inline styles.
#   Updated files:
#     src/components/RiverFilter.astro — switched from VerdictFilter (?verdict=)
#       to StageFilter (?stage=); uses StagePill; always visible; client fetch
#       of /api/stage-counts on mount to refresh count badges.
#     src/lib/river-data.ts — StageFilter type, StageCounts interface,
#       getStageCounts(), filterByStage() added; pure helpers, no DB reads.
#     src/pages/index.astro — ?stage= param drives filterByStage(); RiverFilter
#       receives currentStage + counts props; verdict filter removed from homepage.
#     src/pages/endangered.astro — updated to use stage filter helpers.
#     src/pages/graveyard.astro — updated to use stage filter helpers.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     deploy.sh: no changes to startup sequence or post-start hooks.
#
# Architecture v66 — Crystallized Card Stage & Shimmer (2026-04-11)
#   Sprint: 4th decay stage 'crystallized' (ratio ≥ 1.0) added to OpenLoopCard;
#     crystallized cards are pinned to history with a museum-glass aesthetic and
#     a single-pass cold shimmer sweep on hover. Pure UIX/design-system sprint.
#   Updated files:
#     src/components/OpenLoopCard.astro — loopStage() now returns 'crystallized'
#       when decay ratio ≥ 1.0; cardClass emits 'loop-stale loop-crystallized'
#       (additive); crystallizedDate() formats the seal date; footer badge with
#       ◆ crystallized · Mon YYYY; CSS: .loop-crystallized museum-glass override
#       (no hover elevation, inset ring); ::before shimmer layer (off-screen at
#       rest, single-pass cold sweep on hover via animation shimmer-glass).
#     src/styles/motion.css — --duration-museum: 1400ms token added (deliberate
#       shimmer pace); @keyframes shimmer-glass (-200%→200% background-position);
#       prefers-reduced-motion: --duration-museum → 0ms.
#     src/styles/tokens.css — --z-shimmer: 2 (above card content, below nav);
#       --z-onboarding: 150 (above modal, below toast); crystallized card tokens:
#       --clr-crystallized-shimmer, --clr-crystallized-border,
#       --clr-crystallized-tint (cold oklch palette — signals history, not urgency).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     deploy.sh: no changes to startup sequence or post-start hooks.
#
# Architecture v65 — First-Visit Onboarding Overlay (2026-04-11)
#   Sprint: 3-step full-screen onboarding overlay for first-time visitors;
#     explains the post lifecycle (decay → conviction seal → verdict tracking).
#     Pure UIX/frontend feature — no infrastructure changes.
#   New files:
#     src/components/OnboardingOverlay.astro — fixed-position overlay dialog;
#       3 steps (Posts decay / Authors seal bets / Truth is tracked); CSS state
#       machine driven by [data-step="1|2|3"] on overlay root; entrance
#       (ov-enter spring) and exit (ov-exit fade) animations; mobile bottom-sheet
#       layout (≤480px); reduced-motion guard; Escape/arrow-key/swipe navigation.
#     src/components/ConvictionDemo.astro — hardcoded ghost post cycling through
#       lifecycle states; pure presentational, zero lib imports, zero DB calls;
#       step visibility via :global([data-step]) CSS selectors; avoids 3× HTML
#       duplication. Values frozen: decay=0.42, conviction=8/10, avg=73%.
#     src/lib/client/onboarding.ts — client-side state machine; localStorage
#       ov_seen + SSR cookie gate (return visitors skip overlay without a round-
#       trip); shouldShow() checks both gates + ?onboarding=1 URL override;
#       dismiss() fires POST /api/onboarding-dismiss (best-effort analytics) then
#       exits overlay with CSS exit animation; keyboard (Escape/←/→) + swipe
#       (±50 px threshold) + dot navigation wired at requestIdleCallback idle.
#     src/pages/api/onboarding-dismiss.ts — POST /api/onboarding-dismiss;
#       sets onboarding_seen cookie (1yr, SameSite=Lax) for SSR gate;
#       records drop-off step via appendAnalytic() in conviction_ledger
#       (event_type='onboarding_dismiss', slug='__onboarding__'); always 200;
#       analytics is best-effort (never throws). prerender=false.
#   Updated files:
#     src/layouts/BaseLayout.astro — imports OnboardingOverlay; SSR cookie check
#       (Astro.cookies.has('onboarding_seen')); ?onboarding=1 URL override;
#       <OnboardingOverlay> rendered after <SiteNav> when showOnboarding=true;
#       zero HTML emitted for return visitors on SSR pages.
#     src/lib/conviction-ledger.ts — 'onboarding_dismiss' added to
#       LedgerEventType union; appendAnalytic(slug, eventType, payload) helper
#       added — best-effort ledger write for analytics events; never throws.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (onboarding_dismiss events written to
#       existing conviction_ledger table — no schema changes needed).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     DISPUTE_QUORUM_RATIO optional (float 0..1, default 0.3).
#     deploy.sh: no changes to startup sequence or post-start hooks.
#
# Architecture v64 — OTS Bitcoin Anchor (2026-04-11)
#   Sprint: Belt-and-suspenders timestamping — conviction seals now stamped with
#     both RFC 3161 (instant) AND OpenTimestamps Bitcoin anchor (~60 min confirm).
#     Partial-success semantics: one failure never blocks the other; HMAC seal
#     always valid regardless of timestamp availability.
#   New files:
#     src/lib/ots-client.ts — binary TLV OTS protocol; submit() fans out to 3
#       calendars (alice/bob/finney) in parallel, returns first success;
#       upgrade() fetches confirmed ops from calendar URL, combines with pending
#       proof; serializeDetachedFile() wraps in DetachedTimestampFile envelope
#       (compatible with opentimestamps.org web verifier); applyOps() / readVarInt()
#       / stripPendingAttestation() binary helpers. Zero extra npm deps.
#     src/lib/ots-verifier.ts — trustless verify against Bitcoin via
#       Blockstream.info REST API; parseBitcoinHeight() extracts block height
#       from proof; verify() returns { status:'confirmed'|'pending'|'unverifiable',
#       blockHeight, blockTime }. No Bitcoin node required.
#     src/lib/timestamp-facade.ts — stampAll(hash) runs RFC 3161 + OTS in
#       parallel via Promise.allSettled; returns CompositeStampResult
#       { rfc3161, ots, tsaName, errors }; neither blocks the other.
#     src/pages/api/ots-upgrade.ts — POST /api/ots-upgrade; admin-only batch
#       upgrade of pending OTS proofs (ots_status='pending') to confirmed Bitcoin
#       attestations; default limit 20, max 100; idempotent; intended for cron
#       (~60 min interval after seals are created); returns { upgraded,
#       stillPending, failed, errors }.
#   Updated files:
#     src/lib/conviction-ledger.ts — ots_proof BLOB, ots_status TEXT,
#       ots_calendar_url TEXT columns added (ALTER TABLE auto-migrated on first
#       run; same SQLITE_VOLUME — no manual migration needed);
#       updateOtsProof() / getOtsProof() / getPendingOtsSeals() added.
#     src/pages/api/conviction-seal.ts — stamp() replaced by stampAll() from
#       timestamp-facade; RFC 3161 result stored as before; OTS pending proof
#       stored via updateOtsProof(); composite errors logged (fail-open).
#     src/pages/api/trust-verify/[slug].ts — verifyOts() added alongside
#       verifyToken(); both run in Promise.allSettled; response extended with
#       ots field { status, blockHeight, blockTime } (backward-compatible).
#     src/components/AuditReceipt.astro — OTS proof badge: BITCOIN ANCHORED /
#       PENDING ANCHOR / NOT ANCHORED state; blockHeight + blockTime display.
#     src/pages/audit/[slug].astro — OTS data fetched via getOtsProof() and
#       passed to AuditReceipt; no additional DB queries.
#     src/styles/tokens.css — minor token additions for OTS badge colours.
#   Infrastructure: no new services, volumes, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (ots_* columns auto-migrated on first run).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     DISPUTE_QUORUM_RATIO optional (float 0..1, default 0.3).
#     deploy.sh: POST /api/ots-upgrade called post-start to upgrade any pending
#       proofs left from previous deploys (idempotent; typically 0 on first run
#       as Bitcoin confirmation takes ~60 min — effective on subsequent runs).
#
# Architecture v63 — Conviction Leaderboard & Author Profiles (2026-04-11)
#   Sprint: Multi-author leaderboard + per-author conviction profile pages.
#     Pure data + UIX extension — no new infrastructure.
#   New files:
#     src/lib/leaderboard.ts — per-author batting average aggregation; reuses
#       tallyVerdicts() / toPercent() from batting-average.ts; AuthorStats type
#       (slug, avg, firstSeal, rank, isActive); getLeaderboard() ranks all authors
#       with ≥1 seal by pct DESC → total DESC → firstSeal ASC; getAuthorStats()
#       returns a single author's stats or null.
#     src/pages/leaderboard.astro — SSR public leaderboard at /leaderboard;
#       ranked LeaderboardCard list; cold state ("no verdicts resolved yet") when
#       board is empty; prerender=false.
#     src/components/LeaderboardCard.astro — single ranked author row; rank badge
#       (gold/silver/bronze/rest); avatar initial; slug link to /author/[slug];
#       pct score; W/L/P record; isActive dot; links to author profile page.
#     src/pages/author/[slug].astro — per-author conviction profile at
#       /author/[slug]; author-scoped TrackRecord (filters posts to seals by this
#       author); displayAvg from getAuthorStats(); avatar + firstSeal date header;
#       404-redirect to /leaderboard for unknown authors; prerender=false.
#     src/pages/api/leaderboard.ts — GET /api/leaderboard → full ranked list
#       (AuthorStats[]); GET /api/leaderboard?author=X → single author stats (404
#       if not found); public read, no auth; Content-Type: application/json.
#     src/styles/leaderboard.css — design-token-compliant stylesheet for
#       leaderboard page + LeaderboardCard + author profile page; zero hardcoded
#       colours; rank badge colour tokens lb-rank--gold/silver/bronze/rest;
#       isActive indicator dot; responsive grid.
#   Updated files:
#     src/lib/batting-average.ts — tallyVerdicts() + toPercent() exported
#       (previously private); Counts + VerdictEventRow interfaces exported; allows
#       leaderboard.ts to reuse the single verdict-tally algorithm without
#       duplicating logic.
#     src/lib/conviction-ledger.ts — author_slug column added to conviction_ledger
#       (ALTER TABLE auto-migrated; nullable DEFAULT 'host' — all existing seals
#       get author_slug = 'host' on first run); runInsert() + insertEvent() +
#       sealConviction() accept optional authorSlug='host'; getAllAuthorSlugs() +
#       getSealsByAuthor() + getVerdictEventsForSlugs() added for leaderboard reads.
#     src/lib/nav.ts — 'leaderboard' added to PageId union + PAGE_PREFIXES mapping.
#     src/components/SiteNav.astro — /leaderboard nav link added after verdict
#       (nav-link--overflow so it collapses on narrow viewports).
#     src/pages/api/conviction-seal.ts — optional author_slug field accepted in
#       POST body; SLUG_RE validation (lowercase alphanumeric + hyphens, 2–32
#       chars); defaults to 'host' when omitted; backward-compatible.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     conviction_ledger gets author_slug column auto-migrated on first run
#     (same SQLITE_VOLUME — no manual migration needed).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     DISPUTE_QUORUM_RATIO optional (float 0..1, default 0.3).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v62 — Conviction Seal Unification (2026-04-11)
#   Sprint: ConvictionSeal unified component — replaces AdminSealForm +
#     ConvictionHero + ConvictionDeclaration with a single context-aware
#     component; 5-phase CSS/TS seal ceremony; motion token expansion.
#     Pure UIX/design-system refactoring — no infrastructure changes.
#   New files:
#     src/components/ConvictionSeal.astro — unified seal ceremony component;
#       context="post" renders conviction display (score, clock, tension,
#       trust badge) when sealed, ceremony form when unsealed; context="admin"
#       always shows the ceremony form. CSS custom property --seal-phase (0–4)
#       drives all visual transitions. Progressive enhancement: works as plain
#       <form> without JS.
#     src/lib/seal-ceremony.ts — pure TS state machine for the 5-phase seal
#       ceremony (0=idle, 1=hover, 2=press, 3=lock/fetching, 4=receipt);
#       CeremonyCallbacks interface (onPhase, onReceipt, onError); fetchSeal()
#       POSTs to /api/conviction-seal; ceremony_phase field in response drives
#       client to advance to receipt phase automatically.
#     src/styles/seal-ceremony.css — CSS animations for the seal ceremony;
#       @starting-style entrance, stamp-down keyframe (phase 2), lock-in spring
#       (phase 3), receipt slide-up (phase 4); .seal-dot fill transitions;
#       .seal-weight-meter scaleY interpolated via --seal-phase; reduced-motion
#       guard collapses all beats to a single opacity reveal.
#   Deleted files:
#     src/components/AdminSealForm.astro — superseded by ConvictionSeal
#       context="admin".
#     src/components/ConvictionDeclaration.astro — superseded by ConvictionSeal.
#     src/components/ConvictionHero.astro — superseded by ConvictionSeal
#       context="post".
#   Updated files:
#     src/pages/admin.astro — AdminSealForm → ConvictionSeal context="admin";
#       simplified props (slug, title only; sealed/score/sealedAt resolved
#       internally by ConvictionSeal via getSealEntry()).
#     src/pages/blog/[slug].astro — ConvictionHero → ConvictionSeal
#       context="post"; graceState, revivalCount, conviction, tensionResult,
#       tst props forwarded unchanged.
#     src/pages/api/conviction-seal.ts — response contract extended with
#       ceremony_phase: 4 field; client uses this to advance to receipt phase
#       automatically after a successful seal POST; backward-compatible (new
#       field only).
#     src/styles/tokens.css — motion tokens added: --motion-duration-fast
#       (150ms micro feedback), --motion-duration-base (300ms ceremony phases),
#       --motion-duration-deliberate (500ms lock + receipt entrance);
#       --motion-easing-spring (cubic-bezier overshoot for weight feel),
#       --motion-easing-standard (ease-in-out).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged — no schema changes this sprint).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     DISPUTE_QUORUM_RATIO optional (float 0..1, default 0.3).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v61 — Conviction Loop Closure (2026-04-11)
#   Sprint: Component consolidation + OKLCH design-system migration + API contract
#     hardening. Pure UIX/design-system refactoring — no infrastructure changes.
#   New files:
#     src/components/DecayBar.astro — unified decay state visualiser; replaces
#       ErosionBar + FreshnessIndicator; three output modes: bar (vitality meter),
#       pill (inline badge), ring (SVG arc for cards); single source of urgency
#       colour logic referencing tokens.css vars only.
#     src/components/DecayClock.astro — unified countdown; replaces DeathClock +
#       DeadlineClock + DeathClockBanner; three variants (ring/compact/banner);
#       zero duplicated urgency logic; variant="banner" matches old DeadlineClock
#       layout needs exactly.
#   Deleted files:
#     src/components/ErosionBar.astro — superseded by DecayBar mode="bar".
#     src/components/FreshnessIndicator.astro — superseded by DecayBar mode="pill".
#     src/components/DeathClock.astro — superseded by DecayClock variant="ring".
#     src/components/DeadlineClock.astro — superseded by DecayClock variant="banner".
#   Updated files:
#     src/components/VerdictReveal.astro — rewritten as 3-beat pure-CSS ceremony
#       (gold pulse → hash reveal → timestamp stamp-in); old community-dispute
#       reveal logic removed (lives in VerdictCeremony.astro); no SSE dependency;
#       reduced-motion guard collapses all three beats to a single opacity reveal.
#     src/lib/batting-average.ts — gate lowered ≥3 → ≥1 resolved verdict (cold-
#       start visibility improvement); evolved verdicts now count as 0.5× wrong in
#       denominator (closes self-grading loophole); QUORUM_MIN_DISAGREE = 5
#       (engagement gate — quorum window only opens after ≥5 disagree-stancers).
#     src/lib/verdict-dispute.ts — quorum floor fix: Math.max(3, ceil(n × 0.30))
#       ensures at least 3 challenges required even for low-engagement posts.
#     src/pages/api/verdict-resolve.ts — response contract extended: now returns
#       postSlug + newBattingAverage alongside existing ok/verdict/hmac_seal/
#       sealedAt/hash; SSE broadcast payload unchanged (backward-compatible).
#     src/styles/tokens.css — OKLCH migration complete for all primitives; new
#       tokens: --correct-bg, --wrong-bg, --pending-bg, --evolved-bg,
#       --surface-deep, --shadow-seal-ceremony, --shadow-card-disputed.
#     src/components/BattingAverageHero.astro — magic hex values → token references;
#       ui-monospace → var(--font-mono).
#     src/components/VerdictCard.astro — magic hex values → token references.
#     src/components/VerdictCeremony.astro — magic hex values → token references;
#       motion profile variables replace hardcoded timing.
#     src/components/SiteNav.astro — magic hex values → token references;
#       ui-monospace → var(--font-mono); ghost chip is now an <a> link to
#       /track-record (was pointer-events: none).
#     src/pages/verdict.astro — magic hex values → token references.
#     src/styles/verdict.css — outcome-variant styles updated to reference new
#       --correct-bg / --wrong-bg / --pending-bg tokens.
#     src/components/ConvictionHero.astro — minor token alignment.
#     src/components/DecayCard.astro, EndangeredCard.astro, OpenLoopCard.astro,
#       community/[slug].astro, community/index.astro, blog/[slug].astro —
#       DeathClock → DecayClock; ErosionBar/FreshnessIndicator → DecayBar imports
#       updated; no behavioural changes.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged — no schema changes this sprint).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     DISPUTE_QUORUM_RATIO optional (float 0..1, default 0.3).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v60 — Quorum Resolution Engine + VerdictReveal Ceremony (2026-04-11)
#   Sprint: 72h dispute window; upheld/overturned final states; VerdictReveal
#     ceremony component; deadline-sweep now co-sweeps expired dispute windows.
#   New files:
#     src/components/VerdictReveal.astro — dispute resolution ceremony; SSR +
#       live SSE reveal via /api/dispute-sse; two-outcome CSS token sets
#       (upheld/overturned); quorum share bar with 30% threshold marker;
#       inline script closes SSE once resolution received; data-state drives
#       all branching (Mike §3); prefers-reduced-motion collapses to opacity.
#   Updated files:
#     src/lib/dispute-quorum.ts — QUORUM_WINDOW_MS = 72h from first dispute;
#       resolveIfQuorumExpired() closes window → writes upheld|overturned to
#       dispute_resolutions; resolveAllExpiredDisputes() sweeps all contested
#       slugs; resolvedState() maps challenge count to final outcome; imports
#       resolution accessors from verdict-dispute.ts.
#     src/lib/verdict-dispute.ts — dispute_resolutions table auto-created
#       in revivals.db (PRIMARY KEY post_slug, state, resolved_at,
#       challenge_share_pct REAL); getWindowOpenedAt() reads MIN(timestamp)
#       from verdict_disputes; getDisputeResolution() / writeDisputeResolution()
#       read/write final state (INSERT OR IGNORE — idempotent); getResolvedVerdictCount()
#       for BattingAverageHero gate; getContestedSlugs() returns slugs with
#       disputes but no resolution yet. DisputeResolutionState + DisputeResolution
#       types exported.
#     src/lib/verdict-resolver.ts — VerdictState type (unaudited → pending →
#       contested → upheld | overturned) Mike §1 state machine; getVerdictState()
#       combines sealed verdict + community resolution into one value; safe SSR
#       read. getResolvedVerdictCount() re-exported for convenience.
#     src/pages/api/deadline-sweep.ts — resolveAllExpiredDisputes() called
#       alongside autoSealExpired(); disputeResolved count + disputeResults
#       array added to JSON response; one sweep closes both expired post
#       verdicts and expired dispute windows.
#     src/pages/api/verdict-dispute.ts — resolveIfQuorumExpired() called on
#       each new dispute recording; resolution field added to response so
#       client knows immediately if window just closed.
#     src/pages/verdict/[slug].astro — VerdictReveal rendered when resolution
#       exists; SSR serves resolved state; SSE patches live for concurrent
#       visitors.
#     src/styles/verdict.css — VerdictReveal ceremony styles; --verdict-upheld /
#       --verdict-overturned colour tokens; verdict-reveal__word variant classes.
#     src/components/BattingAverageHero.astro — getResolvedVerdictCount() gate
#       (hide % until ≥3 resolved verdicts — Mike §4 cold-start rule).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     dispute_resolutions table auto-created in revivals.db on first run
#     (same SQLITE_VOLUME — no migration needed). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor). DISPUTE_QUORUM_RATIO optional.
#     deploy.sh: POST /api/deadline-sweep still called post-start (now also
#       sweeps expired dispute windows via resolveAllExpiredDisputes()).
#
# Architecture v59 — Revival Orchestrator Unification (2026-04-11)
#   Sprint: Single-source-of-truth hold-to-revive lifecycle; state machine
#     promoted to dedicated RevivalOrchestrator class; CSS extracted to
#     design-system stylesheets; haptic milestones granularised.
#   New files:
#     src/lib/client/revival-orchestrator.ts — RevivalOrchestrator class;
#       idle→holding→threshold_reached→submitting→revived|error state machine;
#       pure springStep() rAF loop; haptic milestones at 25/50/75/100% arc;
#       AbortController for in-flight fetch cancel; dispatches revival:confirmed
#       CustomEvent; initOrchestrators() auto-wires every .keep-btn in the DOM.
#     src/styles/keep-button.css — extracted KeepButton CSS; @property
#       --keep-progress and --keep-heat; color-mix(in oklch) temperature shift
#       cool→warm; arc-complete spring keyframe; submitting pulse; error shake;
#       critical urgency ring; cursor:grab UX grammar (Mike §2); reduced-motion
#       guard removes all hold choreography.
#     src/styles/revival-moment.css — bloom choreography for post detail page;
#       revival-scale-spring; revival-bloom radial glow (oklch warm amber);
#       revival-count-tick spring; badge-slide-up; sympathetic-echo for adjacent
#       cards; reduced-motion guard collapses all to badge-only feedback.
#   Updated files:
#     src/components/KeepButton.astro — data-state → data-keep-state; aria-pressed
#       + role="button" added; initCeremonies → initOrchestrators; CSS state
#       selectors aligned to new state names; SETTLED state removed (revived
#       handles settle inline); data-orchestrated guard prevents double-wiring.
#     src/layouts/BaseLayout.astro — imports keep-button.css + revival-moment.css
#       globally so both stylesheets are available on every page (design system
#       layering: tokens → motion → feature CSS).
#     src/lib/client/haptics.ts — HOLD_25 / HOLD_50 / HOLD_75 milestone patterns
#       added alongside existing TENSION_RAMP alias (backward-compatible).
#     src/pages/api/revive.ts — sessionConflict() (429) replaced by alreadyRevived()
#       (200 ok:false reason:'already_revived') so double-tap never breaks client
#       animation; survivorRank field added to success response (percentile of this
#       post's revival count vs all others — feeds RevivalMoment copy);
#       getRevivalCounts() imported from collectiveMemory.
#     src/styles/tokens.css — interaction state tokens (--surface-focus,
#       --border-focus, --border-interactive, --border-interactive-hover);
#       layout container tokens (--container-read/wide/nav, --gutter clamp).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor). DISPUTE_QUORUM_RATIO optional.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v58 — Endangered Discovery Feed (2026-04-11)
#   Sprint: Dedicated /endangered discovery page; GET /api/endangered +
#     GET /api/endangered-sse endpoints; logarithmic decay curve; urgency tokens.
#   New files:
#     src/pages/endangered.astro — SSR discovery page at /endangered; renders
#       EndangeredFeed island with SSR-supplied initial snapshot; zero-flicker
#       hydration via CSS order re-sort.
#     src/components/EndangeredFeed.astro — client island; opens EventSource to
#       /api/endangered-sse; re-sorts cards via CSS `order` property on each
#       emission; zero DOM re-mount; initial data from SSR prop.
#     src/pages/api/endangered.ts — GET /api/endangered; returns EndangeredPost[]
#       sorted daysLeft ASC; sources: blog collection (365d) + community DB (180d).
#       Cache-Control: no-store. prerender=false.
#     src/pages/api/endangered-sse.ts — GET /api/endangered-sse; SSE endpoint;
#       emits EndangeredPost[] snapshot every 5 s; keepalive every 25 s; auto-
#       closes after 120 s. Mirrors dispute-sse.ts pattern exactly.
#   Updated files:
#     src/lib/decay-engine.ts — logarithmicDecay() added (k=0.065; front-loads
#       70% of decay into first 60 days); LOGARITHMIC_DECAY flag (default true)
#       gates usage; flag allows rollback without touching callers.
#     src/lib/endangered.ts — EndangeredPost wire interface + sortByUrgency()
#       sort helper exported; used by both /api/endangered and EndangeredFeed.
#     src/pages/api/revive.ts — broadcastNamed('endangered-update', …) called
#       post-revival when revived post is still in the danger zone; alerts all
#       connected /api/endangered-sse clients.
#     src/components/EndangeredBand.astro — header row flex layout; "view all →"
#       link to /endangered added.
#     src/styles/endangered.css — .endangered-header flex + .endangered-view-all
#       styles; .endangered-header-left wrapper.
#     src/styles/tokens.css — urgency tier tokens added (--urgency-warning-color,
#       --urgency-critical-color, --urgency-final-color; pulse speeds; glow opacities).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor). DISPUTE_QUORUM_RATIO optional.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v57 — Hold-to-Revive Ceremony v2 (2026-04-11)
#   Sprint: Spring-physics rAF loop, SVG arc ring, haptics, cascade bloom.
#   New files:
#     src/lib/client/revival-ceremony.ts — CeremonyController; IDLE→PRESSING→
#       TENSION→PEAK→BLOOM→SETTLED state machine; springStep() rAF loop drives
#       SVG strokeDashoffset + --arc-progress CSS var; fetches /api/revive on
#       PEAK; emits haptic patterns at each state transition.
#     src/lib/client/cascade-bloom.ts — staggered 80ms bloom on related
#       DecayCards after revival; max 5 cards; CEREMONY_MS=1200 auto-clear.
#     src/lib/client/haptics.ts — Vibration API wrapper; PRESS_START /
#       TENSION_RAMP / PEAK_CONFIRM / CANCEL named patterns; graceful no-op.
#   Updated files:
#     src/components/KeepButton.astro — SVG arc ring overlaid on button
#       (circumference 125.664); data-state machine wired to CeremonyController;
#       border-radius calcification calc(10px + --arc-progress × 9989px);
#       state-driven CSS: pressing/tension/peak/bloom/settled.
#     src/pages/api/revive.ts — additive response fields: revivalCount (alias),
#       relatedSlugs (from constellation), battingAverageDelta (placeholder 0);
#       existing callers unaffected.
#     src/styles/revival.css — @property --arc-progress typed number; count-spring
#       keyframe; cascade-glow keyframe; .decay-card[data-bloom="active"] rule;
#       prefers-reduced-motion guard for cascade bloom.
#     src/styles/tokens.css — --font-mono updated: 'IBM Plex Mono' prepended;
#       loaded via Google Fonts in BaseLayout.astro.
#     src/styles/decay.css — border-radius transition added; calcification formula:
#       calc(var(--radius,16px) − var(--decay-factor,0) × 8px).
#     src/layouts/BaseLayout.astro — IBM Plex Mono Google Fonts link + preconnects.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor). DISPUTE_QUORUM_RATIO optional.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v56 — Dispute Quorum Engine (2026-04-11)
#   Sprint: Formal quorum math for reader challenges against sealed verdicts.
#   New files:
#     src/lib/dispute-quorum.ts — threshold state machine; getQuorumThreshold()
#       scales with engagement (QUORUM_RATIO × totalStances, floor 1);
#       getDisputeSummary() returns {status,challenges,threshold,ratio};
#       QuorumStatus: open → contested (→ overturned | upheld future phase).
#       State is read-only at call time; same revivals.db WAL singleton.
#     src/components/DisputeQuorum.astro — segmented quorum progress bar;
#       ceremony-animated fill: amber (open) → red (contested); ghost segments
#       show remaining challenges needed; caps display at 20 for overflow safety.
#     src/pages/api/dispute-sse.ts — GET /api/dispute-sse?slug=X; SSE endpoint
#       emitting DisputeSummary JSON every 3 s; auto-closes after 90 s; mirrors
#       /api/heartbeat + /api/presence SSE pattern.
#     src/styles/dispute.css — design-token-compliant stylesheet for all dispute
#       UI (challenge button, quorum bar, tally badge); zero hardcoded colours.
#   Updated files:
#     src/components/DisputeChallenge.astro — hold-to-challenge gesture (800 ms,
#       SPRING motion profile); same UX grammar as KeepButton; amber→red fill.
#     src/components/DisputeTally.astro — wired to DisputeSummary (threshold +
#       ratio); colour ramp grey→amber→red mirrors quorum progress.
#     src/pages/api/verdict-dispute.ts — response now includes full DisputeSummary
#       from dispute-quorum.ts alongside DisputeState; reason field accepted.
#     src/pages/verdict/[slug].astro — DisputeQuorum component rendered; live
#       patch via dispute-sse SSE stream on connected clients.
#     src/styles/tokens.css — dispute colour tokens added (--color-dispute-*).
#   Infrastructure: no new services, volumes, or required npm packages.
#     SQLITE_VOLUME mounts revivals.db (verdict_disputes table already exists).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     New optional env var: DISPUTE_QUORUM_RATIO (float 0..1, default 0.3).
#       Omit to use the built-in default — no action needed for existing deploys.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v55 — Community Decay Integration & Detail Pages (2026-04-11)
#   Sprint: Community posts now fully participate in the decay + revival loop.
#   New files:
#     src/pages/community/[slug].astro — SSR detail page per community post;
#       full Markdown rendering, live decay CSS vars (DeathClock ring, decay
#       factor, urgency band), KeepButton wired to /api/revive; client IIFE
#       refreshes decay vars every 60s. COMMUNITY_MAX_DAYS=180 (half blog
#       lifetime → faster decay → higher revival urgency).
#     src/pages/community/submit.astro — 301 redirect to /author/submit;
#       canonical /community/submit URL established for future content move.
#     src/styles/community.css — full design-token-compliant stylesheet for
#       /community index + detail pages; zero hardcoded colours, radii, or
#       transitions; all values reference tokens.css / motion.css.
#   Updated files:
#     src/lib/communityPosts.ts — COMMUNITY_MAX_DAYS=180 exported constant;
#       referenced by both the index wall and the detail page.
#     src/pages/community/index.astro — refactored from raw-text preview to
#       decay card wall: DeathClock ring per card, decay factor computed
#       server-side (buildCards()), links to /community/[slug]; client IIFE
#       refreshes CSS vars every 60s without page reload.
#     src/pages/api/revive.ts — findPost() now checks blog collection first
#       then falls back to community DB (getCommunityPost); community posts are
#       fully revivable via the same /api/revive endpoint.
#     src/components/SiteNav.astro — "community" nav link added between posts
#       and verdict; collapses on mobile (≤640px) via .nav-link--community and
#       .nav-link--overflow classes so the core posts↔verdict loop stays visible.
#     src/components/VerdictCeremony.astro — design-token polish; motion profile
#       variables replace hardcoded timing; semantic colour tokens applied.
#     src/styles/tokens.css, motion.css, verdict.css, graveyard.css,
#       death-clock.css — continued design-system refinement; additional token
#       aliases and motion profile completions.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (community_posts table auto-created by
#       v53; no schema changes this sprint). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v54 — Design System Tokens & Motion Library (2026-04-11)
#   Sprint: Pure UIX/design-system refactoring — no infrastructure changes.
#   New files:
#     src/styles/tokens.css — master design token registry (single source of
#       truth for color primitives, semantic surfaces, text/border alpha ramps,
#       conviction gold palette, decay colors, typography, spacing, radius,
#       shadow, z-index). All components now reference semantic tokens only.
#     src/styles/motion.css — animation token library (duration scale, named
#       easing functions, 5 motion profiles: snap/flow/ceremony/spring/drift).
#       Every transition in the codebase references exactly one profile.
#   mood.ts deleted — mood-simple.ts is now fully self-contained:
#     MoodDefinition + CSSMoodVars interfaces inlined; moodToCSSVars() +
#     moodToCSSString() helpers promoted from the deleted module; now.ts +
#     wall.ts imports updated; unknown legacy mood IDs fall back to 'warm'.
#   decay-engine.ts — --decay-sepia CSS var added (f*0.15 sepia filter, Tanya §4.5)
#     for a subtle age-toning effect on decaying posts.
#   CSS polish: decay.css, global.css, revival.css — design tokens applied
#     throughout; motion profile variables replace hardcoded timing values.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v53 — Community Posting with Proof-of-Work (2026-04-10)
#   New feature: Open posting via proof-of-work API — any human or AI agent
#   can publish to /community without an account or API key. Client-side
#   (browser or agent) computes SHA-256 PoW (4 leading hex zeros, ~65 k iters)
#   then POSTs to /api/submit-post. Posts appear immediately at /community.
#   llms.txt at root documents the full posting protocol for AI agent discovery.
#   /author intro page + /author/submit browser wizard (no login, client-side PoW
#   via Web Worker). community_posts table auto-created in revivals.db on first run.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (community_posts table auto-created).
#     ADMIN_SECRET still required. GITHUB_PAT optional (Conviction Anchor).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Architecture v52 — Verdict Wall Outcome Filters (2026-04-07)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Author conviction sealed with HMAC proof.
#   Public audit receipts prove the author's past self is on record.
#   The Verdict Wall surfaces every post on trial, sorted by tension.
#   The Prediction Vault tracks every falsifiable claim across all posts;
#   verdicts are sealed by admin via HMAC proof — reality decides outcomes.
#   The Verdict Dispute Engine lets readers who staked 'disagree' formally
#   challenge an author's sealed verdict; ≥33% dispute ratio marks it
#   'contested' and excludes it from the batting average until resolved.
#   OG cards now lead with accountability: batting average is the hero.
#   Live Conviction Meter: batting average animates in real-time as verdicts
#   are sealed — no page reload needed; SSE stream reused (no extra connection).
#   Conviction Anchor: every conviction seal and verdict is posted to a public
#   GitHub Gist — independently verifiable, immutable revision history; the
#   author cannot quietly delete the record. Fail-open: local DB is the source
#   of truth; GitHub is corroboration only. PAT scope: gist only.
#   Verdict Ceremony: each sealed verdict now has a permanent public ceremony
#   page at /verdict/[slug] — three-act proof the accountability loop closed.
#   Live SSE layer reveals Act III (batting average) in real-time if visitor
#   is present at the exact moment the verdict is written. VerdictCard CTA
#   links directly to the ceremony when a verdict exists.
#   Batting Average Hero: homepage rebuilt conviction-first — the single %
#   number is the above-fold hero (Zone 1); living posts with verdict filter
#   tabs (all/correct/wrong/pending) sit below (Zone 2). Dedicated OG share
#   card at /api/og/batting-average.png (5 min cache).
#   RFC 3161 Trusted Timestamps: every conviction seal and verdict is now
#   notarised by FreeTSA.org (public, free RFC 3161 TSA) — a cryptographically
#   signed timestamp token (TST) is stored alongside the HMAC proof in
#   conviction_ledger; the audit page surfaces the TST for independent
#   openssl verification. Fail-open: HMAC seal remains valid without TSA.
#   Full CMS Trust Verification: rfc3161-verifier.ts upgraded from byte-scanner
#   to full pkijs CMS SignedData validation — "verified: true" now means the
#   TSA signature cryptographically checks out against the bundled FreeTSA root
#   CA cert (src/assets/freetsa-ca.der). TrustBadge on conviction hero now
#   shows a live cryptographic badge. New GET /api/trust-verify/:slug endpoint
#   for admin tooling. Fail-open unchanged.
#   Track Record Page: authoritative /track-record SSR page — three-act layout:
#   Act I (BattingAverageHero, reused), Act II (full conviction ledger table:
#   every sealed bet, score/10, seal date, verdict badge, resolved date, Gist
#   anchor link — CSS Grid, responsive), Act III (CSS-only running accuracy
#   sparkline — bar height = running % at each resolved verdict; 50% cognitive
#   anchor dashed baseline). Navigation chip (batting average %) now deep-links
#   to /track-record. No new DB tables, no new npm packages, no new services.
#   Verdict Wall Outcome Filters: filter tabs on /verdict refactored from
#   decay-state (living/endangered/revived/fossil) to conviction-outcome
#   (correct/wrong/pending) — aligns the wall with the accountability model;
#   wrong gets equal visual weight to correct (calm red, no shame treatment —
#   Tanya §VerdictPage); VerdictWallStats gains correct/wrong/pending counts;
#   stats bar updated to show outcome pair + contested signal; parseFilter()
#   updated to accept new valid values; CSS adds outcome-aware active states
#   and stat-value colour tokens.
#
# Sprint (latest — Verdict Wall Outcome Filters):
#   lib/verdict-wall.ts — UPDATED: ConvictionOutcome type added ('correct' |
#     'wrong' | 'pending'); VerdictFilter now aliases ConvictionOutcome | 'all'
#     (living/endangered/revived/fossil no longer valid filter values);
#     VerdictWallStats gains correct/wrong/pending counts alongside existing
#     decay-state counts; resolveOutcome() maps runtimeVerdict → outcome;
#     buildStats() tallies outcome counts; filterPosts() filters by outcome;
#     parseFilter() valid set updated; _testVerdictWall() assertions updated.
#   src/pages/verdict.astro — UPDATED: FilterTab gains optional variant field;
#     tabs array rebuilt with correct/wrong/pending entries (Tanya §VerdictPage);
#     stats bar shows correct/wrong pair + contested signal; filter nav aria
#     label updated; tab class list includes verdict-filter-tab--{variant}.
#   src/styles/verdict.css — UPDATED: outcome-variant active states added
#     (.verdict-filter-tab--correct/wrong/pending.--active); stat value colour
#     tokens (.verdict-stat__value--correct/--wrong) added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Track Record Page):
#   pages/track-record.astro — NEW: SSR page at /track-record; assembles
#     buildTrackRecord() data from existing conviction + verdict ledgers;
#     renders BattingAverageHero (Act I) + TrackRecord (Acts II+III).
#     prerender=false. Page meta adapts to sealed/cold state.
#   components/TrackRecord.astro — NEW: Act II ledger table (CSS Grid, 7-col;
#     responsive down to 480 px — collapses sealed-date + anchor on very small
#     screens); Act III sparkline (CSS-only, bar-height = running pct, 50%
#     dashed baseline); tamper-evidence footer (first seal date).
#   lib/track-record.ts — NEW: pure O(n) assembly; buildTrackRecord() reads
#     getSealEntry() + getVerdictRecord() + getAnchorData() + computeBattingAverage()
#     (all existing helpers — zero new DB queries); outcomeToStatus() maps
#     VerdictOutcome → TrackRecordStatus; buildRunningHistory() derives sparkline
#     data points in verdict-chronological order. Fail-open (try/catch → cold state).
#   components/SiteNav.astro — UPDATED: batting chip href /verdict → /track-record;
#     tooltip copy "See prediction timeline →" → "See full track record →".
#   lib/nav.ts — UPDATED: 'track-record' added to PageId union + PAGE_PREFIXES
#     mapping; _testNav() updated with /track-record assertion.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Full CMS Trust Verification):
#   lib/rfc3161-verifier.ts — UPGRADED: full pkijs CMS SignedData verification;
#     pkijs.setEngine() one-time WebCrypto init; parseSignedData() + verifyCmsSignature()
#     validate against bundled FreeTSA CA cert; extractTstGenTime() reads genTime
#     from TSTInfo.eContent; assertGenTimesMatch() cross-checks byte-scanner vs
#     pkijs (±1 s); verifyToken() now async; verified=true = CMS sig valid.
#     src/assets/freetsa-ca.der — NEW: bundled FreeTSA root CA cert (DER format);
#     read once at runtime by getFreeTsaCert() singleton; enables offline
#     CMS chain verification without external network call.
#   pages/api/trust-verify/[slug].ts — NEW: GET /api/trust-verify/:slug; live
#     RFC 3161 re-verification endpoint; returns { verified, timestamp, tsaName,
#     slug }; 200 with verified=false when no TST exists. For admin tooling.
#     prerender=false.
#   components/AuditReceipt.astro — UPDATED: await verifyToken() (now async);
#     no UX change — openssl command still shown for independent validation.
#   components/TrustBadge.astro — UPDATED: await verifyToken() (now async);
#     badge now reflects genuine CMS sig validation, not just parseability.
#   components/ConvictionHero.astro — UPDATED: TrustBadge imported; tst prop
#     accepted; TrustBadge rendered right-aligned in conviction label row
#     (Tanya §TrustBadge placement — pushed to row end via margin-left:auto).
#   pages/blog/[slug].astro — UPDATED: getTstForSeal() called; tstData passed
#     to ConvictionHero so TrustBadge is live on post pages.
#   package.json — UPDATED: pkijs@^3.4.0 added (MIT, ~180 KB; used by
#     Let's Encrypt tooling; zero native deps — pure JS/WebCrypto).
#   Dockerfile — UPDATED: COPY --from=builder /app/src/assets/ ./src/assets/
#     added to server stage so freetsa-ca.der is available at runtime
#     (readFileSync resolves against process.cwd() = /app).
#   Infrastructure: no new services, volumes, env vars, or networks.
#     pkijs installed via npm ci (package.json updated). freetsa-ca.der bundled
#     in image via Dockerfile src/assets copy. SQLITE_VOLUME mounts revivals.db
#     (tst_* columns already migrated). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Batting Average Hero):
#   components/BattingAverageHero.astro — NEW: Zone 1 conviction hero section;
#     full-height above fold; large amber pct, pill badges (correct/wrong/
#     pending), HMAC anchor badge, share button (clipboard API + prompt
#     fallback); cold state (em dash + "no verdicts sealed yet"); data-cm-pct
#     wires into existing initLiveConviction() for zero-reload live updates.
#     SSR-only.
#   components/RiverFilter.astro — NEW: verdict filter tabs for the homepage
#     feed; state lives in URL param ?verdict= (shareable + crawlable); hidden
#     until avg.correct + avg.wrong > 0 (Elon cold-start rule); SSR filters
#     post list — no client re-fetch, no flash of wrong content. Exports
#     VerdictFilter type (all | correct | wrong | pending).
#   lib/og/battingAverageLayout.ts — NEW: dedicated Satori JSX tree for 1200×630
#     batting average share card; amber pct hero, progress bar, stats row
#     (correct/wrong/pending), HMAC badge; cold variant (em dash). Pure function;
#     zero side-effects; independent of accountabilityLayout.
#   pages/api/og/batting-average.png.ts — NEW: GET /api/og/batting-average.png;
#     dedicated batting average OG share card; 5 min cache (public, max-age=300);
#     pipeline: computeBattingAverage() → battingAverageLayout() → PNG.
#   lib/og/renderOGImage.ts — UPDATED: renderBattingAverageImage() export added;
#     used by batting-average.png.ts.
#   pages/index.astro — UPDATED: homepage rewrite; Zone 1 = BattingAverageHero;
#     Zone 2 = DecayCard feed with RiverFilter (SSR verdict filtering via
#     ?verdict= param); ogSlug='batting-average' → og:image from
#     /api/og/batting-average.png; band layout removed; endangered posts remain.
#   components/SiteNav.astro — UPDATED: navigation surgery (Tanya §17); 3 links
#     (posts · verdict · now); graveyard/predictions/map links removed; batting
#     chip now an <a> linking to /verdict; ghost chip cold state ("0 bets sealed")
#     when no verdicts exist; presence dot only — text/count spans removed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Conviction River):
#   pages/map.astro — NEW: SSR Conviction River page at /map; fetches all
#     non-entombed posts via allPostDisplayData(); builds RiverPost[] via
#     buildRiverPosts(); positions each node as % along temporal axis (publish
#     → deadline). Year markers generated server-side. prerender=false.
#   lib/river-data.ts — NEW: server adapter PostDisplayData[] → RiverPost[];
#     toRiverPost() maps slug/title/url/publishedAt/deadline/decayOpacity/
#     decayBlur/decaySat/verdict/daysRemaining; riverClientScript() returns
#     self-contained IIFE for 60s decay tick (rAF loop, no external deps).
#   components/RiverNode.astro — NEW: individual prediction node; CSS vars
#     (--decay-opacity/--decay-blur/--decay-sat) control live appearance;
#     verdict ring colour: emerald(still-true)/rose(wrong)/ash(abandoned)/
#     amber(unaudited)/cold(null). SSR-only.
#   components/RiverLegend.astro — NEW: river legend panel; explains verdict
#     colour ring codes and decay visual system. SSR-only.
#   styles/river.css — NEW: Conviction River layout; horizontal scroll canvas,
#     year markers, node positioning, verdict ring palette, decay animation
#     vars, empty state, responsive behaviour.
#   lib/client/river.ts — NEW: client-side decay tick module (60s rAF loop);
#     reads data-posts JSON from #river-data element; patches CSS vars per
#     node; no SSE, no fetch — pure wall-clock math.
#   lib/nav.ts — UPDATED: 'map' added to PageId + PAGE_PREFIXES.
#   components/SiteNav.astro — UPDATED: /map nav link added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Verdict Ceremony):
#   pages/verdict/[slug].astro — NEW: SSR ceremony page at /verdict/[slug]/;
#     assembles SealEntry + VerdictRecord + BattingAverage from DB; 404 for
#     unknown slugs; renders pending state when seal exists but no verdict yet.
#     prerender=false. Links to /audit/[slug]/ for full audit trail.
#   components/VerdictCeremony.astro — NEW: three-act ceremony component;
#     Act I (original conviction: score, HMAC fingerprint, Gist anchor link);
#     Act II (verdict outcome badge, author note, HMAC stamp, resolved date);
#     Act III (sitewide batting average — starts visually cold; @starting-style
#     reveals it on load when already resolved; verdict-reveal.ts patches it
#     live if visitor is present at verdict time). SSR-only — no polymorphism.
#   lib/client/verdict-reveal.ts — NEW: ceremony-page SSE listener; reuses
#     window.__heartbeat EventSource (Mike arch §3 — one connection); on
#     'verdict:declared' event for this slug: reveals Act III via class toggle,
#     patches data-vc-pct / data-vc-correct / data-vc-wrong / data-vc-pending;
#     race guard prevents double-reveal if SSR already served resolved state.
#   lib/verdict-resolver.ts — UPDATED: getVerdictRecord(slug) added — read-only
#     single-slug lookup for the ceremony page; queries conviction_ledger WHERE
#     event_type='verdict'; returns null if verdict not yet sealed. Safe to call
#     from any SSR route; never writes.
#   components/VerdictCard.astro — UPDATED: Row 4 CTA logic branched on
#     runtimeVerdict; sealed posts show 'Verdict sealed ◈' link to ceremony page
#     (emerald colour — loop closed); entombed posts without verdict show graveyard
#     link; unsealed living posts show 'Take Stance →' as before.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Conviction Anchor):
#   lib/conviction-anchor.ts — NEW: GitHub Gist integration; anchorConviction()
#     creates a public Gist (one per post) at seal time containing slug/score/
#     hmac/sealedAt JSON; anchorVerdict() PATCHes the same Gist appending a
#     verdict block; GitHub revision history makes the original seal immutable.
#     Fail-open contract: callers catch errors; local seal is the source of truth.
#     PAT scope required: gist only — never a broader token.
#   lib/anchor-verifier.ts — NEW: live cross-verification at audit page render
#     time; fetches raw Gist JSON, compares hmac to local DB; returns
#     verified / mismatch / unreachable / no-anchor — mismatch surfaces visibly
#     as a red flag on the audit page; not suppressed.
#   lib/conviction-ledger.ts — UPDATED: three new anchor columns auto-migrated
#     (anchor_gist_id, anchor_url, anchor_raw_url); updateAnchor() / getAnchorData()
#     / getAnchorGistId() accessors added; nullable — pre-anchor era rows carry null.
#   lib/audit-verifier.ts — UPDATED: anchorUrl added to RedactedSeal; assembleAuditPayload()
#     reads getAnchorData() and threads anchorUrl into the seal struct.
#   pages/api/conviction-seal.ts — UPDATED: calls anchorConviction() post-seal
#     when GITHUB_PAT env var present; persists receipt via updateAnchor();
#     anchorUrl included in JSON response. Fail-open — GitHub errors don't abort seal.
#   pages/api/verdict-resolve.ts — UPDATED: calls anchorVerdict() on existing
#     Gist (via getAnchorGistId()) when GITHUB_PAT present; fail-open.
#   components/AuditReceipt.astro — UPDATED: external anchor row added; shows
#     Gist link when anchored, '⏳ anchor pending' otherwise; anchor-verification
#     badge (verified / mismatch / unreachable / pending) colour-coded.
#   pages/audit/[slug].astro — UPDATED: calls verifyAnchor(slug) at render time
#     and passes AnchorVerification to AuditReceipt.
#   Infrastructure: no new services or volumes. One new optional env var:
#     GITHUB_PAT — gist-scoped PAT; omit to skip anchoring (fail-open).
#     SQLITE_VOLUME mounts revivals.db (anchor columns auto-migrated on first run).
#     ADMIN_SECRET still required. deploy.sh passes GITHUB_PAT from .env.
#     POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Live Conviction Meter):
#   lib/client/live-conviction.ts — NEW: client-side SSE listener for
#     'verdict:declared' events; reuses window.__heartbeat EventSource (Mike
#     arch §3 — one connection, no duplicates); rAF counter animation tweens
#     batting-average pct; prefers-reduced-motion instant patch; circuit-breaker
#     skips animation when delta === 0. DOM contract: data-cm-pct / data-cm-
#     correct / data-cm-wrong / data-cm-pending attributes on ConvictionMeter.
#   lib/client/verdict-flash.ts — NEW: ephemeral fixed-position verdict banner;
#     mounts → auto-fades after 3 s → self-removes; verdict-aware colour (green/
#     amber/rose/ash) per Tanya §3.1; ARIA live region for screen readers;
#     suppressed entirely under prefers-reduced-motion (ARIA still fires).
#   styles/conviction-live.css — NEW: CSS transitions for ConvictionMeter live
#     updates; color-variant swap (background/border/box-shadow only — no height);
#     cm-digit-pop keyframe via linear() spring easing; correct-pill highlight;
#     prefers-reduced-motion guard disables all transitions & animations.
#   components/ConvictionMeter.astro — UPDATED: id="conviction-meter" for DOM
#     targeting; data-cm-pct / data-cm-correct / data-cm-wrong / data-cm-pending
#     attributes added for live patching; deferred <script> calls initLiveConviction().
#   layouts/BaseLayout.astro — UPDATED: imports conviction-live.css globally so
#     the CSS is available on every page that renders ConvictionMeter.
#   pages/api/verdict-resolve.ts — UPDATED: verdict:declared SSE broadcast now
#     includes correct / wrong / pending pill counts alongside newBattingAvg so
#     the client can patch all four values in one atomic update.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Accountability OG Image Pipeline):
#   lib/og/accountabilityData.ts — NEW: discriminated-union data contract
#     (cold | post | home variants); buildPostAccountabilityData() +
#     buildHomeAccountabilityData() builders isolate DB access from layout.
#   lib/og/accountabilityLayout.ts — NEW: Satori JSX tree (1200×630);
#     accountability-first design — batting % hero in amber; cold/post/home
#     variants; design tokens locked to Tanya's colour system.
#   lib/og/renderOGImage.ts — UPDATED: renderAccountabilityImage() export
#     added (new pipeline); toSVG() generalised to accept any element tree;
#     legacy renderOGImage() retained for decay-aesthetic cards.
#   pages/api/og/[slug].png.ts — UPDATED: uses accountability pipeline
#     (batting avg hero) instead of decay-aesthetic layout for per-post cards.
#   pages/api/og/home.png.ts — NEW: GET /api/og/home.png; sitewide
#     accountability OG card; linked from homepage <meta og:image>.
#     Pipeline: buildHomeAccountabilityData() → accountabilityLayout() → PNG.
#   config/seo.config.ts — UPDATED: homeOgImageUrl() convenience alias added;
#     ogImageUrl() doc updated to mention 'home' slug.
#   pages/index.astro — UPDATED: og:image points to /api/og/home.png via
#     homeOgImageUrl() so social shares lead with batting average.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Verdict Dispute Engine):
#   lib/verdict-dispute.ts — NEW: dispute state machine; recordDispute()
#     writes to verdict_disputes table (same revivals.db WAL singleton);
#     getDisputeState() → no-verdict / no-stancers / clean / contested;
#     disputeAlreadyRecorded() idempotency guard; UNIQUE index on
#     (post_slug, session_id). Auto-creates verdict_disputes table on first
#     use — zero schema migrations needed.
#   pages/api/verdict-dispute.ts — NEW: POST /api/verdict-dispute; gated by
#     X-Session-Id header + stance check (only 'disagree' stakers may file);
#     idempotent (double-submit returns current state); returns state/ratio/
#     total/disputes. prerender=false.
#   components/DisputeChallenge.astro — NEW: "Challenge Moment" UI; renders
#     inert HTML, client script gates visibility (localStorage stance check);
#     shown only to readers who staked 'disagree' + verdict sealed + not yet
#     disputed; fetch POST on click → reveals outcome + updates tally badge.
#   components/DisputeTally.astro — NEW: public dispute ratio badge; always
#     visible when verdict sealed; colour-coded grey → amber → terra cotta
#     (contested); live-updated by DisputeChallenge client script.
#   lib/batting-average.ts — UPDATED: contested verdicts (dispute ratio ≥33%)
#     treated as pending — excluded from correct/wrong denominator; prevents
#     author self-grading; isContested() helper wraps getDisputeState().
#   lib/stance-ledger.ts — UPDATED: getStanceForSession() added — point lookup
#     returning the recorded stance for a session (used by verdict-dispute API).
#   pages/blog/[slug].astro — UPDATED: DisputeChallenge + DisputeTally
#     components rendered; getDisputeState() called server-side; audit-receipt-
#     nudge row reflowed to flex to accommodate tally badge inline.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     verdict_disputes table auto-created in revivals.db (SQLITE_VOLUME).
#     ADMIN_SECRET still required for seal-prediction + conviction-seal.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Prediction Vault):
#   lib/prediction-engine.ts — NEW: pure prediction logic; derivePredictionStatus()
#     (pending / overdue / correct / incorrect / partial); flattenPredictions()
#     flattens all post predictions with real-time status; computeStats() accuracy
#     metrics; groupByStatus() UI ordering (Overdue → Pending → Resolved).
#     predictions_ledger table auto-created in revivals.db (same SQLITE_VOLUME).
#     Zero new npm deps — better-sqlite3 already in use. No schema migrations.
#   pages/api/seal-prediction.ts — NEW: POST /api/seal-prediction; cookie + body
#     auth (mirrors verdict-resolve.ts); HMAC-SHA256 audit proof; INSERT OR IGNORE
#     idempotency guard; 409 on double-seal. prerender=false.
#   components/PredictionCard.astro — NEW: per-prediction display card; compact
#     mode for inline post rendering; status badges (pending/overdue/correct/
#     incorrect/partial); resolution_criteria and deadline display; SSR-only.
#   components/PredictionVault.astro — NEW: public /predictions wall; three
#     groups — Overdue (urgent) / Pending / Resolved; accuracy stats bar.
#   pages/predictions.astro — NEW: SSR /predictions route; getCollection + wall-
#     clock status derivation at request time. prerender=false.
#   content/config.ts — UPDATED: predictions: z.array(predictionSchema).optional()
#     added to blog schema. prediction.id values are immutable post-publish.
#   lib/batting-average.ts — UPDATED: PredictionAccuracy type +
#     computePredictionBattingAverage() for nav chip.
#   lib/nav.ts — UPDATED: 'predictions' added to PageId + PAGE_PREFIXES.
#   components/SiteNav.astro — UPDATED: /predictions nav link added.
#   pages/blog/[slug].astro — UPDATED: PredictionCard inline section renders
#     per-post predictions; links to /predictions vault.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (predictions_ledger auto-created).
#     ADMIN_SECRET still required for seal-prediction + conviction-seal.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Deadline Clock):
#   lib/deadline-clock.ts — NEW: pure time math for resolution deadline display;
#     buildDeadlineDisplay(publishDate, deadline, now) → label/urgencyBand/
#     daysRemaining/percentConsumed. Zero DB, zero side-effects.
#   lib/deadline-enforcer.ts — NEW: classify deadline status (no-deadline /
#     pending / imminent / critical / expired-unsealed / auto-resolved);
#     findExpiredUnsealed() probe; autoSealExpired() writes 'abandoned' verdict
#     via resolveVerdict(). Reads conviction_ledger — no schema changes.
#   components/DeadlineClock.astro — NEW: deadline countdown widget; 5 urgency
#     bands (safe/watch/warning/critical/overdue); CSS pulse on critical/overdue;
#     progress bar (percentConsumed); sealed/overdue states. SSR-only.
#   pages/api/deadline-sweep.ts — NEW: POST /api/deadline-sweep; Bearer auth;
#     sweeps all expired-unsealed posts; returns {ok, swept, skipped, errors};
#     idempotent — already-sealed posts are skipped. prerender=false.
#   content/config.ts — UPDATED: resolution_deadline: z.date().optional() added
#     to blog schema. Absence = no commitment. Presence = public accountability.
#   pages/admin.astro — UPDATED: deadline status surfaced per post in admin view.
#   pages/blog/[slug].astro — UPDATED: DeadlineClock rendered in post header.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
#     deploy.sh: POST /api/deadline-sweep called post-start to auto-seal expired.
#
# Sprint (prev — Verdict Resolution):
#   lib/verdict-resolver.ts — NEW: runtime verdict sealing; resolveVerdict()
#     writes event_type='verdict' into conviction_ledger; HMAC-SHA256 proof;
#     VerdictAlreadySealedError idempotency guard; rowToVerdictRecord() mapper.
#   pages/api/verdict-resolve.ts — NEW: POST /api/verdict-resolve; cookie +
#     body auth (mirrors conviction-seal); broadcasts 'verdict:declared' SSE
#     event with newBattingAvg; 409 on double-seal; prerender=false.
#   components/VerdictResolutionPanel.astro — NEW: per-post admin panel; two
#     states — sealed (read-only badge + note) / open (verdict dropdown + note
#     textarea); fetch-based submit with live feedback; reload on success.
#   lib/verdict-ceremony.ts — NEW: client-side SSE listener for
#     'verdict:declared'; piggybacks on window.__presenceES (no new connection);
#     animates [data-conviction-pct] meter, flashes verdict badge on card,
#     shows ephemeral notification toast. Injected as IIFE via BaseLayout.
#   lib/batting-average.ts — UPDATED: scoring rewritten to use verdict events
#     (event_type='verdict') instead of score+death thresholds; first-write-wins
#     per slug; pending = totalSealed − resolvedSlugs.size.
#   lib/collectiveMemory.ts — UPDATED: getVerdictRecord(slug) + getAllVerdicts()
#     read from conviction_ledger WHERE event_type='verdict'.
#   lib/conviction-ledger.ts — UPDATED: 'verdict' added to LedgerEventType.
#   lib/postMeta.ts — UPDATED: runtimeVerdict / verdictSealedAt / verdictHmac
#     fields added to PostDisplayData; resolveConviction() prefers runtime verdict
#     over frontmatter; safeAllVerdicts() graceful fallback; allPostDisplayData()
#     passes verdicts map into getPostDisplayData().
#   pages/admin.astro — UPDATED: VerdictResolutionPanel rendered per post in an
#     .admin-post-group; header stat shows X/Y verdicts alongside seal count.
#   layouts/BaseLayout.astro — UPDATED: verdictCeremonyScript injected.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (conviction_ledger gains verdict rows).
#     ADMIN_SECRET still required for both conviction-seal and verdict-resolve.
#     deploy.sh: POST /api/deadline-sweep called after start (auto-seals expired).
#
# Sprint (prev — Verdict Resolution):
#   lib/verdict-resolver.ts — NEW: runtime verdict sealing; resolveVerdict()
#     writes event_type='verdict' into conviction_ledger; HMAC-SHA256 proof;
#     VerdictAlreadySealedError idempotency guard; rowToVerdictRecord() mapper.
#   pages/api/verdict-resolve.ts — NEW: POST /api/verdict-resolve; cookie +
#     body auth (mirrors conviction-seal); broadcasts 'verdict:declared' SSE
#     event with newBattingAvg; 409 on double-seal; prerender=false.
#   components/VerdictResolutionPanel.astro — NEW: per-post admin panel; two
#     states — sealed (read-only badge + note) / open (verdict dropdown + note
#     textarea); fetch-based submit with live feedback; reload on success.
#   lib/verdict-ceremony.ts — NEW: client-side SSE listener for
#     'verdict:declared'; piggybacks on window.__presenceES (no new connection);
#     animates [data-conviction-pct] meter, flashes verdict badge on card,
#     shows ephemeral notification toast. Injected as IIFE via BaseLayout.
#   lib/batting-average.ts — UPDATED: scoring rewritten to use verdict events
#     (event_type='verdict') instead of score+death thresholds; first-write-wins
#     per slug; pending = totalSealed − resolvedSlugs.size.
#   lib/collectiveMemory.ts — UPDATED: getVerdictRecord(slug) + getAllVerdicts()
#     read from conviction_ledger WHERE event_type='verdict'.
#   lib/conviction-ledger.ts — UPDATED: 'verdict' added to LedgerEventType.
#   lib/postMeta.ts — UPDATED: runtimeVerdict / verdictSealedAt / verdictHmac
#     fields added to PostDisplayData; resolveConviction() prefers runtime verdict
#     over frontmatter; safeAllVerdicts() graceful fallback; allPostDisplayData()
#     passes verdicts map into getPostDisplayData().
#   pages/admin.astro — UPDATED: VerdictResolutionPanel rendered per post in an
#     .admin-post-group; header stat shows X/Y verdicts alongside seal count.
#   layouts/BaseLayout.astro — UPDATED: verdictCeremonyScript injected.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (conviction_ledger gains verdict rows).
#     ADMIN_SECRET still required for both conviction-seal and verdict-resolve.
#
# Sprint (prev — Verdict Wall):
#   pages/verdict.astro — NEW: SSR Verdict Wall (/verdict); every post on
#     trial sorted by tension score. Hero + stats bar + filter tabs (all /
#     living / endangered / revived / fossil) + 2-col card grid. ?filter=
#     query param drives state with zero client JS. prerender=false.
#   lib/verdict-wall.ts — NEW: pure sort + categorisation; buildVerdictWall()
#     merges PostDisplayData[] + StanceDistribution map → VerdictPost[].
#     buildStats() aggregates living / endangered / revived / fossil / contested
#     counts. filterPosts() + parseFilter() guard untrusted query params.
#   components/VerdictCard.astro — NEW: specimen-cabinet jury card; DeathClock
#     ring + title + state badge (Row 1), conviction verdict (Row 2), stance
#     bar — agree(emerald)/torn(amber)/disagree(red) (Row 3), CTA + audit link
#     (Row 4). Fossil cards desaturated via CSS filter. SSR-only, no islands.
#   styles/verdict.css — NEW: layout layer for /verdict; 2-col CSS Grid (≥600px),
#     hero, stats bar, filter tabs, contested signal banner (amber pulse glyph),
#     empty state, footer. Card-level styles scoped inside VerdictCard.astro.
#   lib/tension-score.ts — UPDATED: MIN_STANCES lowered 10→3 to enable early
#     tension signals on posts with few votes.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
#
# Sprint (prev — Conviction Audit Trail + JSON-LD):
#   pages/audit/[slug].astro — NEW: public SSR proof page per post; shows
#     sealed conviction receipt or "NOT YET SEALED" if author hasn't locked yet.
#     Returns 404 for unknown slugs. Zero client JS — pure server HTML.
#   lib/audit-verifier.ts — NEW: read-only data assembly for audit pages;
#     strips hmac_seal → RedactedSeal (hashPrefix first 16 hex chars + openssl
#     verify command). Reads from conviction_ledger via safeRead wrappers.
#   lib/json-ld.ts — NEW: single source of truth for all schema.org JSON-LD;
#     buildArticleSchema (conviction + decay additionalProperty), BreadcrumbList,
#     serializeJsonLd. No new npm deps — JSON.stringify only.
#   components/AuditReceipt.astro — NEW: visual notary stamp; SEALED/NOT YET
#     SEALED header, score, ISO date, hash prefix, collapsible openssl command.
#   components/ConvictionTimeline.astro — NEW: vertical event timeline; CSS-only,
#     eventType → amber/green/red/purple colour per Tanya design-system.
#   components/SEOMeta.astro — UPDATED: JSON-LD script injection (jsonLd prop);
#     article:author + article:section OG tags added.
#   layouts/BaseLayout.astro — UPDATED: jsonLd prop threaded through to SEOMeta.
#   pages/blog/[slug].astro — UPDATED: buildArticleSchema + BreadcrumbList injected;
#     audit receipt link added to post nav row; getSealEntry free-rides existing
#     conviction data (no new DB queries).
#   components/SiteNav.astro — UPDATED: /verdict nav link with amber contested
#     underline when any living post has tension label === 'contested'.
#   lib/heartbeat.ts — UPDATED: phantom / quiet-connection flags removed;
#     honest-zero policy — every pulse is a real reader action.
#   pages/api/heartbeat.ts — UPDATED: quiet-mode logic removed; register() called
#     without visit-count param.
#   lib/nav.ts — UPDATED: 'verdict' page mapped in getActivePage().
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
#
# Sprint (prev — Cover Images):
#   content/config.ts — UPDATED: coverImage field added to blog schema.
#   lib/postMeta.ts — UPDATED: coverImage field added to PostMeta interface.
#   lib/og/ogLayout.ts — UPDATED: split-panel layout when coverImageUrl present.
#   pages/api/og/[slug].png.ts — UPDATED: toCoverImageUrl() for Satori fetch.
#   pages/blog/[slug].astro — UPDATED: full-bleed 16/6 hero above post header.
#   components/DecayCard.astro — UPDATED: cover-wrap slot; decay filter cascade.
#   components/TombstoneCard.astro — UPDATED: ghost cover in graveyard.
#   lib/tension-score.ts — UPDATED: MIN_STANCES raised 1→10.
#   public/images/covers/ — NEW: building-in-public.svg + the-decay-theory.svg.
#   Dockerfile — FIXED: COPY public/ ./public/ in builder stage.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#
# Sprint (prev — Cause-of-Death Labels):
#   lib/cause-of-death.ts — NEW: pure cause-of-death classifier (no DB,
#     no side effects). Five verdicts: SUPERSEDED → UNSEALED → REJECTED →
#     ABANDONED → DECAYED. causeLabel / causeDescription / causeCSSClass.
#   lib/collectiveMemory.ts — cause_of_death TEXT column; COALESCE first-write.
#   lib/postMeta.ts — causeOfDeath field; safeCausesOfDeath() graceful fallback.
#   pages/api/entomb.ts — buildCauseData() snapshot; fire-and-forget persist.
#   components/TombstoneCard.astro — cause-of-death badge, oklch colours.
#   pages/graveyard.astro — findDominantCause() stat in graveyard header.
#
# Sprint (prev — HMAC Seal + Admin Web UI):
#   pages/admin.astro — NEW: protected conviction seal dashboard at /admin.
#   components/AdminSealForm.astro — NEW: per-post seal form with live preview.
#   lib/conviction-ledger.ts — HMAC-based seal (hmac_seal column, auto-migrated).
#   pages/api/conviction-seal.ts — dual auth (body secret + cookie admin_token).
#   pages/api/conviction-audit.ts, conviction-stats.ts — chain verify removed.
#   components/ConvictionHero, ConvictionDeclaration, ConvictionAuditTrail —
#     broken-chain UI removed; aligned with HMAC-only audit model.
#
# Supports: Hybrid SSR (Astro + Node), SQLite collective memory,
#           Death Clock (SVG ring countdown, 6-tier urgency, CSS-only animation),
#           Honest Presence (per-slug + global-scope reader count via SSE),
#           Ghost Echoes (revival sparkline — 8-week history, adaptive pulse),
#           dynamic OG image generation (satori + resvg),
#           Consequential Decay / Graveyard (entomb + resurrect),
#           Graveyard Discovery Surface (teaser, stats, tombstone history),
#           Honest Graveyard (entombed_at timestamps, SSR pagination, mood lock),
#           Graveyard Epitaph layout (OKLCH tokens, scroll-driven entrance,
#           candlelight footer, CSS :has() resurrection glow, empty state),
#           Endangered Posts (urgency tiers, pulse, erosion bar, DeathClock ring),
#           2-phase revival dismiss (bloom → collapse, a11y, Android-optimised),
#           SavedMoment toast (emotional payoff when last card revived),
#           Cinematic Revival (5-phase: arc → localStorage gate → WAAPI dissolve
#           → chromatic h1 flash → witness badge + SSE ripple),
#           Revival Guard anti-gaming (fingerprint, velocity),
#           Passive Reading Heartbeat (reading_seconds, readingBonus),
#           Author Conviction Notes (ConvictionPanel, belief audit, verdicts),
#           NowLine (pinned author status + graveyard hint on homepage),
#           Murmurs (wall whispers on homepage, CLI-only submission),
#           Grain overlay (CSS noise texture via --decay-grain),
#           Graveyard Ledger / Epitaph Engine (Hall of Records, deterministic
#           narrative epitaphs, 4-tier survival classification, summary stats),
#           Conviction Physics (author verdict modulates decay speed: 0.7×–1.4×;
#           dominant verdict wins; ambient tint glow on SVG death-clock ring).

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

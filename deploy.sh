#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v128 — BattingAverageHero Thermal State System (2026-04-17)
#   Sprint: Conviction maturity visual language — cold/warming/hot thermal
#     states derived from resolved verdict count. Pure derivation — zero new
#     DB columns, zero new caches. ThermalState type + getThermalState() in
#     batting-average.ts. BattingAverageHero.astro renders data-ba-thermal
#     attribute with thermal-aware subtitle ("Awaiting first verdict" / "X of
#     5 verdicts resolved" / "Batting Average"), ember dots (4 pips, one per
#     pre-unlock verdict, staggered breathe animation), and live SSE update
#     via verdict:declared broadcast. Ghost ring speed tokenized per thermal
#     state (10s cold → 6s warming → 3s hot). 27 new tokens in tokens.css
#     (surface tints, ring speeds, ember sizing/opacity). 130 LOC new CSS in
#     batting-average.css (thermal polymorphism, ember breathe/pulse keyframes,
#     thermal cross-fade, reduced-motion guards). verdict-resolve.ts now
#     broadcasts resolvedTotal + thermalState in SSE verdict:declared payload.
#   Modified files:
#     src/lib/batting-average.ts — ThermalState type, getThermalState() pure
#       function (0 verdicts → cold, <5 → warming, ≥5 → hot); thermalState
#       field added to BattingAverageResult interface.
#     src/components/BattingAverageHero.astro — data-ba-thermal attribute;
#       thermalLabel() subtitle; buildEmberDots() array; .bah-embers markup;
#       client-side updateThermalState() + updateEmberDots() on SSE event.
#     src/styles/batting-average.css — [data-ba-thermal] polymorphism (cold/
#       warming/hot surface/text/ring); .bah-embers flex row; .bah-ember-dot
#       lit/unlit; staggered breathe animation; ember-pulse keyframe; thermal
#       cross-fade transition; reduced-motion guards.
#     src/styles/tokens.css — 27 new tokens: --ba-thermal-{cold,warming,hot}-
#       surface/text/ring-speed; --ba-ember-{1,2,3,4} opacity ramp;
#       --ba-ember-size/lit/unlit.
#     src/pages/api/verdict-resolve.ts — resolvedTotal + thermalState added
#       to verdict:declared SSE broadcast payload.
#     AGENTS.md — thermal states marked done; Tanya P1 polish WIP added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v127).
#
# Architecture v127 — Community Submit URL Inversion & Token AAA (2026-04-17)
#   Sprint: Community submit form canonical URL inversion and AAA polish.
#     /community/submit is now the canonical submit URL (Tanya §9);
#     /author/submit 301-redirects to /community/submit (link preservation).
#     Inline submit styles extracted to src/styles/community-submit.css
#     (100% token-compliant, zero violations). Author label field added to
#     form (wired to existing API + DB column). PoW ceremony data-pow-state
#     attribute drives shadow escalation. PactPanel z-index bug fixed
#     (raw z:20 → var(--z-drawer)). escHtml() hardened with &#39; escape
#     for author_label XSS vector. Token compliance guard expanded 28→30
#     guarded files (community-submit.css + community/submit.astro).
#   Modified files:
#     src/pages/community/submit.astro — 301 redirect removed; now full
#       3-step PoW submit wizard (canonical URL for submissions).
#     src/pages/author/submit.astro — full form removed; now 301 redirect
#       to /community/submit (preserves existing bookmarks/links).
#     src/styles/community-submit.css — NEW: extracted submit form styles;
#       100% token-compliant, responsive, reduced-motion guard.
#     src/components/PactPanel.astro — z-index fix: raw 20 → var(--z-drawer).
#     scripts/check-token-compliance.ts — 2 new GUARD_FILES entries
#       (28→30 total guarded files).
#     AGENTS.md — Sprint documented; community submit marked done.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v126).
#
# Architecture v126 — Token Compliance Tier 1+2 Migration (2026-04-17)
#   Sprint: Design-system token migration — migrated 10 conviction/verdict
#     components from raw CSS values (hex, px, rem, opacity, letter-spacing)
#     to design-token variables. Tier 1 core-loop components (DecayClock,
#     DecayBar, TombstoneCard, ConvictionPanel, ConvictionMeter,
#     ConvictionTimeline, ConvictionAuditTrail, VerdictCeremony,
#     VerdictResolutionPanel) all pass zero-violation guard. Tier 2 partial
#     (AuditReceipt, TrackRecord done). Token compliance guard file list
#     expanded 18→28 guarded files. Overall violation counts reduced:
#     errors + typography warnings both decreased across the codebase.
#   Modified files:
#     src/components/AuditReceipt.astro — raw CSS values replaced with
#       --space-*, --text-*, --radius-*, --weight-* design tokens.
#     src/components/ConvictionAuditTrail.astro — raw values migrated to
#       design-token variables; zero-violation guard compliant.
#     src/components/ConvictionMeter.astro — raw colors, sizes, spacing
#       replaced with token references; guard-compliant.
#     src/components/ConvictionPanel.astro — raw CSS → token migration;
#       zero violations under guard mode.
#     src/components/ConvictionTimeline.astro — timeline visual styles
#       migrated from raw values to design tokens.
#     src/components/DecayBar.astro — minor token alignment fixes.
#     src/components/DecayClock.astro — raw values → design tokens.
#     src/components/TombstoneCard.astro — minor token fix.
#     src/components/TrackRecord.astro — raw CSS migrated to tokens;
#       guard-compliant.
#     src/components/VerdictCeremony.astro — ceremony visual styles
#       migrated from raw values to design tokens.
#     src/components/VerdictResolutionPanel.astro — resolution panel
#       styles fully token-compliant.
#     scripts/check-token-compliance.ts — 10 new GUARD_FILES entries
#       (18→28 total guarded files).
#     AGENTS.md — Token compliance tiers tracked; Tier 1 DONE, Tier 2
#       partial (AuditReceipt + TrackRecord done), Tier 3 pending.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v125).
#
# Architecture v125 — EndangeredFeed Composition Rewrite (2026-04-17)
#   Sprint: EndangeredFeed refactor — rewrote EndangeredFeed.astro from
#     monolithic 296-line component to slim composition shell (~24 lines)
#     that delegates card rendering entirely to EndangeredCard.astro.
#     /endangered page restored from 301 redirect to dedicated live
#     SSE-powered triage page with real-time updates, 2-phase dismiss,
#     and a11y announcements. endangeredFeedScript() SSE consumer added
#     to src/lib/endangered.ts (live re-sort, bloom/collapse animations,
#     screen-reader announcements). Feed layout CSS added to
#     endangered.css (composition shell — zero card CSS duplication).
#     Token compliance guard expanded 17→18 files (EndangeredFeed.astro).
#     Typography migration warnings: 256→255 in unguarded files.
#   Modified files:
#     src/components/EndangeredFeed.astro — rewritten: monolith → composition
#       shell importing EndangeredCard; 296→~24 lines; zero card CSS.
#     src/lib/endangered.ts — endangeredFeedScript() added: SSE consumer IIFE,
#       live re-sort by decay factor, bloom/collapse animations, a11y announce,
#       reduced-motion guard, tier-speed/urgency/erosion helpers.
#     src/pages/endangered.astro — 301 redirect removed; now real page with
#       BaseLayout, EndangeredFeed component, SSR-filtered endangered posts,
#       atmosphere="endangered" for global theming.
#     src/styles/endangered.css — feed layout: .endangered-feed max-width,
#       .feed-header, .feed-label, .feed-count, .feed-cards flex-column,
#       .feed-card-wrap transition, .feed-empty state. 100% token-compliant.
#     scripts/check-token-compliance.ts — EndangeredFeed.astro added to
#       GUARD_FILES (17→18 total guarded files).
#     AGENTS.md — EndangeredFeed marked done; typography count 256→255.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. SSE is native to Astro SSR —
#     no additional infrastructure required. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v124).
#
# Architecture v124 — River Feed Decay Contrast Polish (2026-04-17)
#   Sprint: Design-system micro-polish — River feed stage contrast
#     amplification, token migration, and entry animations. 30 new
#     design tokens (--river-node-*, --stage-*-card-*, --river-pip-*,
#     --river-border-*, --river-axis-*) added to tokens.css. river.css
#     migrated to 100% token-compliant — zero inline OKLCH remaining.
#     Stage-specific entry animations added to decay.css via @keyframes
#     card-enter with per-stage duration/easing/translateY/scale profiles.
#     Endangered glow: dual animation (border-pulse + sustained glow) in
#     decay-stage-identity.css. StagePill: token-compliant, active
#     bottom-indicator via ::after pseudo-element, 15s pulse timeout
#     (Tanya §3.5). KeepButton: two-phase bloom (300ms CEREMONY peak
#     + 800ms SPRING settle via cubic-bezier spring), reduced-motion
#     guard. Token compliance guard list expanded 15→17 files
#     (river.css + StagePill.astro). Unguarded violations: 514→511
#     errors, 257→256 typography warnings.
#   Modified files:
#     src/styles/tokens.css — 30 new river-node, stage-card, pip, border,
#       and axis tokens replacing inline OKLCH in downstream sheets.
#     src/styles/river.css — full token migration; all OKLCH → var(--river-*).
#     src/styles/decay.css — card-enter @keyframes; stage-specific entry
#       duration, easing, translateY, scale; motion-token-driven.
#     src/styles/decay-stage-identity.css — stage contrast amplification;
#       card-bg surface tints, text opacity ramps, endangered dual glow.
#     src/components/StagePill.astro — hover color → var(--text-secondary);
#       active ::after indicator; endangered bg → var(--gold-bg); pill-breathe
#       50% → var(--gold-border-strong); 15s pulse timeout script.
#     src/components/KeepButton.astro — breath-bloom: 600ms→1100ms two-phase
#       (27% CEREMONY peak, 100% SPRING settle); spring easing; reduced-motion
#       guard (animation: none, static box-shadow fallback).
#     src/components/RiverFilter.astro — minor token alignment additions.
#     scripts/check-token-compliance.ts — 2 new GUARD_FILES entries:
#       src/styles/river.css, src/components/StagePill.astro (15→17 total).
#     AGENTS.md — Completed section updated with River Feed Decay Contrast
#       Polish; WIP typography migration count corrected.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v123).
#
# Architecture v123 — ConvictionRecord Card Consolidation (2026-04-17)
#   Sprint: Blog detail accountability UX — consolidated 5 scattered
#     post-accountability zones (KeepButton, DisputeChallenge, GhostEchoes,
#     audit-receipt-nudge + DisputeTally, ConvictionAuditTrail) into a single
#     unified ConvictionRecord card component. The card is stage-aware: border,
#     shadow, and radius adapt to the post's decay stage via [data-decay-stage].
#     SSR-only — zero hydration cost. All interactivity delegated to existing
#     subcomponents. Orphaned CSS from replaced zones purged from [slug].astro.
#     Token compliance checker expanded with 2 new guard files (15 total).
#     Typography migration violation count corrected from 258 to 257.
#   New files:
#     src/components/ConvictionRecord.astro — composition wrapper that imports
#       KeepButton, GhostEchoes, DisputeTally, DisputeChallenge, and
#       ConvictionAuditTrail. Stage-aware via data-decay-stage attribute. Props:
#       slug, revivalCount, urgency, conviction, decayFactor, lifespan,
#       verdictSealed, disputeState, decayStage. Pure SSR — no client JS.
#     src/styles/conviction-record.css — stage-aware card styles; base card
#       (.conviction-record), header (.cr-header), action (.cr-action), evidence
#       grid (.cr-evidence), challenge (.cr-challenge), audit (.cr-audit);
#       5 stage overrides (fresh/fading/endangered/ghost/fossil) using existing
#       stage tokens; responsive grid at 480px breakpoint; reduced-motion guard.
#       100% token-compliant (zero raw values).
#   Modified files:
#     src/pages/blog/[slug].astro — 5 scattered zones replaced with single
#       <ConvictionRecord /> invocation; removed imports: ConvictionAuditTrail,
#       GhostEchoes, KeepButton, DisputeChallenge, DisputeTally; added imports:
#       ConvictionRecord, stageFromFactor; added decayStage SSR computation;
#       orphaned CSS purged (.audit-receipt-nudge, .audit-receipt-link,
#       .revival-footer).
#     src/layouts/BaseLayout.astro — @import '../styles/conviction-record.css'
#       added to global CSS cascade.
#     scripts/check-token-compliance.ts — ConvictionRecord.astro and
#       conviction-record.css added to GUARD_FILES (15 total guarded files).
#     AGENTS.md — ConvictionRecord card marked Done with file manifest;
#       typography migration violation count corrected 258→257.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v122).
#
# Architecture v122 — Typography Composition System & Token Migration (2026-04-17)
#   Sprint: Design-system polish — added typography.css composition layer
#     (13 presets, 5 modifiers, responsive overrides) as the missing abstraction
#     between raw --text-* tokens and component styles. Migrated 4 components
#     (DecayCard, SealCeremony, BattingAverageHero, SiteNav/nav.css) from raw
#     magic-number CSS values to design-token variables. Token compliance checker
#     expanded from 7 to 13 guarded files; severity system added (error vs warn)
#     so typography warnings don't block builds. global.css now imports
#     typography.css alongside existing token layers.
#   New files:
#     src/styles/typography.css — 13 type presets (.type-hero through .type-stat),
#       5 modifiers (.type-muted, .type-accent, .type-decay, .type-truncate,
#       .type-balance), responsive overrides at 640px breakpoint.
#   Modified files:
#     src/styles/global.css — @import "./typography.css" added between surfaces
#       and motion layers.
#     src/styles/nav.css — raw gap (3px), padding (4px 10px, 6px 12px), and
#       letter-spacing (0.06em) replaced with --space-* and --tracking-* tokens.
#     src/components/DecayCard.astro — 5 raw rem/px values replaced with --text-*,
#       --space-*, --weight-*, --leading-* tokens; footer height 48→52px per
#       Tanya §4 spec.
#     src/components/SealCeremony.astro — 6 raw letter-spacing values replaced
#       with --tracking-wide/--tracking-widest tokens.
#     src/components/BattingAverageHero.astro — raw gap (3px) and padding (3px)
#       replaced with --space-1 tokens.
#     scripts/check-token-compliance.ts — ViolationSeverity type added; 6 new
#       guard files; typography WARN rules (raw font-weight, letter-spacing,
#       font-family); partitionSeverity(); warns don't block guard mode.
#     AGENTS.md — Done section added with typography migration items; WIP updated.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v121).
#
# Architecture v121 — Layer Cleanup & UI Simplification (2026-04-16)
#   Sprint: Major surface-area reduction — deleted six heavyweight overlay
#     components (LandingHero, OnboardingOverlay, StanceDrawer, ConvictionDemo,
#     BattingUnlockCeremony, FirstVisitHint) and their associated CSS/TS modules.
#     Homepage now starts directly with the river feed. Blog detail reduced from
#     4 overlay surfaces to 2 (nav + StickyStanceBar). BattingUnlockCeremony
#     deduplicated into BattingAverageUnlockCeremony on author pages. SiteNav
#     condensed to 2 primary links; leaderboard/community/now moved to footer.
#     StickyStanceBar absorbs the former StanceDrawer mobile flow inline.
#     Client bundle shrunk: 26 → 21 JS modules. Token violations: 531 → 516
#     (removed components carried ~15 violations apiece).
#   Deleted files:
#     src/components/LandingHero.astro
#     src/components/OnboardingOverlay.astro
#     src/components/StanceDrawer.astro
#     src/components/ConvictionDemo.astro
#     src/components/BattingUnlockCeremony.astro
#     src/components/FirstVisitHint.astro
#     src/lib/client/landing-hero.ts
#     src/lib/client/onboarding.ts
#     src/lib/firstVisitHint.ts
#     src/styles/landing-hero.css
#     src/pages/api/onboarding-dismiss.ts
#   Modified files:
#     src/components/SiteNav.astro — condensed to Posts + Verdict links; amber
#       dot signals contested signal; overflow nav pills removed.
#     src/components/StickyStanceBar.astro — absorbs StanceDrawer mobile flow;
#       "Weigh in →" expands inline vote buttons.
#     src/components/BattingProgressRing.astro — minor cleanup.
#     src/layouts/BaseLayout.astro — OnboardingOverlay + FirstVisitHint imports
#       and usages removed.
#     src/pages/index.astro — LandingHero + ConvictionStrip sections removed;
#       river feed now Zone 1.
#     src/pages/blog/[slug].astro — StanceDrawer integration replaced by
#       expanded StickyStanceBar inline flow.
#     src/pages/author/[slug].astro — minor cleanup.
#     src/styles/ambient.css — first-visit hint styles (fvh-*) purged.
#     src/styles/nav.css — overflow pill styles removed; nav condensed.
#     src/lib/revival-counter.ts — minor cleanup.
#     scripts/check-token-compliance.ts — LandingHero removed from guard list.
#     AGENTS.md — WIP updated: cleanup sprint marked Done; BattingAverageHero
#       and EndangeredFeed refactor listed as next targets.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v120).
#
# Architecture v120 — LandingHero "5-Second Mortality" Demo (2026-04-16)
#   Sprint: LandingHero completely reworked into an animated demo lifecycle that
#     shows an entire post lifespan (0 → 100 days) in ~10 real seconds, then
#     loops. SSR always renders a fresh snapshot (decay=0, stage="fresh"); the
#     client RAF loop takes over immediately with TIME_SCALE compression. Key
#     additions and changes:
#     Accelerated timeline — DEMO_MAX_DAYS (100) compressed into DEMO_REAL_SECS
#       (10); TIME_SCALE constant drives all RAF maths. Cycle auto-resets after a
#       FOSSIL_PAUSE (3 s) at the entombed end.
#     Stage transition flash — edge-triggered: .hero--threshold-cross class added
#       on each stage boundary crossing; background-color burst then fades out via
#       @keyframes hero-threshold-cross.
#     Hold progress ring — .hero-hold-ring absolutely-positioned conic-gradient
#       ring around the KEEP button; --hold-progress CSS var animated each RAF
#       tick via startHoldRing(); mask: radial-gradient reveals only a 3 px arc.
#     Day counter — .hero-day-counter text element updated every RAF tick; shows
#       "Day X / 100" live, then "Day 100 — entombed" at fossil threshold.
#     Hero tagline — two-line .hero-tagline-line stagger fade-in (opacity 0→1,
#       translateY var(--space-1)→0); line-2 delayed by --motion-flow-duration.
#     Fossil gravity — [data-stage="fossil"] .hero-card: scale(0.96) + inset deep
#       shadow; .hero-title-bar fades to --text-disabled opacity.
#     KEEP button label updated to "hold to keep alive" (Tanya §4 tone parity).
#     Pulse default period tuned: 833ms (fresh, 72 BPM) replacing old 1578ms.
#     prefers-reduced-motion: RAF skipped; static snapshot at endangered stage
#       (fog-of-war effect without any motion).
#     Token compliance: all new CSS uses design-token vars (zero raw hex/rgba).
#   Modified files (no new files):
#     src/components/LandingHero.astro — SSR simplified to always-fresh snapshot;
#       ssrBpm() + live decay calc removed; hero-tagline block, hero-day-counter
#       span, hero-hold-ring span, updated KEEP label added.
#     src/lib/client/landing-hero.ts — DemoState shape replaced (startMs,
#       fossilAt); TIME_SCALE constant; computeDecay() now operates on real-time
#       elapsed; writeHeroVars() updates .hero-day-counter text; resetCycle() for
#       loop; startHoldRing() RAF-driven ring progress replaces setTimeout; hold
#       handlers updated to use ring instead of plain timer.
#     src/pages/index.astro — heroDecay/heroStage constants simplified to 0 /
#       'fresh' (SSR always fresh; client animates).
#     src/styles/landing-hero.css — hero-tagline + @keyframes hero-tagline-in;
#       .hero-day-counter; .hero-hold-ring (conic-gradient + mask ring); fossil
#       gravity (.hero-card scale + title opacity); stage-transition flash
#       @keyframes hero-threshold-cross; decay-fill default width corrected to 0;
#       pulse period default corrected to 833ms; reduced-motion guards expanded.
#     AGENTS.md — WIP updated: LandingHero sprint marked Done; token violation
#       count corrected to ~531.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v119).
#
# Architecture v119 — Decay Perceptual Contrast System + Dockerfile Fix (2026-04-14)
#   Sprint: Perceptual easeInQuad curve transforms the decay visual pipeline —
#     front-loads freshness, makes aging dramatically visible. Stage material
#     identity (ghost=dashed, fossil=dotted+letter-spacing) layers discrete
#     structure cues on top of continuous filter interpolation. Temporal band
#     grouping on homepage partitions live posts into now/recent/archive with
#     spacing cascade. Endangered pulse synchronized at 2s for all cards, urgency
#     via glow intensity not speed. Dockerfile bug fix: COPY scripts/ for prebuild
#     token lint guard. DecayCard final token compliance pass.
#   New exports (no new files):
#     src/lib/decay-engine.ts — perceptualFactor(f): easeInQuad (f*f) that
#       widens visual contrast between stages. stageFromFactor(f): classify raw
#       decay factor into fresh/fading/endangered/ghost/fossil. timeBand(days):
#       partition posts into now (<2d) / recent (<14d) / archive bands.
#       DecayStage type exported.
#   Modified files:
#     Dockerfile — added COPY scripts/ ./scripts/ so prebuild token lint guard
#       (npm run prebuild → check-token-compliance.ts --guard) runs during Docker
#       build stage. Without this, the prebuild step would fail with ENOENT.
#     src/lib/decay-engine.ts — perceptualFactor(), stageFromFactor(), timeBand()
#       added. Visual mappings widened: opacity 1→0.25 (was 0.35), blur 0→2.5px
#       (was 1.5px), saturation 1→0.15 (was 0.4), sepia 0→0.35 (was 0.15).
#       borderRadius renamed to radiusPx (14→8px, was 20→4px).
#     src/lib/live-decay.ts — client-side RAF loop aligned with perceptual curve:
#       emits --decay-perceptual CSS var, syncs data-decay-stage attribute on each
#       card per tick. Shadow/radius/opacity deltas driven by perceptualFactor.
#     src/components/DecayCard.astro — 2 legacy rgba → token refs (100% compliant).
#     src/pages/index.astro — temporal band grouping: imports timeBand + daysSince,
#       partitions live posts into liveNow/liveRecent/liveArchive, renders <section
#       data-time-band="..."> per band with data-atmosphere for CSS cascade.
#     src/styles/tokens.css — stage visual profile tokens (--stage-{stage}-shadow-y,
#       shadow-spread, border-style, letter-spacing); temporal band tokens
#       (--band-gap-now/recent/archive); fresh shadow tuned (y:10px, spread:40px);
#       hover shadow lifted (14px/48px). Continuous radius range narrowed 14→8px
#       per Tanya §1 recommendation.
#     src/styles/decay.css — stage material identity CSS: [data-decay-stage="ghost"]
#       dashed border, [data-decay-stage="fossil"] dotted + letter-spacing. Card
#       computed radius calc updated (14px - factor*6px). will-change adds filter.
#       Temporal band spacing: [data-time-band] gap cascade with tokens.
#     src/styles/endangered.css — synchronized pulse: all cards at 2s (was variable
#       --endangered-pulse-speed 4s). Urgency via --urgency-glow-opacity intensity.
#       Saturation uses --stage-endangered-saturation token.
#     scripts/check-token-compliance.ts — GUARD_FILES expanded; DecayCard.astro
#       now passes zero-violation check.
#     AGENTS.md — WIP updated: Decay Perceptual Contrast System marked DONE;
#       DecayCard 100% compliant; next: Tier 2 migration targets listed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     Dockerfile fix is the only infra change (scripts/ directory copy).
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v118).
#
# Architecture v118 — Tier 1 Token Compliance Guard + Surfaces Module (2026-04-14)
#   Sprint: First wave of token-compliant guard files locked down with a prebuild
#     gatekeeper that fails the Docker build if any guarded file regresses. Eight
#     files now pass zero-violation token compliance. New shared surfaces.css
#     module eliminates per-component glass/backdrop-filter boilerplate. Duplicate
#     motion tokens removed from tokens.css (single source: motion.css). New
#     --text-prose token for long-form reading.
#   New files:
#     src/styles/surfaces.css — shared glass-morphism utility classes; 3 tiers:
#       .surface-glass-subtle (4px blur), .surface-glass-medium (8px blur),
#       .surface-glass-strong (12px blur); opaque surfaces: .surface-card,
#       .surface-well, .surface-well-deep; .surface-panel (near-opaque + strong
#       blur); prefers-reduced-motion guard disables backdrop-filter. Rule:
#       "every glass/translucent surface must use one of these classes."
#   Modified files:
#     package.json — new "prebuild" script: `npx tsx scripts/check-token-
#       compliance.ts --guard`; runs before every `npm run build` (including
#       Docker build stage); exits non-zero if any guarded file has violations.
#     scripts/check-token-compliance.ts — GUARD_FILES set (8 files: PactPanel,
#       [slug].astro, EndangeredCard, EndangeredBand, TombstoneCard, LandingHero,
#       RiverFilter, surfaces.css); --guard mode: checks only guarded files for
#       build-breaking enforcement, reports unguarded as warnings; filterGuarded()
#       + filterUnguarded() helpers.
#     src/styles/global.css — added @import "./surfaces.css" between tokens.css
#       and motion.css in the cascade.
#     src/styles/tokens.css — removed duplicate motion tier tokens (snap/flow/
#       drift/ceremony) that conflicted with motion.css values (Tanya §8 audit);
#       new --text-prose: 1.1rem (17.6px) for post body / long-form reading.
#     src/components/PactPanel.astro — full token compliance pass (28 rgba → 0);
#       inline styles migrated to var(--surface-*), var(--text-*), var(--border-*)
#       tokens.
#     src/components/TombstoneCard.astro — font-size hardcoded px → var(--text-*)
#       tokens; color cleanup.
#     src/pages/blog/[slug].astro — 12 rgba/hex values → var(--text-tertiary),
#       var(--text-ghost), var(--text-secondary), var(--text-primary),
#       var(--border-faint), var(--border-subtle) tokens.
#     AGENTS.md — WIP updated: Tier 1 complete (8 guard files clean, ~532
#       remaining in Tier 2+); next targets: AuditReceipt (65), VerdictResolution-
#       Panel (40), SealCeremony (40); nav simplification added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v117).
#
# Architecture v117 — Design Token Consolidation + Compliance Expansion (2026-04-14)
#   Sprint: Server-side color single-source-of-truth established; OG layout
#     hardcoded hex eliminated; broad rgba()/hex → CSS token sweep across 10+
#     components and pages; token compliance linter extended to scan .astro
#     inline <style> blocks (593 remaining violations tracked in AGENTS.md WIP).
#   New files:
#     src/lib/design-tokens.ts — server-side mirror of tokens.css semantic
#       colors. Satori (OG renderer) cannot resolve CSS custom properties and
#       needs raw hex; this module is the single source for all TS-side color
#       references. Exports COLORS record (surfaceBase, surfaceRaised, gold,
#       text, dim, verdictTrue/Wrong/Evolved, tierBronze/Silver/Gold/Diamond)
#       and ColorKey type. Rule: "if you need a color in TypeScript, import
#       from design-tokens.ts — never hardcode hex in OG layouts."
#   Modified files:
#     src/lib/og/accountabilityLayout.ts — C color map rewritten: hardcoded
#       hex (#0c0c0e, #1a1a1f, #F5A623, #e8e8ec, #6b6b80, #22c55e) replaced
#       with COLORS.surfaceBase/surfaceRaised/gold/text/dim/verdictTrue imports.
#     src/lib/og/auditLayout.ts — same treatment; additionally replaces #ef4444
#       → COLORS.verdictWrong, #a78bfa → COLORS.verdictEvolved.
#     src/lib/og/battingAverageLayout.ts — imports COLORS from design-tokens;
#       local hex map replaced with shared source.
#     src/lib/og/sealLayout.ts — same treatment as above OG layouts.
#     src/components/AuditReceipt.astro — 12 raw hex/rgba values migrated to
#       var(--gold), var(--gold-bg), var(--gold-border), var(--gold-mid),
#       var(--verdict-true), var(--verdict-true-bg/border), var(--verdict-wrong),
#       var(--verdict-wrong-bg/border) tokens.
#     src/components/ConvictionMeter.astro — #F5A623 → var(--gold).
#     src/components/GraveyardTeaser.astro — hsl() dot colors → var(--text-
#       tertiary), var(--clr-amber-400).
#     src/components/VerdictResolutionPanel.astro — inline rgba() verdict
#       colors → var(--verdict-true-solid/evolved-solid/wrong-solid/abandoned)
#       CSS custom properties with color-mix compositing via tokens.css.
#     src/pages/admin.astro — background #0c0c0e → var(--surface-base).
#     src/pages/author/index.astro — #F5A623 → var(--gold), #0c0c0e →
#       var(--surface-base).
#     src/pages/author/submit.astro — #F5A623 → var(--gold), hardcoded 2px
#       radius → var(--radius-xs).
#     src/pages/blog/[slug].astro — 6 rgba() values → var(--text-tertiary),
#       var(--text-ghost), var(--text-secondary), var(--text-primary),
#       var(--border-faint), var(--border-subtle).
#     src/pages/index.astro — rgba() → var(--border-subtle), var(--text-ghost);
#       0.65rem → var(--text-2xs).
#     src/styles/tokens.css — New tokens: --verdict-true-solid, --verdict-wrong-
#       solid, --verdict-evolved-solid (color-mix 80%/75% alpha), --verdict-
#       abandoned (alias → --text-tertiary), --radius-xs (2px — progress bars,
#       thin indicators).
#     src/styles/batting-progress.css — minor token migration.
#     src/styles/endangered.css — minor token migration.
#     src/styles/river.css — minor token migration.
#     src/styles/seal-ceremony.css — minor token migration.
#     scripts/check-token-compliance.ts — linter now scans .astro inline
#       <style> blocks (collectAstroFiles recursive + scanAstroFile with line-
#       offset preservation); var(--token, #fallback) defensive CSS whitelisted
#       via isInsideVarFallback(); code cleanup passes.
#     AGENTS.md — WIP updated: token compliance sweep progress (593 rgba
#       violations in 40+ components), sitemap restructure, blog detail surgery.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v116).
#
# Architecture v116 — Portability Kit + Design Token Polish (2026-04-13)
#   Sprint: Batting average becomes a portable, embeddable credential. New
#     /api/batting-average-embed endpoint serves three output formats (JSON,
#     self-contained HTML widget, shields.io-style SVG badge) for any author.
#     Per-author OG share cards render trophy tier, name, selectivity chip,
#     and tier-colored progress bar — threaded through battingAverageLayout →
#     renderOGImage → batting-average.png endpoint (?author= param). Author
#     profile pages now set per-author OG image via new BaseLayout `image` prop
#     → SEOMeta. conviction-stats API auto-resolves ?published= from the content
#     collection when omitted and includes `author` field in response payload.
#     Design token compliance pass: OpenLoopCard migrates rgba(var(--mood-accent-
#     rgb)) → color-mix(in oklch, var(--mood-accent)); ShareSheet replaces raw
#     z-index, hex colors, and transition values with --z-sticky, --surface-*,
#     --text-*, --motion-* tokens; StanceDrawer z-index → --z-drawer token,
#     handle colors → --text-faint/--text-ghost. tokens.css gains --shadow-card-
#     endangered (missing token per Tanya §4.1), BA embed token suite (--ba-embed-
#     bg/border/text/accent/radius), and tier label string tokens.
#   New files:
#     src/pages/api/batting-average-embed.ts — GET /api/batting-average-embed;
#       params: ?author= (default 'host'), ?format= ('json'|'html'|'svg',
#       default 'json'). JSON shape: { author, battingAverage, trophyTier,
#       resolvedCorrect, resolvedTotal, selectivityRate, eligible, verifyUrl,
#       ogImageUrl, generatedAt }. HTML: self-contained inline-styled dark card
#       with pct hero, name, tier badge, verify link. SVG: shields.io-style
#       flat badge (label|value, tier-colored). Cache-Control: public, max-age=
#       3600, stale-while-revalidate=86400. Uses getCollection('blog') for
#       published count. Credits: Mike (Portability Kit spec), Elon (portable
#       credential insight), Paul Kim (OG card IS the invite), Tanya (embed
#       visual spec).
#   Modified files:
#     src/lib/og/battingAverageLayout.ts — OGAuthor interface exported (slug,
#       name, tier, selectivity); TIER_COLOR + TIER_GLYPH records for per-author
#       rendering; authorNameRow() renders name + tier badge + glyph; pctNumber()
#       + barFill() accept optional tier for tier-colored rendering; selectivity-
#       Chip() shows "N% selectivity · skin in the game"; coldSubtitle() author-
#       aware ("5 verdicts to unlock" vs "No resolved bets yet"); C.ghost +
#       C.white tokens added to color map. battingAverageLayout() now accepts
#       optional OGAuthor third parameter.
#     src/lib/og/renderOGImage.ts — OGAuthor type re-exported; renderBatting-
#       AverageImage() extended with optional author?: OGAuthor param threaded
#       to battingAverageLayout().
#     src/pages/api/og/batting-average.png.ts — ?author= query param support;
#       sitewideCard() (no author) vs authorCard() (per-author) routing;
#       toBattingAverage() converts BattingAverageResult → BattingAverage
#       discriminated union; toOGAuthor() maps result to OGAuthor interface;
#       cache extended to max-age=3600, stale-while-revalidate=86400.
#     src/pages/api/conviction-stats.ts — GET handler now async; auto-resolves
#       ?published= from getCollection('blog') when param omitted; response
#       payload gains `author` field; buildSitewidePayload → buildAuthorPayload
#       rename; resolvePublishedCount() helper with try/catch fallback to 0.
#     src/pages/author/[slug].astro — imports canonicalUrl; computes ogImage
#       URL (/api/og/batting-average.png?author=slug); passes image={ogImage}
#       to BaseLayout for per-author social share cards.
#     src/layouts/BaseLayout.astro — new optional `image` prop (string); takes
#       precedence over ogSlug for OG image URL; threaded through to SEOMeta.
#     src/components/OpenLoopCard.astro — border + box-shadow migrated from
#       rgba(var(--mood-accent-rgb)) to color-mix(in oklch, var(--mood-accent));
#       eliminates dependency on --mood-accent-rgb fallback channel.
#     src/components/ShareSheet.astro — z-index: 8 → var(--z-sticky); background
#       raw rgba → --surface-inset-deep / --surface-overlay; color raw hex →
#       --mood-accent / --text-primary; border raw rgba → color-mix(); transition
#       durations → --motion-flow-duration/--motion-snap-duration with matching
#       easing tokens.
#     src/components/StanceDrawer.astro — overlay z-index: 99 → var(--z-drawer);
#       drawer z-index: 100 → calc(var(--z-drawer) + 1); handle background →
#       --text-faint, hover → --text-ghost; transition → --motion-snap-* tokens.
#     src/styles/tokens.css — --shadow-card-endangered (amber edge glow, Tanya
#       §4.1); BA embed suite: --ba-embed-bg/border/text/text-dim/text-ghost/
#       accent/radius; tier label tokens: --ba-tier-{locked|bronze|silver|gold|
#       diamond}-label.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v115).
#
# Architecture v115 — BattingProgressRing + BattingUnlockCeremony + Progress API (2026-04-13)
#   Sprint: Conviction unlock progress visualised as a circular SVG gauge on the
#     author profile page and leaderboard rows. Three-phase unlock ceremony fires
#     once per author when the 5th verdict resolves. Public REST endpoint exposes
#     the same derived progress data for API consumers.
#   New files:
#     src/components/BattingProgressRing.astro — SVG conviction unlock ring;
#       two variants: default (96px, author profile — counter label + caption)
#       and compact (36px, leaderboard rows — ring only). Geometry: viewBox
#       0 0 100 100, r=40, circumference≈251.33; 5 tick marks at 72° intervals
#       starting at 12-o'clock; stroke-dashoffset SSR-computed from
#       progress.pct (no FOUC); DOM contract: data-bpr-slug, data-bpr-resolved,
#       data-bpr-unlocked read by BattingUnlockCeremony client. Imports
#       batting-progress.css; pure SSR — no JS waterfall.
#     src/components/BattingUnlockCeremony.astro — one-time 3-phase ceremony
#       overlay triggered when batting average unlocks: Phase 1 (0ms)
#       ring.bpr--has-shattered → lock icon exits; Phase 2 (300ms) gold flash
#       overlay fades in/out; Phase 3 (700ms) 'batting-unlock-complete' event
#       fires for downstream decoration. Session guard: localStorage key
#       batting-unlock-ceremony-${authorSlug} prevents replay across reloads.
#       Also listens to 'bah:unlock' CustomEvent for real-time delivery.
#       Circuit breaker: if unlocked=true on page load + ceremony not yet
#       shown, runs after 200ms (handles stale-cache scenario). Reduced-motion
#       guard: instant swap, no animation. CSS-class-driven — no RAF math.
#     src/pages/api/batting-progress/[slug].ts — GET /api/batting-progress/
#       :authorSlug; public — no auth. Returns { authorSlug, resolved, required,
#       pct, unlocked, recentVerdicts[] }; recentVerdicts[] shape: { postSlug,
#       state: 'upheld'|'overturned', resolvedAt (unix ms) }. 404 for unknown
#       slugs (getAllAuthorSlugs gate). Cache-Control: public max-age=60,
#       stale-while-revalidate=300 (progress ticks infrequently). API-parity
#       rule: external consumers get the same data the ring renders from SSR.
#     src/styles/batting-progress.css — ring fill + tick-pop + lock-shatter +
#       count-reveal + unlock-pulse animations; token-compliant (zero raw
#       hex/rgba); local :root aliases --ring-track-color, --ring-pending-color,
#       --ring-unlocked-color, --ring-notch-filled, --ring-notch-empty;
#       @keyframes ring-fill (stroke-dashoffset sweep), tick-pop (spring
#       overshoot via CSS linear()), lock-shatter, bpr-unlock-pulse;
#       reduced-motion guard cancels all animations.
#   Modified files:
#     src/components/LeaderboardCard.astro — imports BattingProgressRing +
#       getUnlockProgress; adds <BattingProgressRing compact={true} /> to
#       lb-stats slot alongside existing BattingAverageChip.
#     src/lib/batting-average.ts — UnlockProgress interface (authorSlug,
#       resolved 0–MIN_VERDICTS, required, pct 0.0–1.0, unlocked bool);
#       getUnlockProgress(authorSlug) derived-only — never persisted; queries
#       getSealsByAuthor + getVerdictEventsForSlugs; countUniqueVerdicts uses
#       Set over post_slug (first-write-wins per slug). "Query it, don't write
#       it." — Mike §POI #9.
#     src/lib/conviction-ledger.ts — getVerdictsByAuthorRecent(authorSlug,
#       limit=5) returns last N verdict events for the progress API; uses
#       recentVerdictSql() builder for parameterised IN clause.
#     src/pages/api/verdict-resolve.ts — after verdict commit, calls
#       getUnlockProgress(authorSlug) and broadcasts 'batting-unlock' SSE
#       event when progress.resolved === MIN_VERDICTS (exact crossing check);
#       getSealEntry(slug) used to resolve authorSlug; fire-and-forget — verdict
#       already committed before this runs; error caught silently.
#     src/pages/author/[slug].astro — imports BattingProgressRing +
#       BattingUnlockCeremony + getUnlockProgress; renders ap-ring-row div
#       containing both components after AuthorProfileHero.
#     src/styles/author-profile.css — ap-ring-row layout styles for the
#       ring + ceremony slot on the author profile page.
#     src/styles/tokens.css — ring primitive tokens aliased in
#       batting-progress.css :root block.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v114).
#
# Architecture v114 — Decay Stage Identity System (2026-04-13)
#   Sprint: Five discrete visual worlds layered over the existing continuous decay
#     gradient. Each stage (fresh/fading/endangered/ghost/fossil) now has a complete
#     visual identity: stage-specific border color, title font-weight, excerpt opacity,
#     border radius (alive=organic 14px → ghost=stiffening 10px → fossil=tombstone 8px),
#     and box-shadow. Endangered gains a slow pulsing border (0.5 Hz, 2s period) as an
#     urgency signal; an Adobe-pattern circuit-breaker (armCircuitBreaker, 15s setTimeout)
#     guards against stuck animations on tab restore. Fossil cards are tombstones: no
#     elevation, no hover lift, no pulse — completely still. The system is card-scoped:
#     --si-* vars written to el.style (never :root) to prevent cascade pollution between
#     cards at different decay stages co-existing on the same page.
#   New files:
#     src/lib/client/stage-identity.ts — stageFor() maps decay factor [0,1] to StageId;
#       tokensFor() returns full StageTokens record; applyStageTokens(el, stage) writes
#       7 --si-* CSS vars to card element inline style and sets data-decay-stage attribute;
#       idempotent guard (no-op if stage already matches); pure functions — zero new RAF
#       registrations; FOSSIL_THRESHOLD=0.97 mirrors heartbeat-orchestrator constant.
#     src/styles/decay-stage-identity.css — [data-decay-stage="*"].decay-card selectors
#       for all 5 worlds; fresh: high-chroma green lift shadow; fading: warmth-retreating
#       amber shadow; endangered: pressure ring box-shadow + border-pulse @keyframes (0.5
#       Hz) + title color=--color-decay-endangered; ghost: near-flat shadow + letter-
#       spacing 0.02em (text recedes, users lean in); fossil: box-shadow:none + hover
#       lift override (transform:none); cover-wrap border-radius concentric match per
#       stage; reduced-motion guard cancels border-pulse, preserves all other identity
#       properties (weight/opacity/shadow/radius are non-animated — Tanya §12 Rule 5).
#   Modified files:
#     src/components/DecayCard.astro — stageAttr() SSR-computes initial data-decay-stage
#       from post.decay factor; data-decay-stage attribute added to article root (no FOUC
#       before JS); handleStageChange() syncs data-decay-stage on decay:stage-change event;
#       armCircuitBreaker() cancels stuck border-pulse after 15s if card still endangered
#       (Adobe §circuit-breaker + Tanya §12 Rule 4); cover-image blur capped at 1.2px
#       (was 2px — Tanya §5: cap blur at 1.2px, 2px looks broken not aged).
#     src/lib/client/heartbeat-orchestrator.ts — imports applyStageTokens + stageFor
#       from stage-identity; writeStaticState() gains el: HTMLElement param and calls
#       applyStageTokens(el, stage) (fossil exit path — Mike Koch §napkin-plan); tickColor()
#       calls applyStageTokens every THROTTLED 120ms tick (idempotent guard, card-scoped);
#       tickFrame() fossil-threshold branch passes cardEl to writeStaticState.
#     src/styles/tokens.css — stage border tokens (--stage-{fresh|fading|endangered|
#       ghost|fossil}-border aliasing --color-decay-* ramp, no raw hex); title weight
#       ladder per stage; --stage-endangered-pulse-dur/ease; radius ladder (--radius-
#       stage-alive 14px / ghost 10px / fossil 8px); --shadow-conviction + --shadow-
#       conviction-glow (gold accountability, Tanya §13); --surface-receipt + --border-
#       receipt (Tanya §6.3); --pulse-ring-color.
#     src/layouts/BaseLayout.astro — imports decay-stage-identity.css immediately after
#       decay.css (import order enforces specificity: [data-decay-stage].decay-card beats
#       .decay-card — intentional cascade override).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v113).
#
# Architecture v113 — Stage-Crossing Flash: Decay Card Visual Flinch System (2026-04-13)
#   Sprint: DecayCard gains a stage-crossing visual flinch fired the instant the
#     decay:stage-change CustomEvent bubbles up from a DecayClock ring. A client
#     module script (Astro-deduplicated across all card instances) attaches one
#     listener per .decay-card article; on each stage-change it adds a transient
#     .decay-card--crossing-{stage} class for the flash duration then removes it.
#     CSS drives the entire animation: a 3-layer box-shadow ring burst (asymmetric
#     18% attack / 82% decay) + a cover-image ::after tint overlay (opacity burst
#     only — no motion per Tanya §3.3). Stage urgency is graded — endangered gets
#     the longest flash (600ms) and highest ring peak (0.40), fossil is near-silent
#     (300ms, 0.12). Reduced-motion guard cancels both animations entirely; stage
#     transition is still communicated via data-atmosphere color shift + haptic.
#   Modified files:
#     src/components/DecayCard.astro — position:relative added to .cover-wrap
#       (required: stage-crossing ::after tint is absolutely positioned within);
#       <script> block wires decay:stage-change CustomEvent to class state machine;
#       PREFIX='decay-card--crossing-'; FLASH_MS record (stage→ms) mirrors token
#       values; handleStageChange() re-entry guard (class includes PREFIX check);
#       attachListeners() idempotent via DOMContentLoaded guard; Astro deduplicates
#       module script across all DecayCard instances on the page.
#     src/styles/decay.css — Stage-crossing flash system added after decay card
#       resting styles and before reduced-motion guard: four .decay-card--crossing-
#       {fading|endangered|ghost|fossil} bridge classes set CSS var quartet
#       (--flash-color from --color-decay-* ramp, --flash-ring-peak, --flash-tint-
#       peak, --flash-dur); [class*="decay-card--crossing-"] applies stage-ring-flash
#       @keyframes to card box-shadow (3-layer structure at 0%/100% mirrors resting
#       shadow for smooth interpolation; 18% keyframe injects ring glow peak);
#       .cover-wrap::after pseudo-element driven by stage-cover-tint @keyframes
#       (opacity 0→peak→0, no translate/scale); reduced-motion guard adds
#       animation:none to both [class*] and .cover-wrap::after selectors.
#     src/styles/tokens.css — 12 flash tokens added to :root: --flash-ring-opacity-
#       {fading|endangered|ghost|fossil} (0.28/0.40/0.20/0.12 — border glow peaks);
#       --flash-tint-opacity-{fading|endangered|ghost|fossil} (0.10/0.16/0.08/0.05
#       — cover tint peaks); --flash-duration-{fading|endangered|ghost|fossil}
#       (480ms/600ms/400ms/300ms); endangered weighted highest for urgency.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v112).
#
# Architecture v112 — Living Decay Clock: Per-Clock Heartbeat Orchestrator (2026-04-13)
#   Sprint: DecayClock ring elevated from a static SSR arc to a fully-live,
#     per-clock decay engine. Each ring on the page now has its own 1Hz delta
#     computation that drifts the arc in real time from the server-render
#     snapshot; conviction multiplier (verdictModifier) modulates the decay
#     speed per ring (still-true=0.7×, evolved=0.9×, base=1.0×, wrong=1.4×).
#     Stage transitions (fresh→fading→endangered→ghost→fossil) detected client-
#     side and surfaced via data-stage attr + CustomEvent; haptic pattern fires
#     on stage crossing (warning-tier haptic). IntersectionObserver pauses off-
#     screen clocks (perf — river page has 20+ rings); MutationObserver handles
#     DOM removal cleanup. Three-layer visual system: outer arc ring (--live-decay
#     → stroke-dashoffset, 1Hz JS writes), inner pulse ring (@keyframes decay-
#     pulse, synced to --pulse-interval), ambient glow div (decay-glow + decay-
#     breathe). CSS @property registers --decay-ring-color as <color> (enables
#     native OKLCH interpolation; without it browsers binary-flip transitions).
#   New files:
#     src/lib/client/decay-heartbeat-orchestrator.ts — per-clock orchestrator;
#       bootstraps each clock from data-* server snapshot; 1Hz LOW-bucket task
#       via frame-scheduler; writes --live-decay + --pulse-interval CSS vars;
#       stage transition detection + haptic; IntersectionObserver idle-pause;
#       MutationObserver cleanup; pure delta model (trusts server render).
#     src/styles/decay-clock.css — animation soul for the decay clock;
#       @property --decay-ring-color (<color>) + --live-decay (<number>);
#       five staged color stops mapped to --color-decay-* tokens (zero raw
#       OKLCH literals); @keyframes decay-pulse (inner pulse ring), decay-glow
#       + decay-breathe (ambient glow div); reduced-motion guard cancels all.
#   Modified files:
#     src/components/DecayCard.astro — imports convictionMultiplier from
#       decay-engine; computes verdictModifier; passes verdictModifier to
#       DecayClock ring; cover-gradient gains max(2%, …) guard to preserve
#       ghost of warmth at fossil stage (Tanya §7.1); card footer background
#       migrated from inline rgba(12,12,14,0.95) to --surface-footer token.
#     src/components/DecayClock.astro — imports decay-clock.css; adds
#       computedAt (ISO timestamp, delta origin) + verdictModifier props;
#       exposes data-computed-at, data-verdict-modifier, data-stage attrs;
#       ambient glow <div class="decay-clock__glow" /> inserted behind SVG;
#       inner <circle class="decay-clock__pulse-ring" /> added; --live-decay
#       seed written server-side (no FOUC before JS loads); ring stroke
#       migrated to var(--decay-ring-color) with hsl() fallback; initDecay-
#       Heartbeat() wired alongside initHeartbeatOrchestrator() on DOMContent-
#       Loaded; stroke-dasharray fixed to 175.93 (circumference of r=28).
#     src/components/EndangeredCard.astro — imports convictionMultiplier;
#       data-atmosphere="endangered" added to article root; passes decayFactor
#       + verdictModifier to DecayClock (endangered cards now get live arc too).
#     src/styles/tokens.css — --surface-footer token (card footer bg, Tanya
#       §11); decay color ramp revised for perceptual distance (each stage must
#       feel like a different world — chroma + lightness gaps widened at all
#       stops); --shadow-card-fading added (missing token filled, Tanya §3.1).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v111).
#
# Architecture v111 — ConvictionStrip Zone 2B + OnboardingOverlay Step 3 (2026-04-13)
#   Sprint: ConvictionStrip WIP resolved — the live batting-average strip is now
#     wired in two placements: (A) OnboardingOverlay Step 3 (variant="overlay"),
#     replacing the abstract text description with the real live component; and
#     (B) Zone 2B at the bottom of the homepage feed as a comprehension anchor
#     after the visitor has scrolled through posts. Above-fold Zone 1.5 placement
#     remains removed per Tanya §2 (LandingHero owns Zone 1 alone).
#   Modified files:
#     src/components/ConvictionStrip.astro — variant prop added ('default'|
#       'overlay'); cs-strip--overlay class constrains width + steps font-size
#       down from 2xl → xl for panel context; variant prop threaded through
#       class:list.
#     src/components/OnboardingOverlay.astro — imports ConvictionStrip; adds
#       .ov-strip-slot div wrapping <ConvictionStrip variant="overlay" />; CSS
#       state machine shows slot only on [data-step="3"] and hides
#       [data-conviction-demo] on step 3 (strip takes the demo role); z-index
#       bug fixed: --z-modal → --z-onboarding on .ov root.
#     src/components/ConvictionDemo.astro — data-conviction-demo attribute added
#       to root div to allow OnboardingOverlay CSS to target and hide the demo
#       on step 3 when ConvictionStrip is visible.
#     src/pages/index.astro — ConvictionStrip re-imported; .feed-strip-anchor
#       wrapper div added after EndangeredBand (Zone 2B); border-top separator
#       with var(--space-10) top margin; import comment updated.
#     AGENTS.md — WIP section cleared; ConvictionStrip marked shipped with
#       placement details and z-index fix noted.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v110).
#
# Architecture v110 — BattingAverage Unlock Ceremony Overlay (2026-04-13)
#   Sprint: 4-phase full-screen ceremony overlay fires the instant the 5th
#     verdict resolves. Triggered via the onUnlockTriggered() hook exported by
#     ba-unlock-progress.ts; session-guarded against replay across page reloads.
#     Phases: shattering (lock SVG gold-pulse + clip-path dissolve, 200ms) →
#     counting (BA % counts 0 → real value via spring-easing countUp, 800ms) →
#     dropping (tier badge springs in via linear() spring timing, 400ms) →
#     settling (badge heartbeat; overlay fades softly, then hides at 1900ms).
#   New files:
#     src/components/BattingAverageUnlockCeremony.astro — ceremony overlay root;
#       rendered in BattingAverageHero cold state; inert + display:none until JS
#       activates; DOM contract: #ba-unlock-ceremony [data-phase=...], .bauc-lock-
#       wrap, .bauc-count-wrap/.bauc-pct, .bauc-fill, .bauc-badge-wrap/
#       .bauc-tier-icon/.bauc-tier-name; role="dialog" aria-modal="true" on reveal;
#       aria-live="assertive" for screen-reader announcement; inert re-applied on
#       cleanup; imports ba-unlock-ceremony.css.
#     src/lib/client/ba-unlock-ceremony.ts — phase state machine; boots via
#       onUnlockTriggered() from ba-unlock-progress.ts; sessionStorage key
#       'ba-ceremony-fired' prevents replay; prefers-reduced-motion guard (instant
#       swap, no animation); T_COUNTING=200ms, T_DROPPING=1000ms, T_SETTLING=
#       1400ms, T_CLEANUP=1900ms; TIER_ICONS map (bronze/silver/gold/diamond
#       emoji); uses spring-easing.ts countUp + frame-scheduler singleton.
#     src/styles/ba-unlock-ceremony.css — token-disciplined overlay styles; zero
#       raw hex/rgba; [data-phase=...] drives show/hide of .bauc-lock-wrap /
#       .bauc-count-wrap / .bauc-badge-wrap; @keyframes bauc-lock-shatter,
#       bauc-lock-pulse, bauc-badge-drop (linear() spring with cubic-bezier
#       fallback via @supports), bauc-badge-heartbeat; CSS fill bar transition on
#       --ba-count-progress @property; reduced-motion guard cancels all animations.
#   Modified files:
#     src/components/BattingAverageHero.astro — imports BattingAverageUnlock
#       Ceremony; adds data-unlock-target to section root; renders
#       <BattingAverageUnlockCeremony /> in cold state (inert until JS fires);
#       cold-state container gains position:relative to contain absolute overlay;
#       imports ba-unlock-ceremony.ts client script.
#     src/lib/client/ba-unlock-progress.ts — exports onUnlockTriggered(cb) hook
#       and _unlockCallbacks Set; notifyUnlockCallbacks() fires BEFORE bah:unlock
#       CustomEvent in both reduced-motion and animated ceremony paths; designed
#       for ceremony orchestrators per Mike napkin spec §ba-unlock-progress.ts.
#     src/pages/index.astro — ConvictionStrip removed from homepage per Tanya §2
#       (LandingHero owns above-fold story alone); component preserved; moves to
#       OnboardingOverlay first-visit slot and bottom-of-feed option.
#     src/styles/tokens.css — @property --ba-count-progress (syntax: '<number>',
#       inherits: false, initial-value: 0) for smooth CSS fill-bar transition;
#       --color-decay-fossil changed to oklch(42% 0.04 60deg) (stone gray per
#       Tanya §7 — "at rest", not alarm).
#     AGENTS.md — BattingAverage unlock ceremony overlay sprint logged.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v109).
#
# Architecture v109 — BattingAverage Unlock Progress + Trophy Tier Ladder (2026-04-13)
#   Sprint: Cold-state batting-average UI elevated from a plain text lock message
#     to a full unlock ceremony. Two new components replace the inline lock row;
#     a client ceremony orchestrator wires SSE verdict:declared to real-time
#     dot-fill animation; bah:unlock CustomEvent bridges the unlock moment back
#     to BattingAverageHero for the live score count-up reveal.
#   New files:
#     src/components/BattingAverageUnlockProgress.astro — 5-dot progress track
#       for cold state; SSR-stamped [data-ba-dot-track][data-resolved="N"] DOM
#       contract; [data-dot-index] + [data-filled] on resolved dots; explainer
#       line + mono "N more verdicts" counter (aria-live); ba-unlock-progress.css.
#     src/components/TrophyTierLadder.astro — 4-rung (bronze/silver/gold/diamond)
#       milestone strip rendered in cold state; bronze rung gets --next class when
#       currentTier === 'locked' for soft-glow motivational hint; JS adds
#       [data-unlocked] on bah:unlock for tier-rung-spring animation.
#     src/lib/client/ba-unlock-progress.ts — MutationObserver-free ceremony
#       orchestrator; boots on DOMContentLoaded; listens to /api/heartbeat SSE
#       'verdict:declared'; fillNextDot() advances the track one dot per event;
#       at MIN_VERDICTS crossing fires cascade bloom + dispatches bah:unlock
#       CustomEvent; CASCADE_STAGGER=50ms, BLOOM_DELAY=300ms; reduced-motion
#       guard; imports frame-scheduler singleton for LOW priority keep-warm.
#     src/styles/ba-unlock-progress.css — token-disciplined styles for both new
#       components; ba-dot-spring (@keyframes scale 0.4→1.2→1); ba-dot-fill-burst
#       bloom burst; tier-rung-spring translateY(8px→-2px→0) + scale spring;
#       reduced-motion guard cancels all animations; zero raw colors.
#   Modified files:
#     src/components/BattingAverageChip.astro — provisional state gains inline
#       SVG mini-dot row (MIN_VERDICTS × 10px wide, 8px tall); bac__mini-dot
#       filled/empty driven by result.resolvedTotal; imports MIN_VERDICTS from
#       batting-average.ts; styles: .bac__mini-dots + .bac__mini-dot[--filled].
#     src/components/BattingAverageHero.astro — cold state: BattingAverageUnlock
#       Progress replaces old inline lock row; TrophyTierLadder replaces inline
#       stats block; hidden .bah-live swap target injected for bah:unlock DOM
#       reveal; imports ba-unlock-progress.ts client script; _lastPayload stash
#       for bah:unlock handler count-up; VerdictPayload interface hoisted;
#       animateCountUp() helper extracted from handleVerdict().
#     src/styles/batting-average.css — .ba-locked--unlocked spring-in keyframe
#       (ba-live-enter opacity 0→1 + translateY 6px→0); reduced-motion guard.
#     src/styles/tokens.css — new tokens: --ba-dot-size/gap/radius/empty/pending/
#       filled/glow; --tier-ladder-dim/active/gap/size.
#     AGENTS.md — BattingAverage unlock ceremony sprint logged.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v108).
#
# Architecture v108 — SealReceipt Standalone Trophy Component (2026-04-13)
#   Sprint: SealReceipt extracted from inlined SealCeremony HTML into a
#     dedicated certificate-grade trophy component. Elevated visual language:
#     hex notary stamp (SVG emboss with gold glow), conviction score bar
#     (fill-animated, gradient gold track), HMAC fingerprint chip (first 8 hex
#     chars), RFC 3161 status row, BattingAverageChip snapshot at moment of
#     seal, author conviction note blockquote (revealed by JS), share CTA with
#     1800ms emotional peak hold (onReceiptPhase in seal-phase-orchestrator.ts),
#     download proof + audit trail secondary actions. Print layout: A4-safe
#     parchment surface, glow-free, share/download hidden. Pure UIX — zero
#     infra changes. DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET,
#     GITHUB_PAT, DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup
#     sequence unchanged (steps 1–8 identical to v107).
#   New files:
#     src/components/SealReceipt.astro — standalone trophy artifact; imports
#       BattingAverageChip (SSR-rendered at moment of seal); static shell —
#       SealCeremony's populateReceipt() fills data-* slots post-seal;
#       data-receipt-share btn triggers Web Share API with clipboard fallback;
#       data-receipt-cta-locked CSS attribute drives 1800ms pointer-events lock.
#     src/styles/seal-receipt.css — single-source-of-truth styles; receipt-unfurl
#       drift-tier (600ms ease-out) entry animation; sr-bar-fill gradient transition;
#       sr-share-btn gold fill with hover lift + 1800ms locked opacity 0.35;
#       print @media: parchment white, no glow, share/download hidden; reduced-
#       motion guard: animation + transitions cancelled.
#   Modified files:
#     src/components/SealCeremony.astro — imports SealReceipt; receipt phase
#       uses <SealReceipt slug title authorSlug> instead of 2380-byte inlined block;
#       onReceiptPhase(receipt) called at both receipt entry points (conviction
#       hold-to-seal + self-seal triggerReceiptBloom path); populateReceipt()
#       refactored: fmtSealDate() (ISO with time + UTC zone), setReceiptMeta()
#       (date/fingerprint/score-fill/note/anchor), setScoreFill(), setReceiptNote(),
#       setAnchorRow() — single-responsibility helpers replace monolith block.
#     src/lib/client/seal-phase-orchestrator.ts — onReceiptPhase(el) exported;
#       lockShareCta() sets data-receipt-cta-locked on [data-receipt-share] btn
#       then clears after RECEIPT_CTA_HOLD_MS = 1800ms; CSS drives pointer-events
#       + opacity; Tanya §6.3 Phase 4 emotional-peak-hold spec.
#     AGENTS.md — Receipt phase section added: SealReceipt arch summary, data-*
#       slot contract, credits (Mike Koch hex emboss spec, Tanya §6.3 layout).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#
# Architecture v107 — SealCeremony Consolidation Phase 2 (2026-04-13)
#   Sprint: ConvictionSeal, ConvictionSealCeremony, ConvictionSealDisplay, and
#     SealReceipt all deleted and inlined into the unified SealCeremony component.
#     SealCeremony now drives both self-seal (variant="self", post page) and
#     conviction sealing (variant="conviction", /admin). Sealed display branch is
#     zero-JS / CSS-only; DB orchestration stays in the caller page.
#     admin.astro wired to SealCeremony variant="conviction" with sealEntry +
#     convictionStage props; deriveConvictionStage() helper resolves dispute state.
#     blog/[slug].astro simplified: single <SealCeremony> replaces conditional
#     ConvictionSeal / SealCeremony pair. seal-ceremony.css fully migrated to
#     string [data-phase] selectors; nav.css border-bottom shadow tightened;
#     tokens.css additions. Pure UIX — zero infra changes.
#   Deleted files:
#     src/components/ConvictionSeal.astro — merged into SealCeremony sealed branch
#     src/components/ConvictionSealCeremony.astro — merged into SealCeremony
#     src/components/ConvictionSealDisplay.astro — merged into SealCeremony
#     src/components/SealReceipt.astro — merged into SealCeremony receipt phase
#   Modified files:
#     src/components/SealCeremony.astro — unified component; variant="self"|
#       "conviction"; sealEntry prop drives sealed display; createCeremony()
#       orchestrates conviction hold-to-seal; zero external component deps.
#     src/pages/admin.astro — ConvictionSeal → SealCeremony variant="conviction";
#       getDisputeResolution() + deriveConvictionStage() added; sealEntry +
#       convictionStage threaded through PostStatus type.
#     src/pages/blog/[slug].astro — ConvictionSeal import removed; single
#       <SealCeremony variant="self" sealEntry={…}> replaces dual conditional.
#     src/styles/seal-ceremony.css — new stylesheet centralising all ceremony
#       phase animations; @keyframes seal-lock-snap, seal-receipt-bloom,
#       seal-gold-arc, seal-hesitation-pulse; reduced-motion guard.
#     src/styles/nav.css — nav border-bottom shadow refined.
#     src/styles/tokens.css — minor token additions.
#     AGENTS.md — WIP section promoted to completed Seal Ceremony entry.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v106).
#
# Architecture v106 — Author Profile Page + ConvictionStrip (2026-04-12)
#   Sprint: Author profile page fully overhauled around the batting-average
#     killer feature; ConvictionStrip Zone 1.5 surfaces site-wide track record
#     to first-time visitors. CSS `rgba(var())` anti-patterns eliminated across
#     PostBadge, RevivalBadge, and BaseLayout (P0 token compliance fixes).
#     Nav rationalized to 3 primary links (posts · verdict · leaderboard);
#     community + now demoted to overflow pill + footer. Pure UIX — zero infra
#     changes.
#   New files:
#     src/components/AuthorProfileHero.astro — animated SVG batting-average
#       gauge (0 → pct% RAF arc, frame-scheduler IMMEDIATE bucket); tier badge
#       (bronze/silver/gold/diamond); win/loss/pending tally chips; locked state
#       (< MIN_VERDICTS) with motivational copy; fully token-driven.
#     src/components/AuthorConvictionTimeline.astro — chronological sealed-
#       conviction log with verdict outcome icons, score, dates; E2 hover lift;
#       pagination (page/totalPages props); empty state copy; Intl.DateTimeFormat
#       formatting; no DB access (receives slice from page orchestrator).
#     src/components/ConvictionStrip.astro — Zone 1.5 compact strip between
#       LandingHero and river feed; cold state (< MIN_VERDICTS) with locked-icon
#       explanation; live state with fill bar + percentage + tally + link to full
#       author record; --shadow-conviction-strip elevation; static bar width via
#       inline CSS custom property (no RAF — gauge animation lives in Hero).
#     src/styles/author-profile.css — single-source-of-truth stylesheet for
#       /author/[slug] layout: hero section, gauge SVG, tier badge, tally chips,
#       timeline table, pagination controls; zero raw hex/rgba — fully token-driven;
#       prefers-reduced-motion guard cancels gauge animation.
#   Modified files:
#     src/pages/author/[slug].astro — full rewrite as AuthorProfileHero +
#       AuthorConvictionTimeline orchestrator; getBattingAverageResult() replaces
#       getAuthorStats(); newest-first pagination (PAGE_SIZE=20, ?p=N); 404
#       redirect for unknown slugs; SSR required (prerender=false).
#     src/components/PostBadge.astro — rgba(var(--mood-accent-rgb)) pattern
#       eliminated; background/border/box-shadow all migrated to
#       color-mix(in oklch, var(--mood-accent) N%, transparent).
#     src/components/RevivalBadge.astro — rgba(var(--mood-accent-rgb)) →
#       color-mix(in oklch, var(--mood-accent) 40%, transparent).
#     src/layouts/BaseLayout.astro — body::before gradient migrated from
#       var(--mood-accent-glow, rgba()) to color-mix(in oklch, var(--mood-accent)
#       4%, transparent); footer expanded from single "write" link to five-link
#       <nav> (write · now · community · RSS · API); .site-footer__write →
#       .site-footer__links + .site-footer__link.
#     src/components/SiteNav.astro — nav primary links rationalized to posts ·
#       verdict · leaderboard (3 max per Tanya §9.1); community + now demoted to
#       overflow pill dropdown + footer; isOverflowActive updated.
#     src/styles/tokens.css — --shadow-conviction-strip: 0 1px 0 var(--gold-border)
#       + 0 8px 24px oklch(0.78 0.15 85 / 0.06) (E1-class, conviction-tinted,
#       Tanya §8 gold hairline communicates earned status).
#     AGENTS.md — Author Profile + ConvictionStrip logged under Completed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v105).
#
# Architecture v105 — Seal Ceremony Component Consolidation Phase 1 (2026-04-12)
#   Sprint: Phase unification refactor — seal state machine migrated from mixed
#     numeric/string union (0|1|2|3|'notarize'|4) to clean string union
#     ('compose'|'confirm'|'anchor'|'receipt'). CSS selectors now target
#     [data-phase="string"] directly — zero lookup table needed. Compose-layer
#     micro-events (hover/press/release) demoted to dedicated callbacks that
#     fire without changing SealPhase, driving arc animation and haptics only.
#   Modified files:
#     src/lib/seal-phases.ts — SealPhase type → string union
#       ('compose'|'confirm'|'anchor'|'receipt'); SealEvent streamlined to
#       CONFIRM / SIGN / RECEIPT / BACK / ERROR; transition() logic simplified;
#       NOTARIZE constant and numeric cases removed; phase-map comment added.
#     src/lib/seal-ceremony.ts — NOTARIZE import removed; CeremonyCallbacks
#       gains onHover/onUnhover/onPress/onRelease for compose-layer micro-events;
#       conviction variant phase flow documented (compose → anchor → receipt);
#       notarize as sub-state of anchor clarified in header.
#     src/styles/seal-ceremony.css — all numeric [data-seal-phase="N"] selectors
#       replaced with string [data-phase="phase-name"]; four missing @keyframes
#       added (seal-lock-snap, seal-receipt-bloom, seal-gold-arc,
#       seal-hesitation-pulse); reduced-motion guard tightened to
#       animation-duration: 0.01ms !important on all ceremony children.
#     src/components/ConvictionSealCeremony.astro — adapted to new string phase
#       API; initial attribute changed from data-seal-phase="0" to
#       data-phase="compose"; notarize sub-state bridged via data-seal-phase.
#     src/components/SealCeremony.astro — variant="self"|"conviction" prop
#       added; aria-live="polite" on ceremony root for screen reader support.
#     src/components/DecayCard.astro — .cover-wrap radius fixed (20px →
#       var(--radius-card)); sepia filter added to decay chain; post-excerpt
#       font-size tokenized (0.88rem → var(--text-sm)).
#     src/styles/nav.css — nav shadow added (1px border-bottom + drop shadow).
#     AGENTS.md — Phase 2 goals documented (ConvictionSealCeremony /
#       ConvictionSeal / ConvictionSealDisplay / SealReceipt → unified
#       SealCeremony; nav rationalization to 3 links max).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v104).
#
# Architecture v104 — Seal Phase Orchestrator: Score Tier System (2026-04-12)
#   Sprint: Conviction Seal Ceremony gains a full score-tier sensory layer —
#     coordinated sound/haptic/label/animation pipeline wired to every dot
#     selection. Zero new infrastructure; pure UIX polish pass on the seal flow.
#   New files:
#     src/lib/client/seal-phase-orchestrator.ts — MutationObserver-based side-
#       effect coordinator; onScoreChange() fires tier label update, CSS attr
#       write (data-seal-score-tier), score sound (playScoreSelect), haptic
#       (hapticForEvent('PRESS')), and 400ms hesitation beat (CTA lock via
#       data-hesitating + btn.disabled) — all in one place; initOrchestrator()
#       wires phase MutationObserver to reset tier on compose-phase return;
#       returns Unsubscribe for SPA teardown; imports Unsubscribe type from
#       frame-scheduler.ts (no new deps).
#   Modified files:
#     src/components/SealCeremony.astro — imports initOrchestrator + onScoreChange
#       from seal-phase-orchestrator; setupDots() callback now also calls
#       onScoreChange(); initOrchestrator(el) called once per ceremony mount;
#       springFillDot() helper (200ms spring reflow resets on repeat clicks) added
#       and called on every dot click; data-score="5" + data-seal-score-tier="mid"
#       SSR defaults on .seal-ceremony; .sc-score-tier-label <span aria-live="polite">
#       added below dot row; phase shadow escalation (confirm → --shadow-seal-
#       ceremony, receipt → --shadow-e4); score tier border escalation
#       (high → 30% tier-high mix, max → 40% tier-max mix + gold ambient glow);
#       .seal-ceremony transition expanded to also animate border-color (fallback
#       values added for safety); prefers-reduced-motion gains .seal-ceremony rule.
#     src/styles/seal-ceremony.css — CSS variable bridge for score tier colors
#       ([data-seal-score-tier="low|mid|high|max"] → --score-tier-color);
#       .sc-score-tier-label styles (text-2xs, semibold, uppercase, token-color,
#       min-height prevents layout shift); @keyframes dot-spring-fill (scale 1 →
#       1.45 → 0.90 → 1, gold fill/border at peak); .seal-dot.is-spring-filling
#       class applies animation; 6px margin-left gap after 5th dot (tier visual
#       break); @keyframes hesitation-pulse (opacity 0.45 ↔ 0.30); [data-hesitating]
#       [data-compose-cta] wires pulse to CTA during 400ms lock window.
#     src/styles/tokens.css — 3 new token groups: Motion Tier Tokens (snap 120ms /
#       flow 300ms / drift 600ms / ceremony 600ms spring — were undefined, silently
#       falling back); score dot click timing (--motion-duration-dot-click: 200ms);
#       seal score tier colors (low cool-blue, mid warm-amber, high gold-adjacent,
#       max var(--gold)); hesitation beat duration (--seal-hesitation-duration: 400ms).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v103).
#
# Architecture v103 — Nav Overflow Pill & CSS Extraction (2026-04-12)
#   Sprint: Responsive nav overflow pill collapses community · leaderboard · now
#     into a ··· button at ≤768 px. All SiteNav inline styles migrated to a
#     standalone nav.css (single source of truth, design-system compliant).
#     NavOverflowController manages open/close state, ARIA, keyboard navigation
#     (Escape / ArrowDown / ArrowUp), and outside-click dismissal. Active state
#     for the pill computed SSR-side (isOverflowActive). astro:before-swap
#     destroys the controller to prevent listener accumulation across page
#     transitions. Pure UIX — zero infra changes.
#   New files:
#     src/lib/client/nav-overflow.ts — NavOverflowController class; manages
#       open/close toggle, ARIA aria-expanded updates, keyboard navigation
#       (Escape→close, ArrowDown/Up→focus next/prev link), outside-click via
#       capture-phase listener; destroy() removes all listeners (called on
#       astro:before-swap); initNavOverflow() idempotent public entry point.
#     src/styles/nav.css — single source of truth for all nav styles; migrated
#       from SiteNav.astro inline <style> block; overflow pill trigger +
#       dropdown panel styles; 768 px / 640 px responsive breakpoints; zero raw
#       hex/rgba — fully token-driven; prefers-reduced-motion guard.
#   Modified files:
#     src/components/SiteNav.astro — imports nav.css + type PageId from nav lib;
#       overflow pill <button data-nav-overflow-trigger> + <div data-nav-overflow-
#       dropdown> rendered SSR; isOverflowActive computed server-side from
#       OVERFLOW_PAGES constant; inline <style> block replaced by nav.css import;
#       <script> calls initNavOverflow() on DOMContentLoaded (Astro deduplicates).
#     AGENTS.md — Nav overflow pill logged under Recently Completed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v102).
#
# Architecture v102 — RAF Master Frame Scheduler (2026-04-12)
#   Sprint: Consolidates competing animation loops into a single shared RAF via a
#     priority-bucketed master scheduler singleton. HeartbeatOrchestrator migrated
#     from its own RAF loop to FrameScheduler.register() (IMMEDIATE + THROTTLED
#     buckets); epsilon-gated CSS var writes skip no-op frames (|Δintensity|<0.002,
#     |Δfactor|<0.01). Color lerp promoted from IMMEDIATE (60fps) → THROTTLED
#     (8fps), cutting style recalculations from ~60/s → ≤8/s on steady-state
#     reading. RevivalOrchestrator keeps its own RAF for the short hold gesture
#     (~800ms) but replaces its visibilitychange listener with scheduler.onPause().
#     Guardrails: FPS watchdog (rolling 10-frame avg < 30fps → demote IMMEDIATE →
#     THROTTLED, recover after 3s); Battery API saver mode (level < 20% → double
#     all intervals); prefers-reduced-motion skips IMMEDIATE tasks; single
#     visibilitychange listener pause/resumes all tasks; BACKGROUND tasks routed
#     through requestIdleCallback. Pure UIX — zero infra changes.
#   New files:
#     src/lib/client/frame-scheduler.ts — FrameScheduler singleton factory;
#       FramePriority const (IMMEDIATE 16ms / THROTTLED 120ms / LOW 5s /
#       BACKGROUND 60s via rIC); register(id, fn, priority) → Unsubscribe; single
#       RAF tick dispatches all due tasks per priority bucket; FPS watchdog (10-
#       frame rolling avg, 3s recovery window); Battery API watcher (async,
#       degrades gracefully on Safari/Firefox); requestIdleCallback routing for
#       BACKGROUND tasks; onPause(cb) observer for external components; destroy()
#       clears tasks + pauseCbs (used on astro:before-swap).
#     src/components/FrameSchedulerProvider.astro — <head> bootstrap component;
#       sets window.__frameScheduler = scheduler; wires astro:before-swap →
#       destroy() and astro:after-swap → resume() for View Transitions
#       compatibility; must precede any island that registers animation tasks.
#   Modified files:
#     src/layouts/BaseLayout.astro — imports FrameSchedulerProvider; inserts
#       <FrameSchedulerProvider /> in <head> before <style set:html> to guarantee
#       scheduler is ready before any island DOMContentLoaded handler fires.
#     src/lib/client/heartbeat-orchestrator.ts — own RAF loop + own
#       visibilitychange listener removed; start() calls scheduler.register() for
#       two tasks (heartbeat-physics at IMMEDIATE, heartbeat-color at THROTTLED);
#       stop() calls unsubAll(); fossil threshold now unregisters tasks (was:
#       cancel RAF); INTENSITY_EPSILON (0.002) + COLOR_FACTOR_EPSILON (0.01)
#       epsilon gates added to skip no-op CSS var writes.
#     src/lib/client/revival-orchestrator.ts — own visibilitychange listener
#       replaced with scheduler.onPause(() => this.onCancel()); RAF for hold-
#       gesture arc animation unchanged (short-lived, self-cancels on completion).
#     AGENTS.md — Recently Completed section added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v101).
#
# Architecture v101 — Living Landing Hero (2026-04-12)
#   Sprint: Visceral product demo in the first viewport — a synthetic "endangered"
#     post (45 days old, maxDays=100, ~68% decay) breathes, pulses, and decays live
#     via a RAF loop so visitors feel posts are alive before reading a single word.
#     Hold-to-keep (1.2 s pointer-hold) resets demo createdAt and triggers a bloom
#     burst, demonstrating the revival mechanic inline. prefers-reduced-motion:
#     RAF skipped, static SSR snapshot rendered. Pure UIX — zero infra changes.
#   New files:
#     src/components/LandingHero.astro — hero section; SSR-renders initial decay
#       vars (--decay-progress, --hero-pulse-period, --stage-index) + data-stage;
#       mounts BloomParticles; imports landing-hero.ts + landing-hero.css.
#     src/lib/client/landing-hero.ts — RAF bridge; inlines logDecay / stageFor /
#       bpmFor (mirrors decay-engine.ts, no server bundle); pointer-hold timer;
#       idempotent initLandingHero() exported; prefers-reduced-motion guard.
#     src/styles/landing-hero.css — hero layout + decay-driven CSS animations
#       (pulse ring, progress bar, stage label transitions); zero raw hex/rgba —
#       fully token-driven; prefers-reduced-motion cancels all motion.
#   Modified files:
#     src/pages/index.astro — imports decayFactor + LandingHero; computes
#       heroDecay / heroStage SSR-side (HERO_AGE_DAYS=45, HERO_MAX_DAYS=100);
#       <LandingHero> inserted as Zone 1 above the river feed.
#     AGENTS.md — "Recently Shipped" section added; WIP unchanged.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v100).
#
# Architecture v100 — Decay Pulse Orchestrator: HeartbeatOrchestrator (2026-04-12)
#   Sprint: Biological heartbeat waveform system wired to every decay-sensitive
#     element (DecayClock ring + DecayBar) via passive CSS custom property
#     consumption. RAF loop on :root writes --hb-* vars at 60fps; components
#     listen without any direct JS coupling. Three-phase cardiac waveform:
#     Pressure (slow quadratic squeeze) → Thump (spring-shaped peak, 0.45
#     overshoot) → Release (critically-damped exponential). BPM model:
#     72 (fresh) → 55 (fading) → 38 (critical) → 22 (ghost + jitter) → 0
#     (fossil ≥ 0.97, static state written once). OKLCH two-segment lerp:
#     green (fresh) → warm-amber (revival midpoint) → fossil-red, preventing
#     perceptually-grey midpoints. Circuit breaker: RAF suspends on tab-hidden,
#     resumes phase-correct. prefers-reduced-motion: static color, no RAF.
#     Ghost-stage arrhythmic jitter (every 8th beat ±JITTER_BOUND phase nudge).
#     Pure UIX — zero infra changes.
#   New files:
#     src/lib/client/decay-color-lerp.ts — OKLCH two-segment lerp utility;
#       decayFactor 0→1 maps green(145°)→amber(70°)→red(25°); three design-
#       token anchors (FRESH/REVIVAL/FOSSIL) match tokens.css primitives exactly;
#       prevents perceptually-grey midpoint from straight green→red hue travel.
#     src/lib/client/heartbeat-orchestrator.ts — RAF-based CSS var writer;
#       HeartbeatOrchestrator class; writes --hb-intensity/scale/opacity/
#       shadow-alpha/bpm/bar-duration + --hb-color-l/c/h per frame; imports
#       springFrame (existing spring-easing.ts) + decayColorLerp; circuit
#       breaker on visibilitychange; fossil threshold halts RAF; ghost-stage
#       arrhythmic jitter; initHeartbeatOrchestrator() idempotent public API
#       (guards via window.__hbOrchestrator singleton).
#     src/styles/heartbeat.css — keyframes (decay-thump brightness pulse,
#       bar-tremor horizontal shake) + passive consumer classes: .hb-ring-wrap
#       (scale compress on thump), .hb-ring-stroke (OKLCH lerp color),
#       .hb-clock-glow (box-shadow bloom), .hb-ring-opacity (opacity dim/bright),
#       .hb-bar-fill (OKLCH color + thump animation), .hb-bar-glow (ambient
#       shadow), .hb-bar-tremor (ghost/endangered shake); prefers-reduced-motion
#       guard cancels all motion.
#   Modified files:
#     src/components/DecayBar.astro — barStageFor() maps decayFactor to 5-stage
#       enum; data-decay-stage on .decay-bar; 3-layer DOM: fill (.hb-bar-fill),
#       glow (.hb-bar-glow aria-hidden), tremor (.hb-bar-tremor data-decay-stage);
#       .decay-bar gains position:relative + overflow:hidden for layer containment;
#       fill background migrated from legacy oklch(from hsl...) to flat OKLCH
#       literal (FOUC pre-JS fallback matching fresh stage).
#     src/components/DecayClock.astro — data-decay-factor={decayFactor.toFixed(4)}
#       on ring wrapper (enables live sync 1×/min via SSE); .hb-clock-glow on
#       container; .hb-ring-wrap on SVG; .hb-ring-stroke + .hb-ring-opacity on
#       circle; CSS fallback animation selectors scoped to :not(.hb-ring-opacity)
#       (FOUC guard — CSS fires until JS takes over); DOMContentLoaded script
#       imports + calls initHeartbeatOrchestrator() once per page.
#     src/layouts/BaseLayout.astro — heartbeat.css imported as global stylesheet
#       (alongside motion.css, revival-moment.css etc.); Astro deduplicates.
#     src/styles/motion.css — --motion-decay-thump-easing: ease-in-out added
#       (fast peak, slow release — spring-thump shape token for consumers).
#     src/styles/tokens.css — 4 new decay stage semantic tokens: --color-decay-
#       fading (oklch 62% 0.155 95°), --color-decay-endangered (58% 0.195 35°),
#       --color-decay-ghost (52% 0.110 20°), --color-decay-revival (72% 0.160
#       70°); --hb-* default vars (safe zero values, overwritten each RAF);
#       @property typed registrations for --hb-intensity/scale/opacity/shadow-alpha
#       (enable CSS transitions on numeric custom props — Mike §5 spec).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v99).
#
# Architecture v99 — Conviction Ceremony 5.5 Phases + SiteNav Token P0 Fix (2026-04-12)
#   Sprint: SealCeremony wired end-to-end with NotarizeStamp (phase 3.5), gold
#     BloomParticles burst on receipt, sound/haptic at every phase transition,
#     error recovery resets to compose phase. SiteNav raw rgba() violations
#     replaced with design tokens. seal-sound.ts default flipped to ON.
#   Modified files:
#     src/components/SealCeremony.astro — NotarizeStamp mounted at phase 3.5
#       (data-seal-phase="notarize"); runNotarize() async step added between anchor
#       and receipt; playForPhase() dispatches sound+haptic per phase (LOCK →
#       NOTARIZE → RECEIPT); triggerReceiptBloom() adds/removes .blooming-receipt
#       on .seal-ceremony for gold particle burst; showError() resets to compose
#       phase so user can retry; populateStamp() fills [data-ns-*] els; IIFE
#       imports initSealSound / playSealLock / playNotarizeChime / playReceiptReveal
#       / playSealError; BloomParticles variant="receipt" inside .sc-phase--receipt;
#       .sc-phase--notarize display rule + sc-phase-in animation added.
#     src/components/BloomParticles.astro — variant prop ('revival' | 'receipt',
#       default 'revival'); .bloom-particles--receipt bottom/right 50% anchors
#       ceremony center; receipt CSS block fires when .seal-ceremony.blooming-receipt
#       is set (bloom-fly + bloom-ring-expand + bloom-warm-breath); zero infra change.
#     src/components/SiteNav.astro — 5 raw rgba() violations replaced with token
#       refs (--surface-overlay, --border-subtle, --text-primary, --text-tertiary,
#       --text-secondary); nav-accent gradient/shadow updated (color-mix pattern).
#     src/lib/client/seal-sound.ts — sound enabled by default (was opt-in);
#       localStorage key still respected for user override.
#     src/styles/seal-ceremony.css — heartbeat @keyframes (sc-heartbeat) added for
#       anchor + notarize phase pulse; grain ramp on notarize panel.
#     src/styles/tokens.css — --surface-inset + --surface-inset-deep added; any
#       additional token additions for ceremony glass surface or nav backdrop.
#     AGENTS.md — WIP updated; recently-completed section added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v98).
#
# Architecture v98 — ConvictionSeal Component Split + CSS Token Compliance (2026-04-12)
#   Sprint: ConvictionSeal.astro (844 LOC) decomposed into three single-responsibility
#     components; 47 CSS token violations eliminated across 10 style files; 5 missing
#     design tokens added. Strict DB-logic boundary enforced: orchestrator owns all
#     data access, children receive only fully-derived props. Pure UIX — zero infra
#     changes; lint:tokens now reports 0 violations.
#   New files:
#     src/components/ConvictionSealDisplay.astro — sealed conviction hero; zero
#       JavaScript; all visual state is CSS-only (no client hydration); receives
#       fully-derived props from ConvictionSeal.astro orchestrator; renders score,
#       note, shortHash, sealedAt, clock, tension badge, trust badge, meta row;
#       uses --surface-sealed/--border-sealed/--note-italic-color/--gold-hover/
#       --gold-deep design tokens exclusively.
#     src/components/ConvictionSealCeremony.astro — 5-phase interactive ceremony form
#       (phases 0→4) + verbatim client IIFE; CSS data-seal-phase state machine drives
#       all animations; progressive enhancement — plain <form> fallback without JS;
#       imports NotarizeStamp/SealReceipt/SealSoundToggle/ShareSealButton; receives
#       slug, title, context from orchestrator only; zero DB access.
#   Modified files:
#     src/components/ConvictionSeal.astro — rewritten as thin orchestrator (~55 LOC);
#       imports ConvictionSealDisplay + ConvictionSealCeremony; DB calls
#       (getSealEntry / getDisputeResolution) + deriveConvictionStage() live here only
#       (rule: never moved to children); dispatches sealed → Display, !sealed →
#       Ceremony; sealTimestamp ISO prop added for <time datetime> parity.
#     src/styles/tokens.css — 5 new seal surface tokens: --surface-sealed,
#       --border-sealed, --note-italic-color, --gold-hover, --gold-deep; all values
#       are OKLCH — zero raw hex added.
#     src/styles/atmosphere.css — 15 raw-value violations → token references.
#     src/styles/seal-ceremony.css — 8 violations → token references.
#     src/styles/conviction-live.css — 3 violations → token references.
#     src/styles/death-clock.css — 7 violations → token references.
#     src/styles/leaderboard.css — 6 violations → token references.
#     src/styles/motion.css — 2 violations → token references.
#     src/styles/decay.css — 2 violations → token references.
#     src/styles/batting-average.css — 2 violations → token references.
#     src/styles/community.css — 1 violation → token reference.
#     src/styles/ghost-echoes.css — 1 violation → token reference.
#     AGENTS.md — recent completions updated; 0 token violations confirmed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v97).
#
# Architecture v97 — Seal Ceremony Sensory Layer: Sound + Haptic (2026-04-12)
#   Sprint: Opt-in audio + haptic feedback for the Conviction Seal Ceremony.
#     WebAudio synthesiser (zero asset files, zero network requests) fires on
#     every meaningful ceremony moment; Vibration API pulses match the same
#     event taxonomy; SealSoundToggle button lets the author enable/disable
#     sound with preference persisted to localStorage. Both layers are pure
#     progressive enhancement — silent on desktop / iOS Safari / when
#     prefers-reduced-motion is set. Pure UIX — zero infra changes.
#   New files:
#     src/lib/client/seal-sound.ts — WebAudio synthesiser; zero audio assets;
#       all sound synthesised from oscillators + white-noise bursts; autoplay
#       policy satisfied via initSealSound() on first pointerdown; preference
#       stored in localStorage ('conviction-arena:seal-sound-enabled');
#       public API: initSealSound, isSoundEnabled, setSoundEnabled,
#       playScoreSelect(score 1-10), playSealPress, playSealLock,
#       playNotarizeChime, playReceiptReveal, playSealError; MAX_GAIN=0.15
#       (intentionally quiet — author opted in, not the audience).
#     src/lib/client/seal-haptic.ts — Vibration API wrapper keyed to SealEvent;
#       reuses haptics.ts infrastructure; PATTERNS map per event (PRESS/LOCK/
#       NOTARIZE/RECEIPT/ERROR); prefers-reduced-motion gated; silent on
#       desktop/iOS Safari; no-ops when pattern unregistered.
#     src/components/SealSoundToggle.astro — toggle button; reads/persists
#       isSoundEnabled() via seal-sound.ts; sound-off/on SVG icon swap;
#       aria-pressed state; hides itself at phase 4 (seal complete, irrelevant);
#       @starting-style fade-in entrance (300ms delay); fully token-driven.
#     src/styles/seal-sound-toggle.css — token-only toggle styles (zero raw
#       values); entry animation; focus-visible ring; hidden at data-seal-phase
#       4/notarize via opacity+pointer-events.
#   Modified files:
#     src/components/ConvictionSeal.astro — imports SealSoundToggle + all
#       seal-sound + seal-haptic functions; <SealSoundToggle> embedded inside
#       .cs-form-header (absolutely positioned top-right); .cs-form-header gains
#       position:relative + .cs-sound-toggle-wrap positioning wrapper;
#       container pointerdown → initSealSound (once); onPhase wired to
#       playSealPress/playSealLock/playReceiptReveal + matching hapticForEvent;
#       onNotarize expanded to also call playNotarizeChime + hapticForEvent;
#       onError also calls playSealError + hapticForEvent; score dot click calls
#       playScoreSelect(val).
#     src/styles/dispute.css — UIX polish: .dispute-state-badge base transition
#       gains border-radius + box-shadow; [data-status="contested"] gets
#       border-radius:pill + shadow-card-disputed with matching transitions
#       (Tanya §1: shape+shadow signal "alive, under scrutiny").
#     src/styles/tokens.css — three new token groups:
#       --surface-glass (rgba 12,12,14/0.82 — ceremony glass surface for
#         SealCeremony overlay + VerdictReveal; companion backdrop-filter in
#         seal-ceremony.css);
#       dispute semantic aliases (--dispute-open/contested/upheld/overturned
#         pointing at existing --color-dispute-* tokens — zero new hex);
#       sound toggle tokens (--seal-sound-toggle-color-off: var(--text-ghost),
#         --seal-sound-toggle-color-on: var(--text-secondary)).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v96).
#
# Architecture v96 — Revival Ceremony: Full Phase Choreography (2026-04-12)
#   Sprint: Full phase state machine for the KeepButton ceremony. RevivalMoment
#     becomes the orchestrator: idle → pressing → blooming → ticking → complete
#     (any → error → idle on failure). The IIFE in RevivalMoment.astro owns all
#     phase transitions; CSS in revival-moment.css drives every animation off
#     data-phase. Double-tap guard (clicks no-op outside idle), aria-busy on
#     button during API flight, atmosphereHint → body[data-atmosphere="risen"]
#     on safe revival. BloomParticles gains 14 polar particles (up from 6) with
#     --angle CSS var and spring easing. RevivalCounter migrated to --font-mono
#     + full token compliance + data-ticking hook. KeepButton raw color literals
#     replaced with tokens. Pure UIX — zero infra changes.
#   New files:
#     (none)
#   Modified files:
#     src/pages/api/revive.ts — added nowSafe (bool: was endangered, now isn't)
#       + atmosphereHint ('risen' | null) to JSON response; decayBeforeRevival
#       computed via count-1 for cross-zone detection; backward-compatible.
#     src/styles/revival-moment.css — full rewrite: data-phase state machine CSS
#       (idle/pressing/blooming/ticking/complete/error), spring keyframes, token-
#       compliant; sympathetic bloom for SSE cross-reader revival; reduced-motion
#       guard; zero hardcoded hex/rgba.
#     src/components/RevivalMoment.astro — IIFE phase machine replaces old
#       revivalMomentScript() import; data-phase="idle" on wrapper; orchestrated
#       flag gates KeepButton's own wireKeepButtons(); tickCounter() adds
#       data-ticking on [data-revival-count-display]; witness badge copy adapts
#       to decayPct urgency; atmosphereHint sets body[data-atmosphere]; SSE
#       sympathetic bloom on revival event.
#     src/components/BloomParticles.astro — 14 polar particles (up from 6),
#       --angle CSS custom property per particle for spread animation, spring
#       easing on particle trajectories; zero DOM access at module scope.
#     src/components/RevivalCounter.astro — font-family: var(--font-mono) for
#       numeric gravitas; all raw literals → token references (--text-sm/xl/xs,
#       --weight-bold/normal, --space-1/2/4, --tracking-tight/wide, --text-
#       secondary/disabled, color-mix(var(--mood-accent))); data-ticking attr
#       integration with revival-moment.css spring tick animation.
#     src/components/KeepButton.astro — raw rgba/hex literals replaced with
#       tokens: border-color on critical → color-mix(var(--clr-red-500)…);
#       still-true box-shadow → color-mix(var(--gold)…); pulse-ring keyframes
#       → color-mix; font-size literals → var(--text-sm/xs); transition literals
#       → var(--motion-flow-*); gold stroke fallback removed (token always defined).
#     src/styles/keep-button.css — 5 token violations fixed: rgba(255,80,40)
#       → color-mix(var(--clr-red-500)…), rgba(200,160,60) → color-mix(var(--gold)…),
#       0.85rem → var(--text-sm), 0.72rem → var(--text-xs), transition literals
#       → var(--motion-flow-*).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v95).
#
# Architecture v95 — BattingAverageChip Count-Up Ceremony + Post Author Context (2026-04-12)
#   Sprint: UIX polish — BattingAverageChip gains a full client ceremony layer
#     (count-up entrance, tier-crossing flash, live SSE binding) and moves from
#     feed cards onto the post detail page as an inline author-trust signal.
#     DecayCard loses the chip (cognitive-load reduction per Tanya §4.2);
#     blog/[slug].astro gains a post-author-row (name link + inline chip).
#     Pure UIX — zero infra changes.
#   New files:
#     src/lib/client/batting-average-chip.ts — client ceremony layer; module
#       singleton IntersectionObserver drives count-up (0%→final at 50% viewport
#       entry, 1200ms spring-eased ticker); tier-crossing flash adds .bac--tier-flash
#       for a 3-frame brightness burst (500ms deliberate-weight) on boundary cross;
#       live SSE: subscribes to verdict:declared on window.__heartbeat EventSource
#       and animates all [data-bac-slug=X] chips to the new score in real time;
#       prefers-reduced-motion snaps to final value, zero animation; zero DOM access
#       at module scope (DOMContentLoaded-deferred).
#   Modified files:
#     src/components/BattingAverageChip.astro — extended size scale: 'inline'
#       (11px, 1px 5px padding, dense prose embedding), 'chip' alias for 'sm',
#       'hero' (32px min-height, nav/author-header use); 'live' prop (boolean,
#       default false) adds data-bac-live for SSE binding; 'class' prop for layout
#       passthrough; data-score (SSR source of truth for JS count-up) and
#       data-live-pct on .bac__pct (animation target); client <script> imports
#       batting-average-chip.ts (Astro deduplicates across N chip instances);
#       hover lift: translateY(-1px) — elevation not scale (Tanya §6.3); gold-tier
#       inner glow (inset 0 0 8px --ba-chip-gold-glow), diamond cold shimmer;
#       gold hover adds outer 4px 12px glow; prefers-reduced-motion: transform none.
#     src/components/DecayCard.astro — BattingAverageChip removed from card and
#       .card-author-row CSS removed; authorSlug prop dropped (Tanya §4.2: batting
#       average on feed card = cognitive overload; reputation lives on author page).
#     src/pages/blog/[slug].astro — post-author-row injected below <h1>: author
#       name as /author/[slug] link + BattingAverageChip at size="inline";
#       totalPublished pre-fetched once (getCollection) and threaded to chip to
#       avoid duplicate content-collection scans; .post-author-row + .post-author-link
#       token-driven styles added (Tanya §5.2: trust connection must not be hidden).
#     src/styles/batting-average-chip.css — inline/chip/hero size variants added;
#       tier-crossing flash: .bac--tier-flash + @keyframes bac-tier-flash (3-frame
#       brightness burst); @starting-style entrance for non-JS static contexts
#       (Baseline 2025; badge-enter @keyframes fallback for Safari <17.5);
#       hover transition removed from .bac--live:hover rule (now owned by
#       component <style> for better cascade isolation); prefers-reduced-motion
#       guard extended to cover .bac--tier-flash (animation+filter both cancelled).
#     src/styles/tokens.css — --ba-tier-bronze recalibrated to oklch(68% 0.13 55deg)
#       warm amber-bronze (Tanya §1.2 skin-in-game warmth); remaining diff may
#       include additional ba-chip glow tokens (--ba-chip-gold-glow,
#       --ba-chip-gold-hover-glow, --ba-chip-diamond-glow).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v94).
#
# Architecture v94 — Design Token Compliance Pass (2026-04-12)
#   Sprint: Full design-system token compliance enforcement. All raw hex, rgba(),
#     hsl() and bare-rem font-size literals eliminated from component stylesheets;
#     every value now routes through tokens.css as the single source of truth.
#     New dev-side linting tool (scripts/check-token-compliance.ts + lint:tokens
#     npm script) enforces the constraint going forward. Pure UIX — zero infra
#     changes.
#   New files:
#     scripts/check-token-compliance.ts — design token compliance linter; scans
#       src/styles/*.css for raw hex (#xxx), rgba()/rgb(), hsla()/hsl(), and bare
#       rem on font-size declarations; skips tokens.css (primitives live there by
#       design); allows oklch(), color-mix(), calc(), and rem in layout properties;
#       clamp() rem exemption for responsive typography; exit 0 = clean, exit 1 =
#       violations; run via `npm run lint:tokens` (npx tsx).
#   Modified files:
#     package.json — `lint:tokens` script added: `npx tsx scripts/check-token-compliance.ts`.
#     src/styles/tokens.css — four new token groups:
#       --gold-mid (fills gap between gold-dim and border-focus — river-now hairline);
#       --mood-accent: oklch(72% 0.09 55) (warm amber — restores dead token used as
#         fallback across SiteNav, revival.css, ambient.css, endangered.css);
#       river component tokens: --river-card-surface, --river-filter-bg,
#         --river-filter-border, --river-meta-color (prevent per-rule invention);
#       Tailwind v4 bridge anchors: --background, --foreground, --muted,
#         --muted-foreground, --border, --ring (referenced by global.css @theme);
#       --notarize-shadow rgba(0,0,0,0.40) → oklch(0 0 0 / 0.40).
#     src/styles/global.css — @theme block migrated: all raw values replaced with
#       token references (--color-surface → var(--surface-raised),
#       --color-gold → var(--clr-gold-400), --color-revival → var(--clr-amber-400),
#       --font-family-* → var(--font-*), --radius-* → var(--radius-*));
#       new page-level anchors: --color-background/foreground/muted/border.
#     src/components/SiteNav.astro — raw literals migrated:
#       rgba(255,255,255,0.75) → var(--text-secondary);
#       #F5A623 → var(--gold); rgba(245,166,35,0.55) → var(--gold-dim);
#       var(--mood-accent, #D4956A) fallback removed (token now defined);
#       nav-accent gradient/shadow migrated from rgba(--mood-accent-rgb) to
#       color-mix(in oklch, var(--mood-accent) N%, transparent).
#     src/styles/revival.css — raw values replaced with --mood-accent + tokens.
#     src/styles/ambient.css — raw values replaced with --mood-accent + tokens.
#     src/styles/endangered.css — raw values replaced with design tokens.
#     src/styles/river.css — raw values replaced with --river-* component tokens.
#     src/styles/verdict.css — raw values replaced with design tokens.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v93).
#
# Architecture v93 — Crowd Verdict Ceremony (2026-04-12)
#   Sprint: Post-vote emotional payoff — after casting a stance, StickyStanceBar
#     now plays a 650ms ceremony: bar transitions at CEREMONY speed, voted segment
#     pulses with a brightness/saturation glow, voted chip replaces vote buttons,
#     and a crowd-verdict copy panel fades in at t=500ms classifying the user's
#     position among all stancers (lone voice / minority / torn house / with many /
#     majority / near-unanimous). Pure UIX — zero infra changes.
#   New files:
#     src/lib/crowd-verdict.ts — pure function crowd-verdict classifier; no DOM,
#       no side effects, SSR-safe; CrowdPosition (6 states), CrowdVerdict interface,
#       getCrowdVerdict(stance, dist) public API; mirrors the inline classifier
#       inlined in StickyStanceBar (Astro island bundler boundary constraint);
#       single source of copy truth for any future SSR/audit consumers.
#   Modified files:
#     src/components/StickyStanceBar.astro — crowd verdict ceremony choreography:
#       ssb-bar gains id="ssb-bar" for JS targeting; new ssb-verdict panel
#       (ssb-verdict-copy + ssb-verdict-sub) hidden until ceremony t=500ms;
#       postStance() returns PostResult { success, dist } (was boolean);
#       revealVotedState() orchestrates 650ms ceremony sequence
#       (setCeremonySpeed → updateBar → pulseVotedSeg@100ms →
#        showVotedChip@400ms → showVerdict@500ms → revertToFlowSpeed@650ms);
#       --ssb-seg-duration CSS custom property on #ssb-bar switches between
#       CEREMONY and FLOW transition speeds for that single animation beat;
#       seg-voted-pulse @keyframes (brightness/saturate glow, forwards fill);
#       .ssb-verdict / .ssb-verdict-copy / .ssb-verdict-sub token-driven styles;
#       crowd classifier inlined for island bundler boundary (mirrors crowd-verdict.ts).
#     src/pages/api/stance.ts — POST response now returns dist alongside ok and
#       tensionScore; StickyStanceBar reads dist from the vote response directly
#       (no separate fetch needed); backward-compatible (additive change only).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v92).
#
# Architecture v92 — StickyStanceBar + Stance Design Token Polish (2026-04-12)
#   Sprint: Sticky stance bar ships end-to-end; stance timer tokenised; dispute
#     hold time raised for accidental-tap prevention; SSE tension:updated event
#     extended with dist payload for live bar updates. Pure UIX — zero infra changes.
#   New files:
#     src/components/StickyStanceBar.astro — position:fixed bottom overlay;
#       surfaces once at 50% read depth via IntersectionObserver sentinel;
#       live agree/torn/disagree fill bar via SSE tension:updated + dist payload;
#       inline vote buttons on desktop (≥640 px), stance:prompt CustomEvent
#       dispatch on mobile (≤639 px, opens StanceDrawer); voted chip hides buttons
#       after submission; session-dismiss guard (sessionStorage key per slug);
#       fully token-driven; prefers-reduced-motion guard; aria-live="polite"
#       on bar labels.
#   Modified files:
#     src/pages/blog/[slug].astro — imports StickyStanceBar; renders
#       <StickyStanceBar slug dist /> between StanceDrawer and erosion-bar script;
#       stanceDist ?? zero-dist fallback passed as initial prop.
#     src/pages/api/stance.ts — broadcastNamed('tension:updated', ...) now
#       includes dist (agree/torn/disagree counts) alongside existing tensionScore
#       fields; StickyStanceBar client script uses dist to update bar widths live
#       without a separate fetch; backward-compatible (adds fields, changes none).
#     src/components/StanceDrawer.astro — stance progress bar background migrated
#       from hardcoded oklch literal to var(--stance-timer-color) design token;
#       zero visual change — purely source-of-truth consolidation.
#     src/components/DisputeChallenge.astro — HOLD_MS raised 800→2000 ms;
#       prevents accidental dispute triggers on tap-heavy mobile devices
#       (Tanya §7 anti-fat-finger mandate).
#     src/styles/tokens.css — --stance-timer-color: oklch(62% 0.14 185 / 0.4)
#       added (teal; patience belongs to the reader — Tanya §3).
#     AGENTS.md — Sticky stance bar logged under Recently Shipped; WIP cleared.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. In-process cron runner (v82) continues
#     to own ongoing scheduling. deploy.sh startup sequence unchanged
#     (steps 1–8 identical to v91).
#
# Architecture v91 — Shadow Elevation System + Cold-Start Ghost Timeline (2026-04-12)
#   Sprint: Pure UIX polish — spatial depth system (E1–E4 shadows) wired end-to-end;
#     TrajectoryBlock.astro cold-state fully redesigned around anticipation + clarity.
#   Modified files:
#     src/styles/tokens.css — --shadow-e1/e2/e3/e4 four-level elevation token set;
#       E1 resting (feed cards/chips), E2 interactive hover (card lift),
#       E3 raised (SealCeremony panels, overlays), E4 ceremony-only (seal confirm +
#       receipt gold ambient ring); OKLCH palette, zero hardcoded hex; compose with
#       existing decay/age shadows.
#     src/styles/card-base.css — .card-e3 / .card-e4 modifier classes added;
#       E4 hover transform suppressed (ceremony surfaces don't lift — Tanya §1);
#       fixes pre-existing bug where --shadow-e3 was referenced in SealCeremony
#       and seal-ceremony.css but never defined in the token file.
#     src/components/TrajectoryBlock.astro — cold-state completely redesigned per
#       Tanya §3 anticipation spec; 3-row ghost timeline (blurred illustrative rows,
#       shimmer animation, aria-hidden/role=presentation); floating CTA card with
#       E3 shadow, gold border, stamp SVG icon, conviction copy, gold CTA button;
#       ghost caption "Records shown are illustrative only"; CTA headline + body +
#       href adapt based on sealedCount (0 → "Seal your first conviction" / else
#       → "Await your first verdict").
#     AGENTS.md — Shadow E1–E4 + cold-state ghost timeline logged as completed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO,
#     HMAC_SECRET all unchanged. In-process cron runner (v82) continues to own
#     ongoing scheduling. deploy.sh startup sequence unchanged (steps 1–8 identical
#     to v90).
#
# Architecture v90 — Self-Service Conviction Seal (2026-04-12)
#   Sprint: Authors can now seal their own posts without needing ADMIN_SECRET.
#     A single-use HMAC capability token (15-min TTL) is issued via
#     POST /api/author-token and consumed by POST /api/seal-self.
#     Blog post pages now show SealCeremony.astro (4-phase ceremony) when
#     the post is unsealed — no admin gate needed. API parity maintained:
#     seal-self response mirrors conviction-seal shape exactly.
#   New files:
#     src/lib/author-token.ts — HMAC capability token library; issueToken(),
#       validateAndConsume(); stores token_hash + expiry in author_tokens
#       table (auto-created in revivals.db on first run); single-use
#       replay prevention via used_at column; HMAC_SECRET env var (required).
#     src/pages/api/author-token.ts — POST /api/author-token; issues 15-min
#       single-use token for given authorSlug + postSlug pair; validates post
#       exists in content collection; returns { token, expiresAt }.
#     src/pages/api/seal-self.ts — POST /api/seal-self; validates & consumes
#       token via validateAndConsume(); seals conviction via sealConviction();
#       runs anchor + RFC3161/OTS stamp side-effects (fail-open); broadcasts
#       conviction:sealed SSE event; response identical to conviction-seal.
#     src/components/SealCeremony.astro — 4-phase self-service seal ceremony
#       component for blog post pages (replaces unsealed ConvictionSeal state).
#   Modified files:
#     src/pages/blog/[slug].astro — unsealed posts now render SealCeremony
#       instead of ConvictionSeal; sealed posts continue to render ConvictionSeal.
#     src/styles/seal-ceremony.css — bloom/receipt animation additions for
#       SealCeremony component; mobile phase-3 modal additions from v88.
#     AGENTS.md — Self-Service Seal shipped; HMAC_SECRET marked required.
#   Infrastructure: NEW required env var HMAC_SECRET.
#     author_tokens table auto-created in revivals.db (SQLITE_VOLUME) on first
#     run — no manual migration needed. No new services, volumes, or packages.
#     ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO unchanged.
#     deploy.sh: HMAC_SECRET now read from .env and passed to container
#     (steps 1–8 identical to v89; only docker run gains --env HMAC_SECRET).
#
# Architecture v89 — Card Base Design System Unification (2026-04-12)
#   Sprint: Shared card geometry extracted into a single-source-of-truth
#     src/styles/card-base.css stylesheet. All card shells now compose via
#     class="card-base <modifier>" and scope only component-specific overrides
#     in their own <style> blocks. Hardcoded hex/px/rgba values replaced with
#     design tokens across VerdictCard and TombstoneCard. Three new shadow tokens
#     and --space-7 added to the token system. Pure UIX — zero infra changes.
#   New files:
#     src/styles/card-base.css — card shell geometry system; .card-base (base),
#       .card-fresh/.card-aged/.card-fossil (age variants), .card-verdict (deep
#       surface + left accent stripe + neutral hover shadow), .card-disputed
#       (red-cast shadow), .card-tomb (tombstone radius + no hover lift);
#       every value references a token — zero hardcoded hex/px/rgba; imported
#       by global.css after tokens.css and motion.css.
#   Modified files:
#     src/components/EndangeredCard.astro — adds card-base class to article.
#     src/components/TombstoneCard.astro — adds card-base + card-tomb classes;
#       migrates gap/padding/margin to --space-* tokens; removes duplicated
#       border/border-radius/box-shadow/padding rules now owned by card-base.css.
#     src/components/VerdictCard.astro — adds card-base + card-verdict classes;
#       removes duplicated shell CSS (position, background, border, border-radius,
#       padding, display, gap, hover transform/shadow); migrates all remaining
#       hardcoded values to tokens (--text-*, --weight-*, --leading-*, --tracking-*,
#       --space-*, --transition-*, --border-*, --surface-*); conviction color
#       fallback uses var(--text-tertiary) instead of raw rgba.
#     src/styles/global.css — @import "./card-base.css" added after motion.css.
#     src/styles/tokens.css — --space-7: 1.75rem added; three new shadow tokens:
#       --shadow-card-rest (neutral at-rest), --shadow-elevated (modal/breakout),
#       --shadow-verdict-hover (neutral deep + gold ring — no amber tint).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–8 identical to v88).
#
# Architecture v88 — Decay Engine Sepia/Grain/Factor + Design Token Gap-Fill (2026-04-12)
#   Sprint: Visual polish pass — decay system gains three new CSS vars (sepia,
#     grain, factor) wired consistently across SSR and client paths; design token
#     system gap-filled with stage-specific grain, blur, border, seal-glow,
#     batting-average, erosion-bar, tombstone, and presence-dot tokens;
#     SealReceipt gains a ⬡ notarize watermark; seal-ceremony phase 3 becomes
#     a fixed full-screen modal on narrow viewports. Pure UIX — zero infra changes.
#   Modified files:
#     src/lib/decay-engine.ts — sepiaFromDecay(): 0→0.15 linear (Tanya §4.5);
#       grainFromDecay(): staged 5-band classifier (0/0.04/0.09/0.14/0.18 per
#       Tanya §3); decayCSSVars() extended with --decay-sepia, --decay-grain,
#       --decay-factor; client script IIFE sets all three in live-update loop;
#       DecayCSSVars interface updated; _testDecayEngine() assertions added.
#     src/lib/live-decay.ts — sepia() + grain() private helpers added; patchCard()
#       now sets --decay-sepia, --decay-grain, --decay-factor alongside existing
#       opacity/blur/saturation/shadow vars; client script IIFE updated to match.
#     src/styles/tokens.css — --decay-factor default (0); 4 grain-stage tokens
#       (fading/aged/endangered/fossil); 2 blur-stage tokens; 1 aged border token;
#       5 seal-glow tokens (idle/hover/press/lock/receipt); 3 ba-locked tokens;
#       2 erosion-bar tokens; 3 tombstone tokens; 3 presence-dot tokens.
#     src/styles/seal-ceremony.css — phase 3 lock overlay becomes position:fixed /
#       inset:0 / backdrop-blur modal on max-width:768px (Tanya §2 P0); enlarged
#       lock icon area; cancel button responsive sizing.
#     src/components/SealReceipt.astro — position:relative + overflow:hidden on
#       .sr-root; ::before pseudo adds ⬡ (U+2B21) watermark at bottom-right
#       (font-size 4.5rem, opacity 0.12, rotate −12°, pointer-events none);
#       .sr-root > * { position:relative; z-index:1 } keeps content above mark.
#     AGENTS.md — Recent Polish block updated with all four changes.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–8 identical to v87).
#
# Architecture v87 — Seal Share Card + Phase 5 ShareSealButton (2026-04-12)
#   Sprint: Conviction loop closure — Phase 5 ShareSealButton rises below the
#     SealReceipt after a successful seal; shareable 1200×630 OG conviction card
#     endpoint /api/og/seal/[slug].png wired end-to-end via Satori → resvg pipeline.
#   New files:
#     src/components/ShareSealButton.astro — Phase 5 share card; gold-wash surface;
#       3fr title + 2fr score grid; "Copy share link" (clipboard API, legacyCopy
#       fallback, is-copied pulse, aria-live confirm) + "View sealed receipt" (↗
#       new-tab audit link); @starting-style slide-up entrance (CEREMONY motion
#       200ms delay); fully token-driven; prefers-reduced-motion guard;
#       data-share-card / data-share-score / data-share-copy attribute hooks.
#     src/lib/og/sealLayout.ts — Satori element tree for 1200×630 conviction seal
#       share card; locked amber token set (C constants); eyebrow date, titleBlock,
#       scoreBar (fill-px proportional to score/10), metaBlock (HMAC fingerprint
#       hint + batting-average pct), tagline; SealOGData interface exported;
#       mirrors auditLayout.ts design discipline (Tanya §9 gold discipline).
#     src/pages/api/og/seal/[slug].png.ts — GET /api/og/seal/[slug].png; builds
#       SealOGData from getSealEntry + getBattingAverageResult; renders via
#       renderSealImage(); 1h fresh + 24h stale-while-revalidate Cache-Control;
#       prerender=false; 404 on unknown slug; 500 on render failure.
#   Modified files:
#     src/components/ConvictionSeal.astro — imports ShareSealButton; renders
#       <ShareSealButton slug title /> after <SealReceipt />; populateShareCard()
#       fills [data-share-score] from receipt data.score on onReceipt callback;
#       conviction:sealed CustomEvent dispatched after populateShareCard().
#     src/lib/og/renderOGImage.ts — renderSealImage(data: SealOGData): Promise
#       <Uint8Array> exported (sealLayout → toSVG → toPNG pipeline); SealOGData
#       type re-exported.
#     AGENTS.md — Conviction Loop — Closed section added; WIP item updated to
#       reflect env-var-gating-only status (all code is wired).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–8 identical to v86).
#
# Architecture v86 — BA Integrity Overhaul: TrophyTier + Selectivity Rate (2026-04-12)
#   Sprint: Full batting-average integrity system. TrophyTier polymorphism anchor
#     (locked/bronze/silver/gold/diamond) replaces binary live/cold display.
#     selectivityRate (sealed/published) surfaces skin-in-the-game signal.
#     isBadgeEligible() gates trophy display on MIN_VERDICTS=5 (single threshold).
#     getBattingAverageResult() is the new public API — replaces computeBattingAverage()
#     for all badge/hero/chip consumers. /api/conviction-stats updated to return
#     5 new integrity fields (battingAverage, selectivityRate, totalPublished,
#     totalSealed, trophyTier, eligible). BattingAverageHero + BattingAverageChip
#     fully redesigned around the TrophyTier data-attribute branch point.
#   New files:
#     src/styles/batting-average.css — trophy-tier design tokens; TrophyTier CSS
#       data-attribute polymorphism ([data-ba-tier]); BA fill bar + selectivity bar;
#       ba-trophy-spring @keyframes (CSS spring linear() with ease-out fallback);
#       .ba-trophy--spring JS-triggered tier-upgrade animation; token-only — zero
#       hardcoded colors; prefers-reduced-motion guard.
#   Modified files:
#     src/lib/batting-average.ts — BattingAverageResult interface (new canonical
#       type); MIN_VERDICTS=5 constant; TrophyTier type; isBadgeEligible(),
#       getSelectivityRate(), getTrophyTier() pure classifiers; getBattingAverageResult()
#       public builder (calls getSealsByAuthor + getVerdictEventsForSlugs from ledger);
#       safe error fallback returns emptyResult() — never throws at SSR time.
#     src/lib/conviction-ledger.ts — countSealed(authorSlug): COUNT(*) on
#       conviction_ledger WHERE event_type='seal' AND author_slug=? (zero schema
#       changes — reads existing rows); getSealsByAuthor + getVerdictEventsForSlugs
#       used by getBattingAverageResult() selectivity + verdict tally.
#     src/pages/api/conviction-stats.ts — buildSitewidePayload() now calls
#       getBattingAverageResult(); adds ?author= + ?published= query params;
#       new JSON shape: battingAverage, resolvedTotal, resolvedCorrect,
#       selectivityRate, totalPublished, totalSealed, eligible, trophyTier, computedAt.
#     src/components/BattingAverageHero.astro — trophy tier display; fill bar;
#       selectivity rate; eligibility gate; all new fields from BattingAverageResult.
#     src/components/BattingAverageChip.astro — TrophyTier-aware chip redesign;
#       [data-ba-tier] branch; locked/bronze/silver/gold/diamond states.
#     src/pages/track-record.astro — wired to new getBattingAverageResult() API.
#     src/styles/tokens.css — 5 new --ba-tier-* tokens (locked/bronze/silver/gold/
#       diamond); OKLCH palette aligned with conviction-gold brand anchor.
#     AGENTS.md — BA Integrity Overhaul logged under Recent Completions.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–8 identical to v85).
#
# Architecture v85 — BattingAverageChip Feed-Level Conviction Signal (2026-04-12)
#   Sprint: Feed-level per-author conviction signal on every DecayCard and
#     LeaderboardCard. SSR-only, zero client hydration. Three states: cold (—,
#     dimmed, no verdicts), provisional (1–4 verdicts, slate, thin-sample honest),
#     live (≥5 verdicts, gold-tier at strong ≥80%). Gold appears ONLY at
#     live+strong intersection (Tanya's gold-is-sacred rule). data-bac-slug hooks
#     future SSE verdict:declared live-patch.
#   New files:
#     src/lib/batting-average-chip.ts — per-author 3-state display adapter;
#       resolves DB batting average into ChipState (cold/provisional/live) and
#       ChipColorMod (cold/provisional/strong/mid/weak); LIVE_THRESHOLD=5 (Elon
#       n≥5 confidence mandate); DB-safe: returns coldChip() on any error.
#     src/components/BattingAverageChip.astro — SSR chip; imports
#       getBattingAverageChipData(); size prop ('sm'|'md'); BEM class:list builds
#       bac--{state}+bac--{colorMod}+bac--{size} for CSS tree-shaking;
#       data-bac-slug on root for future SSE patch point; aria-label + role=status.
#     src/styles/batting-average-chip.css — token-only styles; zero hardcoded
#       colors; badge-enter mount animation from motion.css; .bac--strong → gold
#       ONLY via bac--live intersection guard; responsive: label+count hidden
#       at ≤480px; prefers-reduced-motion: animation none.
#   Modified files:
#     src/components/DecayCard.astro — BattingAverageChip imported; authorSlug
#       prop added (default 'host' for single-author deploy); .card-author-row
#       flex container (justify: flex-end) injected between body and footer;
#       chip rendered at size="sm".
#     src/components/LeaderboardCard.astro — BattingAverageChip replaces inline
#       lb-pct span (live ? pct% : —); chip at size="md"; lb-stats comment updated.
#     AGENTS.md — BattingAverageChip logged under Recently Shipped.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–8 identical to v84).
#
# Architecture v84 — TrustBadge 5-State Conviction Lifecycle + 3D Flip Ceremony (2026-04-12)
#   Sprint: TrustBadge gains a full 5-state conviction lifecycle display
#     (unsealed → pending → sealed → upheld/overturned) with client-side polling
#     and a 3D flip ceremony on state transition. Pure UIX/client polish sprint —
#     zero infrastructure changes.
#   New files:
#     src/lib/client/trust-badge-ceremony.ts — client-side TrustBadge flip
#       ceremony; mounts on all [data-badge-slug] elements; polls
#       GET /api/conviction-stats?slug= every 5s; one-way state transition guard
#       (STAGE_ORDER: unsealed→pending→sealed→upheld/overturned); pre-populates
#       back face then adds .is-flipping + listens for animationend; clearInterval
#       on astro:before-preparation for View Transition cleanup; lock flag blocks
#       concurrent flips.
#     src/styles/trust-badge.css — TrustBadge ceremony CSS; per-state token
#       assignment ([data-badge-state] → --badge-bg/border/color from design
#       system); @keyframes badge-flip-out (front exits), badge-flip-in (back
#       enters), badge-settle (spring bounce), badge-upheld-glow (post-flip glow);
#       90° hold frame is the gavel moment; prefers-reduced-motion collapses to
#       opacity-only; zero hardcoded hex/rgba.
#   Modified files:
#     src/components/TrustBadge.astro — complete rewrite; 5-state display replaces
#       2-state (verified/pending); flip structure: front (SSR) + back (JS-populated)
#       for CSS 3D perspective flip; new convictionStage prop (ConvictionStage type
#       exported); badgeLabels/badgeIcons maps for all 5 states; isLinked computed
#       (sealed+verified, upheld, or overturned link to /audit); zero client JS of
#       its own (trust-badge-ceremony.ts drives client lifecycle).
#     src/components/ConvictionSeal.astro — imports getDisputeResolution;
#       deriveConvictionStage() helper added (unsealed/pending/sealed/upheld/
#       overturned); convictionStage passed to TrustBadge component.
#     src/pages/api/conviction-stats.ts — extended with optional ?slug= param for
#       per-slug conviction stage (polled by trust-badge-ceremony.ts every 5s);
#       sitewide shape unchanged; per-slug shape: { slug, conviction_stage,
#       sealed_at, verdict }; deriveStage() + buildSlugPayload() helpers added;
#       buildPayload() renamed buildSitewidePayload() (no breaking change).
#     src/pages/audit/[slug].astro — imports ConvictionStage type + getDisputeResolution;
#       deriveAuditStage() helper added; auditConvictionStage passed as prop to
#       TrustBadge; TrustBadge now shows conviction stage on audit page.
#     src/styles/global.css — @import "./trust-badge.css" added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–7 identical to v83).
#
# Architecture v83 — AnchorStrip + TrajectoryBlock + Track-Record Polish (2026-04-12)
#   Sprint: Cold-start UX gains two purpose-built components that replace empty
#     ledger state with honest forward momentum. BattingAverageHero wired with
#     anchorUrl and coldTrajectory props; predictions page gains cross-link to
#     verdict wall; CSS design-system polish across seal-ceremony, notarize-stamp,
#     and verdict stylesheets.
#   New files:
#     src/components/AnchorStrip.astro — conviction anchor strip between hero and
#       ledger; three states: anchored (live Gist link + Verify button), pending
#       (sealed posts exist but no Gist yet), cold (hidden — hero covers it); uses
#       existing token set exclusively, no new CSS files.
#     src/components/TrajectoryBlock.astro — cold-start trajectory: three milestone
#       cards (Posts Sealed · Days to First Verdict · Conviction Rate); replaces
#       Acts II+III during cold state; imports ColdTrajectory type from track-record.
#   Modified files:
#     src/lib/track-record.ts — adds ColdTrajectory interface + buildColdStartTrajectory();
#       VERDICT_WINDOW_DAYS=90 constant mirrors decay engine; primaryAnchorUrl field
#       (first entry with anchorUrl) added to TrackRecord for hero display;
#       coldTrajectory field added; error fallback includes both new fields.
#     src/components/BattingAverageHero.astro — new anchorUrl and coldTrajectory
#       props; coldClockCopy() generates trajectory-aware clock copy; seal gate
#       lowered from ≥3 → ≥1 resolved verdict (Mike §4).
#     src/components/ConvictionSeal.astro — phase transition UIX polish.
#     src/components/SiteNav.astro — navigation component refinements.
#     src/lib/seal-phases.ts — phase state-machine refinements.
#     src/pages/predictions.astro — cross-link to verdict wall (Tanya §18);
#       .vault-desc color token aligned (rgba → var(--text-tertiary)).
#     src/pages/track-record.astro — wires AnchorStrip + TrajectoryBlock into page;
#       passes primaryAnchorUrl and coldTrajectory from buildTrackRecord().
#     src/pages/verdict.astro — verdict wall UIX polish pass.
#     src/styles/notarize-stamp.css — notarize ceremony CSS polish.
#     src/styles/seal-ceremony.css — seal ceremony CSS polish.
#     src/styles/verdict.css — verdict page CSS polish.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO
#     unchanged. In-process cron runner (v82) continues to own ongoing scheduling.
#     deploy.sh startup sequence unchanged (steps 1–8 identical to v82).
#
# Architecture v82 — In-Process Cron Runner + Ghost Chip UIX Polish (2026-04-12)
#   Sprint: Automated in-process cron scheduler replaces ad-hoc manual triggers;
#     two perpetual jobs (OTS poller every 30 min, deadline sweeper every 60 min)
#     self-HTTP the existing API endpoints so auth is exercised identically to ops.
#     SiteNav ghost chip re-added with pointer-events:none (cold-state hint without
#     interactivity — Tanya §9.1). Death-clock and global CSS polish passes.
#   New files:
#     src/lib/cron-runner.ts — in-process scheduler; boots via astro:server:start
#       integration hook; `booted` flag guards Astro dev hot-reload double-boot;
#       5s cold-start delay ensures HTTP server is fully bound before first tick;
#       SIGTERM handler clears all setIntervals before Docker stop.
#     src/lib/cron-store.ts — SQLite persistence for cron run history; auto-creates
#       `cron_runs` table in revivals.db (WAL mode); recordStart / recordFinish /
#       recordError write path; getLastRuns + getFailureStreak read path.
#     src/lib/jobs/ots-poller.ts — 30-min OTS upgrade job; calls POST /api/ots-upgrade
#       via self-HTTP; detects stuck seals (>4h warn, >24h alert); JSON structured log.
#     src/lib/jobs/deadline-sweeper.ts — 60-min deadline sweep job; calls POST
#       /api/deadline-sweep via self-HTTP; derives ok/partial/error CronStatus.
#     src/pages/api/cron-health.ts — GET /api/cron-health (Bearer ADMIN_SECRET);
#       returns per-job lastRun, lastStatus, failureStreak, pendingOtsCount;
#       HTTP 500 when any job streak >= 3 (monitoring / Docker health probe ready).
#   Modified files:
#     astro.config.mjs — cronRunnerIntegration added; hooks astro:server:start to
#       dynamically import and boot cron-runner.ts after HTTP server is listening
#       (fires in both `astro dev` and standalone `node dist/server/entry.mjs`).
#     src/components/SiteNav.astro — ghost chip re-added with pointer-events:none,
#       cursor:default; cold-state hint approach revised to §9.1 (absence → anticipation)
#       from §11 (pure absence); border-color and background tokens updated.
#     src/lib/mood-simple.ts — mood derivation refinements (polish pass).
#     src/styles/death-clock.css — heartbeat animation tuning (polish pass).
#     src/styles/global.css — global design system additions (polish pass).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts /app/data (revivals.db) — cron_runs table auto-created.
#     DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT, DISPUTE_QUORUM_RATIO unchanged.
#     Steps 6–7 (deadline-sweep + ots-upgrade curl) remain as on-deploy triggers;
#     ongoing scheduling is now owned by the in-process cron runner.
#
# Architecture v81 — Seal Cancel + SealReceipt Component Extraction (2026-04-12)
#   Sprint: Conviction seal ceremony gains a phase-3 cancel path (AbortController
#     aborts the in-flight POST), the inline receipt is extracted to a dedicated
#     SealReceipt.astro notary-document component, and the design system gains two
#     interactive color tokens. Pure UIX/client polish — zero infrastructure changes.
#   Modified files:
#     src/lib/seal-ceremony.ts — AbortController added to createCeremony; cancel()
#       aborts in-flight POST at phase 3 (no-op if already resolved); fetchSeal
#       accepts AbortSignal param; handleError routes DOMException AbortError to
#       setPhase(0) + cb.onCancel?.() (separate path from generic error); postSlug
#       added to ReceiptData interface; onCancel?: () => void added to
#       CeremonyCallbacks; cancel() exposed on the returned ceremony handle.
#     src/pages/api/conviction-seal.ts — postSlug: slug added to the JSON response
#       body (receipt download + audit link construction in client).
#     src/components/ConvictionSeal.astro — imports SealReceipt; phase-3 lock overlay
#       added (irreversibility notice + Cancel CTA [data-cancel-btn]); old inline
#       receipt markup removed; <SealReceipt /> rendered outside form so form
#       display:none at phase 3 doesn't hide receipt at phase 4; old cs-receipt-*
#       CSS block removed (now lives in SealReceipt.astro / seal-ceremony.css).
#     src/components/SealReceipt.astro — NEW: static notary-document receipt shell;
#       data slots: [data-receipt-date], [data-receipt-score], [data-receipt-hash],
#       [data-receipt-anchor], [data-receipt-download], [data-receipt-audit];
#       @starting-style slide-up entrance (CSS-native); download wired by JS Blob URL.
#     src/styles/seal-ceremony.css — phase-3 lock overlay + cancel button styles;
#       receipt entrance / layout tokens migrated to SealReceipt component scope.
#     src/styles/tokens.css — --radius-tombstone: 48% 48% 4px 4px (arched top,
#       flat bottom — graveyard aesthetic upgrade from flat 8px 8px 0 0);
#       --color-interactive: oklch(65% 0.12 250) + --color-interactive-hover:
#       oklch(72% 0.14 250) (slate-violet link/icon-button single source of truth).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v80 — Seal Ceremony Completion Lifecycle + 409 Graceful Handling (2026-04-12)
#   Sprint: Seal ceremony gains a post-receipt completion beat, 409 (already-sealed)
#     is treated as good news not an error, SiteNav cold state simplified to pure
#     absence, BattingAverageHero removed from homepage, and admin UI border-radius
#     aligned to design system. Pure UIX/client polish — zero infrastructure changes.
#   Modified files:
#     src/lib/ceremony-atmosphere.ts — ceremonyComplete(slug): third lifecycle hook;
#       calls applyAtmosphere('fresh') + dispatches 'ceremony:complete' custom event;
#       fires 3.3s after phase 4 receipt settles (quiet restoration to neutral page).
#     src/lib/seal-ceremony.ts — AlreadySealedError class added (name='AlreadySealedError');
#       fetchSeal() throws AlreadySealedError on HTTP 409; CeremonyCallbacks gains
#       optional onAlreadySealed?: () => void; handleError() dispatcher: routes
#       AlreadySealedError to onAlreadySealed?.() instead of generic onError (phase
#       resets to 0 in both paths); submit() delegates to handleError() on catch.
#     src/components/ConvictionSeal.astro — imports ceremonyComplete from
#       ceremony-atmosphere; handleCeremonyAtmosphere phase=4 branch gains second
#       setTimeout(ceremonyComplete, 3300) to restore neutral after receipt; onReceipt
#       now also dispatches 'conviction:sealed' CustomEvent (bubbles: true, detail:
#       {slug}) for loose pub/sub consumers; onAlreadySealed callback wired to new
#       showAlreadySealed(errorEl) helper (gold-dim text "✓ Already sealed —
#       conviction is locked." — celebratory, not alarming).
#     src/components/SiteNav.astro — cold-state ghost link removed entirely; absence
#       creates curiosity (Tanya P0 §11); ternary → simple && conditional guard.
#     src/pages/index.astro — BattingAverageHero import and computeBattingAverage
#       call removed; avg variable dropped; hero component no longer rendered on
#       homepage (simplification pass — removes clutter above the river).
#     src/pages/admin.astro — .login-input + .login-btn border-radius: 8px → 10px
#       (design system alignment: --radius-input token target).
#     src/styles/seal-ceremony.css — additional CSS refinements to seal receipt
#       entrance and ceremony token usage (polish pass, no structural changes).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v79 — Audit Download API + AuditReceipt DER Hex + Chain Integrity (2026-04-12)
#   Sprint: Conviction audit page gains cryptographic proof download endpoints and
#     two new inline verification surfaces — raw DER hex dump and real-time chain
#     integrity check. Pure SSR/API polish sprint — zero infrastructure changes.
#   New files:
#     src/pages/api/audit-download/[slug].ts — NEW: serve proof files for download;
#       GET /api/audit-download/{slug}?type=tsr → DER bytes (application/timestamp-reply,
#       Content-Disposition attachment conviction-{slug}.tsr, immutable Cache-Control);
#       GET /api/audit-download/{slug}?type=ots → OTS blob (application/octet-stream,
#       stale-while-revalidate); reads from existing getTstForSeal + getOtsProof;
#       no new DB tables, no new volumes, no new npm packages.
#   Modified files:
#     src/lib/audit-verifier.ts — derHexLines(base64Token): formats RFC 3161 DER
#       token as hex lines (16 bytes/row), returns [] on decode failure (graceful);
#       checkChainIntegrity(entry): recomputes SHA-256 chain hash from stored fields
#       using Node built-in crypto — returns bool (true = intact); onboarding_dismiss
#       event type added to EVENT_LABEL map.
#     src/components/AuditReceipt.astro — two new props: derHexLines (string[]|null)
#       and chainIntegrityOk (boolean|null); chain integrity indicator banner (●/✗,
#       green/red styling); download button row (↓ .tsr / ↓ .ots links with download
#       attr); DER hex dump <details> block with byte-count header; openssl verify
#       command now wrapped in verify-cmd-wrapper with copy-to-clipboard button
#       (navigator.clipboard, data-copied toggle, 1500ms reset); all new selectors
#       fully token-driven (zero hardcoded hex/rgb).
#     src/pages/audit/[slug].astro — imports derHexLines + checkChainIntegrity from
#       audit-verifier; getSealEntry import consolidated (no duplicate import);
#       tstDerHexLines and chainOk computed SSR-side; both passed as props to
#       AuditReceipt; zero new DB queries (free-rides existing getSealEntry call).
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v78 — Phase 3.5 Notarize Moment (2026-04-12)
#   Sprint: Cinematic seal ceremony gains a Phase 3.5 (NOTARIZE) interstitial
#     between lock (POST resolves) and receipt (phase 4). Pure UIX/animation
#     sprint — zero infrastructure changes.
#   New files:
#     src/lib/seal-phases.ts — pure state machine: SealPhase = 0|1|2|3|3.5|4;
#       transition() is side-effect-free and safe to unit-test; NOTARIZE=3.5
#       named constant; isLocked() guards escape abort; SealEvent union type.
#     src/components/NotarizeStamp.astro — static shell for phase 3.5 ceremony;
#       wax-bloom SVG (radial gradient, @property --ns-bloom-r GPU-composited r
#       animation), ⬡ seal mark (stamp-settle spring keyframe), RFC 3161 timestamp
#       hero (ts-appear, 2rem gold mono), hash ink-dry clip-path reveal;
#       [data-notarize-stamp] data slots populated by ConvictionSeal.astro script;
#       null tst_token path plays ceremony with "Anchoring locally…" — no JS error.
#     src/styles/notarize-stamp.css — all selectors scoped to .notarize-stamp;
#       triggered exclusively by [data-seal-phase="3.5"] ancestor selector;
#       @starting-style mount animation; prefers-reduced-motion guard collapses
#       all to opacity-only; zero hardcoded hex/rgb — 100% token-driven.
#   Modified files:
#     src/lib/seal-ceremony.ts — re-exports SealPhase from seal-phases; adds
#       tst_token: string|null to ReceiptData; onNotarize callback added to
#       CeremonyCallbacks (fires at 3.5 before 800ms ceremonial pause);
#       notarize() async helper: setPhase(3.5) → cb.onNotarize → delay(800) →
#       setPhase(4) → cb.onReceipt; submit() calls notarize() instead of direct
#       setPhase(4)+onReceipt.
#     src/styles/tokens.css — 8 new --notarize-* tokens: bloom-core/mid/edge
#       (OKLCH amber scale), bloom-duration (500ms), mark-size (3rem), ts-size
#       (2rem), shadow (color-mix oklch gold 12%), gold-dim bridge alias.
#     src/components/ConvictionSeal.astro — imports NotarizeStamp; adds
#       onNotarize handler + populateNotarize() to fill [data-ns-ts], [data-ns-hash],
#       [data-ns-label] slots; stamp ref captured at init; NotarizeStamp rendered
#       outside <form> so form display:none at phase 4 doesn't hide it.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
#
# Architecture v77 — AuditVerdictPanel + Audit OG Image Pipeline (2026-04-12)
#   Sprint: Conviction audit page gains a verdict outcome panel (AuditVerdictPanel)
#     and a dedicated OG image endpoint. Pure SSR code & UI polish — zero infra
#     changes.
#   New files:
#     src/components/AuditVerdictPanel.astro — three-state verdict panel (pending /
#       resolved-uncontested / resolved-contested); color-mix tokens only; ceremony
#       entrance animation (avp-enter, cubic-bezier spring); DL grid for declared
#       date, challenge share, dispute state, score contribution; responsive stacking
#       at 480px; all tokens from global design system (--verdict-*, --gold-*, --text-*,
#       --font-mono, --motion-ceremony-*).
#     src/lib/verdict-display.ts — pure data-assembly layer: getVerdictDisplay(slug)
#       composes getVerdictRecord + getDisputeState + getDisputeResolution into a
#       display-ready VerdictDisplay model; never throws; zero new DB queries.
#     src/lib/og/auditLayout.ts — Satori element tree for audit OG card (1200×630);
#       single-panel evidence-exhibit design; title, score, verdict outcome, proof
#       anchors; locked token set mirroring accountabilityLayout.ts.
#     src/pages/api/og/audit/[slug].png.ts — GET /api/og/audit/[slug].png; renders
#       conviction audit OG image via renderAuditImage(); prerender=false.
#   Updated files:
#     src/components/PostBadge.astro — size prop ('sm'|'md') added; sm: 0.62rem /
#       0.2rem×0.6rem padding (cards, dense layouts); md: 0.72rem / 0.25rem×0.8rem
#       (default, detail page headers); zero breaking-change (default='md').
#     src/lib/og/renderOGImage.ts — renderAuditImage(data) exported; auditLayout
#       import added; AuditOGData type re-exported.
#     src/pages/api/conviction-audit.ts — buildResponse now calls getVerdictDisplay
#       and includes verdict, verdictLabel, declaredAt, isContested, disputeState,
#       challengeShare, scoreContrib in the JSON response (API parity with page).
#     src/pages/audit/[slug].astro — imports AuditVerdictPanel + getVerdictDisplay;
#       auditAtmosphere + verdictOutcomeAtm computed SSR-side; BaseLayout receives
#       ogSlug="audit/{slug}" + atmosphere + verdictOutcome props; AuditVerdictPanel
#       rendered after AuditReceipt; API footnote (GET /api/trust-verify/{slug})
#       added per Tanya §11.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME, DATA_VOLUME, ADMIN_SECRET, GITHUB_PAT unchanged.
#     DISPUTE_QUORUM_RATIO unchanged. deploy.sh: no changes to startup sequence
#     or post-start hooks (deadline-sweep + ots-upgrade calls unchanged).
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

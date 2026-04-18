#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
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

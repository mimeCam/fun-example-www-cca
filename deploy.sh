#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v134 — Verdict Seal Ceremony (2026-04-18)
#   Sprint: Interactive 3-phase verdict sealing ceremony — deliberation
#     (conviction re-read, 2s dwell), declaration (verdict pick, BA delta
#     preview, confirm gate), reckoning (BA counter animation, receipt).
#   Key changes:
#     src/components/VerdictSealCeremony.astro — NEW: 3-phase interactive
#       ceremony. State machine via data-phase CSS selector. SSR Phase 1,
#       progressive enhancement via <script>. Dwell timer, verdict options
#       radiogroup, BA preview fetch, hesitation beat, receipt population.
#     src/styles/verdict-seal-ceremony.css — NEW: phase visibility, entrance
#       keyframes (vsc-fade-in, vsc-scale-in), verdict option card states,
#       BA counter @property animation, dwell CTA lock, reduced-motion.
#     src/lib/batting-average.ts — simulateVerdictDelta() + helpers for BA
#       delta preview. Pure read-only computation, never writes.
#     src/pages/api/verdict-resolve.ts — GET handler for BA delta preview
#       (public, read-only, no auth). POST handler unchanged.
#     src/pages/verdict/[slug].astro — VerdictSealCeremony wired in
#       (admin-gated, unsealed verdicts only). Admin detection via HMAC
#       cookie. Ceremony data fetched conditionally (stance, decay, etc).
#     src/pages/blog/[slug].astro — Verdict CTA link ("Face your verdict")
#       when conviction sealed but no verdict. Border-radius token migration
#       (12px → var(--radius-card)).
#     src/lib/client/seal-sound.ts — playVerdictStamp() sound variant
#       (triangle 60Hz + sine glide 600→900Hz).
#     src/styles/tokens.css — 4 ceremony tokens: --verdict-ceremony-dwell,
#       --verdict-ceremony-hesitation, --verdict-ceremony-counter,
#       --verdict-seal-bg.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     DATA_VOLUME, SQLITE_VOLUME, ADMIN_SECRET, HMAC_SECRET, GITHUB_PAT,
#     DISPUTE_QUORUM_RATIO all unchanged. deploy.sh startup sequence
#     unchanged (steps 1–8 identical to v129).
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

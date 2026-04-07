#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v34 — HMAC Seal + Admin Web UI (2026-04-07)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Author conviction sealed with HMAC proof.
#   Admin dashboard at /admin for cookie-authenticated seal management.
#
# Sprint (latest — HMAC Seal + Admin Web UI):
#   pages/admin.astro — NEW: protected conviction seal dashboard at /admin.
#     GET shows login form (no cookie) or post list (valid cookie).
#     POST validates ADMIN_SECRET → sets HttpOnly admin_token cookie → redirect.
#     Cookie auth: HMAC-SHA256(ADMIN_SECRET, 'admin-session'); 1-hour TTL.
#   components/AdminSealForm.astro — NEW: per-post seal form with live preview
#     mirroring ConvictionHero layout; POSTs JSON to /api/conviction-seal
#     using cookie auth (no secret in HTML); shows sealed state read-only.
#   lib/conviction-ledger.ts — UPDATED: dropped SHA-256 chain display
#     (blockchain cosplay with no external anchor); replaced with HMAC-based
#     seal: proves the server wrote it, nothing more. Added hmac_seal column
#     (auto-migrated on boot; null for old rows). Removed verifyChain /
#     ChainVerification; added getEntriesForSlug for honest audit trail.
#   pages/api/conviction-seal.ts — UPDATED: dual auth paths — body secret
#     (CLI/curl) and cookie admin_token (admin web UI). Broadcasts
#     conviction:sealed SSE event via broadcastNamed on successful seal.
#   pages/api/conviction-audit.ts — UPDATED: removed chain verification;
#     returns plain entry list (valid/brokenAt fields dropped from response).
#   pages/api/conviction-stats.ts — UPDATED: removed per-slug chain checks;
#     chainIntegrity field dropped from response.
#   components/ConvictionHero.astro — UPDATED: removed ch--broken chain state,
#     ch-chain span, and all broken-chain CSS; cleaner render path.
#   components/ConvictionDeclaration.astro — UPDATED: chain verification UI
#     removed; aligned with HMAC-only audit model.
#   components/ConvictionAuditTrail.astro — UPDATED: uses getEntriesForSlug
#     instead of verifyChain; chain-integrity row removed from display.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db; hmac_seal column auto-migrates on boot.
#     ADMIN_SECRET required (cookie auth derives token from it).
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
docker run \
  --detach \
  --init \
  --restart unless-stopped \
  --name "${CONTAINER_NAME}" \
  --publish "${HOST_PORT}:${CONTAINER_PORT}" \
  --memory 768m \
  --volume "${DATA_VOLUME}:/app/dist/server/data" \
  --volume "${SQLITE_VOLUME}:/app/data" \
  --env ADMIN_SECRET="${ADMIN_SECRET:-}" \
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

# ── 6. Prune dangling images from previous builds ────────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

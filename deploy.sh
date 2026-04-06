#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v6 — Revival Moment (Tier 1 core feature)
#   The decay IS the hint. The revival IS the onboarding.
#   Blog posts show extreme temporal decay (blur, desaturation, grain) and
#   revive via hover-dwell / touch-hold / keyboard — bloom ring, camera shake,
#   haptic feedback, badge, sympathetic SSE, prefers-reduced-motion support.
#   Replaces 6 bloom files + 4 onboarding components with 1 unified system.
#
# Sprint (latest):
#   - Revival Moment on /blog/[slug] (core decay-to-revival transition):
#     revival-moment.ts: unified choreography (dwell/touch/keyboard triggers,
#       session gating, /api/revive POST, sympathetic SSE via EventSource).
#     RevivalMoment.astro: wraps article in .revival-stage with CSS custom
#       properties (--decay-opacity, --decay-blur, --decay-saturation, --stage-grain).
#     decay-extremes.css: extreme decay visual layer (opacity floor 0.30, blur 4px,
#       saturation 0.12 for ancient posts).
#     revival-moment.css: revival bloom ring, badge, sympathetic pulse animations.
#   - Prose styling for blog posts: h2/h3, blockquotes, code blocks, images.
#   - BaseLayout wired: imports decay-extremes.css + revival-moment.css globally.
#
# Supports: Hybrid SSR (Astro + Node), SQLite collective memory,
#           SSE heartbeat (real-time revival pulses via EventSource),
#           Proof of Life — Presence Indicator (live reader count + revival stats),
#           dynamic OG image generation (satori + resvg),
#           anonymous session identity (sessionToken.ts),
#           FirstBreath arrival choreography,
#           FirstVisitHint (localStorage-gated one-shot onboarding),
#           Consequential Decay / Graveyard (entomb + resurrect),
#           Ambient Life Engine (phantom SSE pulses, seed revivals),
#           Adaptive Decay Engine (seedling→growing→mature tiers),
#           Grain overlay (CSS noise texture via --decay-grain),
#           Widened decay contrast (opacity 0.4 floor, saturation 0.3, blur 2px),
#           Revival Guard anti-gaming (optional PoW, fingerprint, velocity),
#           Constellations page (force-directed star-field reading paths),
#           Heartbeat pulse, shimmer, snapshot, time-travel.

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

# ── 2. Ensure named data volumes exist (whisper queue + SQLite collective memory)
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

#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Supports: Hybrid SSR (Astro + Node), SQLite collective memory,
#           SSE heartbeat (long-lived connections for real-time revival pulses),
#           heartbeat bridge (remote→bloom), ambient presence pulse indicator,
#           dynamic OG image generation (satori + resvg — needs extra memory),
#           FSM spectacle controller (idle→bloom→decay→resist→handoff→done),
#           first-visit cinematic handshake (2-second gate via localStorage),
#           keyboard revival (Space/Enter hold on .decay-card, 600 ms dwell),
#           spectacle demo revival (__demo__ slug, no DB write, handoff phase),
#           accessible radial ring (RadialRing.astro + radialRingA11y.ts + ring.css),
#           revival share bottom sheet (RevivalShareSheet.astro + revivalShare.ts —
#             slides up on revival:success, static scroll-revealed fallback button,
#             OG preview, session guard, Web Share API + clipboard fallback),
#           anonymous session identity (sessionToken.ts — UUID in localStorage,
#             injected as window.__sessionId; X-Session-Id header on revival POSTs;
#             session-scoped rate_limit_session SQLite table auto-created at runtime,
#             solves shared-NAT / office-IP rate-limit false-positives),
#           FirstBreath arrival choreography (FirstBreath.astro + first-breath.css —
#             time-aware whisper banner, 4-beat fade sequence, page desaturate→bloom,
#             once per browser session via sessionStorage gate, reduced-motion safe),
#           Sympathetic Bloom mobile polish — circuit breaker guardrails (max 4
#             concurrent blooms, 5s hard timeout, thundering-herd detection, FPS
#             watchdog, Page Visibility pause), haptic choreography (diminishing
#             taps, reduced-motion safe), accessible cascade ARIA announcements,
#             mobile cascade controller (120ms stagger, scroll assist, orientation),
#             touch/desktop strategy delegation in sympatheticBloom,
#           Consequential Decay / Graveyard (entomb.ts, /graveyard page,
#             POST /api/resurrect, TombstoneCard, RisenBadge — posts that
#             fully decay ≥0.95 + 30 days dormant get entombed; readers
#             resurrect them with +3 revival weight; risen_at column
#             auto-migrated in SQLite at startup; zero new dependencies),
#           Ambient Life Engine (ambientLife.ts + seed/weight/config —
#             makes the blog feel alive with zero visitors: seeds minimum
#             revival counts on startup, emits phantom SSE pulses on a
#             jittered timer, fades phantom activity as real readers arrive;
#             reads src/data/ambientLife.config.json + src/content/blog/*.md
#             at runtime — Dockerfile copies these into production image;
#             zero new dependencies, plugs into heartbeat + collectiveMemory),
#           Adaptive Decay Engine (adaptiveDecay.ts + adaptiveDecay.config.json —
#             dynamically adjusts decay parameters based on blog maturity;
#             three tiers: seedling→growing→mature with smooth interpolation;
#             solves cold-start problem: young blogs show visual contrast from
#             day one instead of all cards at ~0.16 decay; 24h auto-refresh;
#             reads src/data/adaptiveDecay.config.json at runtime via process.cwd();
#             integrates with postMeta, ambientLife, live-decay; zero new deps).

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

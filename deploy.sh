#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v18 — Erosion Bar + SavedMoment (2026-04-06)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Honest Presence shows real-time reader
#   counts per slug (and global scope) via SSE. Zero phantoms.
#
# Sprint (latest — Erosion Bar + SavedMoment):
#   ErosionBar.astro (new) — visual conviction life-drain bar rendered inside
#   each EndangeredCard; SSR-sets --erosion-pct and --erosion-hue as inline
#   CSS vars (no layout shift); client JS recomputes on revival events.
#   SavedMoment.astro (new) — "All beliefs tended. The record holds."
#   emotional payoff toast; hidden by default, revealed by client JS when
#   the last endangered card is dismissed; CSS handles full fade cycle (3.5s).
#   endangered.ts — erosionBarPct() / erosionHue() server-side helpers;
#   endangeredClientScript updated: 2-phase dismiss (bloom → collapse, -400ms
#   fade phase removed for Android perf), patchErosion() updates bar vars on
#   each revival event, showSavedMoment() wires dismissBand() to SavedMoment,
#   refreshCards() called on boot to initialise erosion state immediately.
#   EndangeredBand.astro — imports SavedMoment; wraps cards in
#   .endangered-cards[data-endangered-count] for JS targeting.
#   EndangeredCard.astro — embeds <ErosionBar> between title and footer;
#   countdown text now final-urgency only (bar replaces general urgency cue).
#   endangered.css — .erosion-bar / .erosion-fill (3px, overflow:hidden, hsl
#   gradient, erosion-breathe keyframe); .saved-moment / .saved-moment--visible
#   (display:none → flex, fade-in/hold/fade-out animation, aria-live polite).
#   Pure frontend — no new services, volumes, or runtime dependencies.
#
# Supports: Hybrid SSR (Astro + Node), SQLite collective memory,
#           Honest Presence (per-slug + global-scope reader count via SSE),
#           dynamic OG image generation (satori + resvg),
#           Consequential Decay / Graveyard (entomb + resurrect),
#           Graveyard Discovery Surface (teaser, stats, tombstone history),
#           Honest Graveyard (entombed_at timestamps, SSR pagination, mood lock),
#           Endangered Posts (urgency tiers, pulse, erosion bar, countdown),
#           2-phase revival dismiss (bloom → collapse, a11y, Android-optimised),
#           SavedMoment toast (emotional payoff when last card revived),
#           Revival animations (bloom ring, scale lift, badge),
#           Revival Guard anti-gaming (fingerprint, velocity),
#           Passive Reading Heartbeat (reading_seconds, readingBonus),
#           NowLine (pinned author status + graveyard hint on homepage),
#           Murmurs (wall whispers on homepage, CLI-only submission),
#           Grain overlay (CSS noise texture via --decay-grain).

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

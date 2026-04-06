#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v20 — Cinematic Revival + Conviction Panel (2026-04-06)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Honest Presence shows real-time reader
#   counts per slug (and global scope) via SSE. Zero phantoms.
#
# Sprint (latest — Cinematic Revival Moment + Author Conviction Notes):
#   revival-moment.ts — 5-phase cinematic revival sequence:
#     Phase 1: anticipation SVG arc (strokeDashoffset fills over DWELL_MS);
#     Phase 2: localStorage 7-day TTL gate (replaces sessionStorage);
#     Phase 3a: WAAPI dissolve — scale lift + opacity via Element.animate();
#     Phase 3b: chromatic aberration h1 flash at t=200ms (signature moment);
#     Phase 4: witness badge — "You rescued this — N% decayed · M readers
#     this month" (decayPct + monthlyCount from API); two-tap haptic pulse;
#     Phase 5: SSE ripple — sympathetic bloom from other readers (unchanged).
#   revival.css — anticipation-arc SVG styles + chroma-flash @keyframes;
#     reduced-motion suppression for both new phases; --mood-accent-rgb token.
#   ConvictionPanel.astro (new) — inline <details>/<summary> belief audit;
#     max 5 convictions per post; verdict tokens: ✓ still-true, ✗ wrong,
#     ↗ evolved, ? unaudited; strike-through for wrong beliefs; zero JS.
#   content/config.ts — convictions[] frontmatter schema (max 5, verdictEnum);
#   [slug].astro — imports ConvictionPanel; post-nav-row with "← back to field"
#     + "[⚖ beliefs]" anchor link when convictions present.
#   collectiveMemory.ts — getMonthlyRevivalCount(slug): 30-day window query
#     on existing velocity_log table; used by /api/revive for witness badge.
#   api/revive.ts — response now includes decayPct (0-100) + monthlyCount.
#   decay-engine.ts — bug fixes: MAX_DAYS_DEFAULT 365→180 (cold-start fix for
#     personal blogs), readingBonus cap 0.08→0.15 (raised for fairer credit);
#     both fix applied in server function and client IIFE in sync.
#   hello-world.md — seeded with example convictions array.
#   Pure frontend + logic fixes — no new services, volumes, or runtime deps.
#
# Supports: Hybrid SSR (Astro + Node), SQLite collective memory,
#           Honest Presence (per-slug + global-scope reader count via SSE),
#           dynamic OG image generation (satori + resvg),
#           Consequential Decay / Graveyard (entomb + resurrect),
#           Graveyard Discovery Surface (teaser, stats, tombstone history),
#           Honest Graveyard (entombed_at timestamps, SSR pagination, mood lock),
#           Graveyard Epitaph layout (OKLCH tokens, scroll-driven entrance,
#           candlelight footer, CSS :has() resurrection glow, empty state),
#           Endangered Posts (urgency tiers, pulse, erosion bar, countdown),
#           2-phase revival dismiss (bloom → collapse, a11y, Android-optimised),
#           SavedMoment toast (emotional payoff when last card revived),
#           Cinematic Revival (5-phase: arc → localStorage gate → WAAPI dissolve
#           → chromatic h1 flash → witness badge + SSE ripple),
#           Revival Guard anti-gaming (fingerprint, velocity),
#           Passive Reading Heartbeat (reading_seconds, readingBonus),
#           Author Conviction Notes (ConvictionPanel, belief audit, verdicts),
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

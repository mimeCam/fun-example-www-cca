#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v36 — Cover Images (2026-04-07)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Author conviction sealed with HMAC proof.
#   Cover images now decay visually alongside their post: saturation collapses,
#   opacity fades, blur ghosts — same physics as the decay ring.
#
# Sprint (latest — Cover Images):
#   content/config.ts — UPDATED: coverImage field added to blog schema
#     (optional, path relative to /public, e.g. /images/covers/hello-world.svg).
#   lib/postMeta.ts — UPDATED: coverImage field added to PostMeta interface;
#     extractMeta() now passes it through from frontmatter.
#   lib/og/ogLayout.ts — UPDATED: split-panel layout activated when
#     coverImageUrl is present — text left (720px), image right (480px);
#     image opacity degrades with decay (min 0.45). Falls back to gradient
#     layout when no image provided.
#   pages/api/og/[slug].png.ts — UPDATED: toCoverImageUrl() converts
#     /public-relative path to absolute URL for Satori image fetch.
#   pages/blog/[slug].astro — UPDATED: full-bleed 16/6 hero rendered above
#     post header; fallback gradient band uses --mood-accent-rgb when no image.
#   components/DecayCard.astro — UPDATED: cover-wrap slot (16/7 ratio) above
#     title; decay filter cascade on .cover-img (saturate/opacity/blur driven
#     by --decay-factor); fallback .cover-gradient for imageless posts.
#     Card padding moved from .post-card to inner children (bleed fix).
#   components/TombstoneCard.astro — UPDATED: ghost cover in graveyard —
#     saturate(0.08) opacity(0.25) blur(0.5px) + luminosity blend; renders
#     only when post.coverImage is set. Tombstone padding moved to inner wrapper.
#   lib/tension-score.ts — UPDATED: MIN_STANCES raised 1→10 (reduces false
#     high-tension signals on short-read posts).
#   public/images/covers/ — NEW: cover image assets directory;
#     building-in-public.svg + the-decay-theory.svg ship with this sprint.
#   Dockerfile — FIXED: COPY public/ ./public/ added to builder stage so
#     cover assets reach dist/client/ and are served at runtime.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
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

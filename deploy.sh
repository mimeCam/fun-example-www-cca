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
#           keyboard revival (Space/Enter hold on .decay-card, 600 ms dwell),
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
#           Guided First Touch (GuidedTouch.astro + guidedTouch.ts + guided-touch.css —
#             interactive first-visit demo; walks visitor through one decay→revival
#             cycle on a real card; localStorage gate; reduced-motion safe),
#           Sympathetic Bloom mobile polish — circuit breaker guardrails (max 4
#             concurrent blooms, 5s hard timeout, thundering-herd detection, FPS
#             watchdog, Page Visibility pause), haptic choreography (diminishing
#             taps 18→12→6ms, singlePulse API, reduced-motion safe), accessible
#             cascade ARIA announcements + border-color flash for sympathetic
#             cards under reduced-motion, mobile cascade controller (120ms stagger,
#             scroll assist block:'nearest', active-scroll detection, orientation
#             debounce), touch/desktop strategy delegation in sympatheticBloom,
#             touch-cancel ghost bloom prevention in orchestrator, GPU will-change
#             promote/demote lifecycle (frees mobile GPU memory after settle),
#             degraded-mode intensity cap (0.5) when guardrails report low FPS,
#             bloom.css: linear() spring curve (progressive enhancement), mobile
#             particle cap (nth-child(n+5) hidden ≤640px), rolling 8-frame FPS
#             sampling with 45fps degrade / 30fps kill thresholds,
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
#             integrates with postMeta, ambientLife, live-decay; zero new deps),
#           FirstVisitDiscovery (DiscoveryWhisper.astro + discoveryHint.ts +
#             RewardWhisper.astro + rewardWhisper.ts + discovery.css —
#             single whisper hint replaces 22KB FSM onboarding; old
#             onboardProbe/onboardHint/revivalReward/revivalToast merged into
#             two lightweight modules; nav simplified to 2+1; zero new deps),
#           Revival Guard anti-gaming system (revivalGuard.ts + proofOfWork.ts +
#             visitorFingerprint.ts + /api/challenge endpoint —
#             6-step fail-fast chain: hashcash PoW (16-bit difficulty, ~50ms
#             desktop), privacy-respecting browser fingerprint (8 navigator/
#             screen signals SHA-256 hashed client-side), per-FP daily cap,
#             per-IP daily cap, per-slug hourly velocity governor, global
#             hourly velocity governor; visitor trust scoring (age + visit
#             frequency); SQLite tables auto-migrated: visitor_trust,
#             velocity_log, daily_counts; stale-challenge auto-refresh on
#             client; uses Node built-in crypto — zero new dependencies),
#           First Revival Echo (echoTarget.ts + firstEcho.ts + firstEchoClient.ts +
#             /api/echo-hint endpoint + echo.css — when a first-time visitor
#             completes their first revival after Guided Touch, schedules a
#             phantom heartbeat on a constellation-linked post 3–8s later;
#             weighted target selection via constellation strength × decay factor;
#             one-shot per session (server Set gate + localStorage client gate);
#             skips when real visitors are connected; client waits for
#             guidedtouch:done event before arming; whisper UI bottom-center
#             with opacity transition + ARIA live region; reduced-motion safe;
#             guidedTouch.ts now emits CustomEvent('guidedtouch:done') on cleanup;
#             zero new dependencies, plugs into heartbeat + collectiveMemory).

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

#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker.
#
# Public surface: container exposes port 7100. External Caddy terminates
# SSL and reverse-proxies to 7100 — this script only needs to bind that
# port on the host.
#
# Safe to run repeatedly: always stops + removes any existing container,
# re-creates named volumes if missing, rebuilds the image with --no-cache,
# then starts the fresh container. All output (stdout + stderr) is
# captured into deployment.log (truncated on each run) so any failure —
# Docker, prebuild guard, SSR warm-up — can be investigated post-mortem.
#
# ── Sprint v172 (2026-04-23) — "Collective Memory Clock Seam" ────────────
#   v169 shipped the clock seam (`src/lib/clock.ts`) + SSR middleware
#   (`src/middleware.ts`) that pins one `now()` per request. v170 wired
#   read-only JSON handlers through `jsonStamped()` so every `computedAt`
#   field in one SSR request is byte-identical. v172 finishes the fattest
#   remaining wedge by migrating the heavy DB module:
#
#     `src/lib/collectiveMemory.ts` — 20 raw `Date.now()` / `new Date()`
#     callsites → 0. Every wall-clock read now routes through `now()` /
#     `nowDate()` / `nowISO()` from `src/lib/clock.ts`. Two pure helpers
#     (`rateWindowOpen`, `cutoffMs`) are extracted so the math can be
#     locked without touching the seam. Net: the heavy DB module now
#     agrees with the middleware pin and the `/api/docs/cite` payload
#     byte-for-byte across revival, rate-limit, velocity, daily-bucket,
#     and visitor-trust paths.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/collectiveMemory.ts (UPDATED) — all 20 raw wall-clock
#       callsites replaced. Rate-limit stamps write ONE clock read into
#       both columns (Mike PoI §2). `todayKey()` reads `nowISO().slice
#       (0,10)` — shape `YYYY-MM-DD` stays load-bearing for existing
#       daily_counts rows. New exports: `rateWindowOpen(lastAt, nowMs,
#       windowMs)` and `cutoffMs(nowMs, windowMs)` (Math.max(0, …) so a
#       negative cutoff never leaks into SQLite filters). Test-only
#       `__setSharedDbForTests` now eagerly calls `initTables(override)`
#       so swap-in `:memory:` handles have the schema immediately.
#     • src/lib/__fixtures__/collectiveMemory.clock.json (NEW) — frozen
#       ISO instant + window literals (rateWindowMs, readingRateMs,
#       hourMs, dayMs, velocityRetentionDays). Duplicated intentionally:
#       the test is a contract, not a re-derivation.
#     • src/lib/collectiveMemory.clock.test.ts (NEW) — golden covering
#       the Mike PoI §6 checklist: (0) fixture sanity, (1) pure helpers
#       on boundary inputs, (2) stamps land on the pinned clock, (3)
#       rate-limit windows deterministic under the pin, (4) velocity
#       cutoffs route through the seam, (5) daily-count bucket keys off
#       pinned today, (6) visitor-trust aging relative to the pin, (7)
#       pruneRateLimits uses the pinned cutoff, (8) parallel withClock
#       scopes don't cross-contaminate (AsyncLocalStorage per-stack).
#       Every case swaps in a `:memory:` DB via the test hatch.
#     • scripts/check-no-raw-now.ts (UPDATED) — wedge log extended.
#       Guard STILL runs in WARN mode. Fattest remaining wedges called
#       out: presence-hub.ts (6), live-decay.ts (5), cell-event-ledger
#       .ts (3), cell-heat.ts (3). Flip to `--error` after the next 2–3.
#     • package.json (UPDATED) — adds `test:collective-memory-clock`
#       convenience script, wires the new golden into `prebuild` right
#       after `test:api-stamp-golden` (the adjacent seam-golden arm).
#     • AGENTS.md (UPDATED) — bumps remaining raw-callsite tally from
#       100 to 80, names the next wedge targets.
#
#   Infrastructure deltas this sprint: NONE.
#     No new RUNTIME env vars (the clock seam + AsyncLocalStorage middle-
#     ware already ship since v169). No new ports, services, named
#     volumes, or docker networks. Every new/modified file lives under
#     paths the Dockerfile already COPY-s wholesale:
#       `COPY src/ ./src/`      (captures collectiveMemory.ts + the new
#                                collectiveMemory.clock.test.ts + the
#                                new `src/lib/__fixtures__/` directory)
#       `COPY scripts/ ./scripts/` (captures check-no-raw-now.ts)
#     The new golden test runs inside `npm run build` via `prebuild`, so
#     a drift in the collective-memory seam fails the image build BEFORE
#     the container ever starts — this script never gets to `docker run`.
#     The `check-no-raw-now` guard still runs in WARN mode — raw callsite
#     tally drops 100 → 80 this sprint; after 2–3 more wedges (presence-
#     hub, live-decay, cell-event-ledger, cell-heat) it flips to --error
#     and collectivememory-style regressions become a hard image-build
#     failure here, not a runtime surprise.
#
# ── Startup sequence ─────────────────────────────────────────────────────
#   1. Truncate deployment.log and tee all subsequent output into it.
#   2. Stop + remove any previous container (idempotent).
#   3. Ensure named volumes exist (data dir + SQLite collective memory).
#   4. Build the Docker image (prebuild guards + tests run inside
#      `npm run build` — any drift fails the build).
#   5. Start the new container on 7100, wiring secrets from .env.
#   6. Poll until Docker reports the container as running.
#   7. Post-boot admin sweeps (deadline + OTS upgrade), if ADMIN_SECRET set.
#   8a. Warm the citation trilogy — /api/docs SSR, /api/docs/cite terminal
#       mouth, and /api/metrics/cited-cells.
#   8b. Warm the v169 verify surfaces — /api/verify-bundle/<slug> + /verify.
#   8c. Warm the v170 stamped-JSON surfaces — /api/stage-counts (canonical
#       jsonStamped() use) and /api/leaderboard (jsonStamped + one-sprint
#       `generatedAt` alias); smoke-test the `computedAt` field shape.
#   8d. Warm the v172 collective-memory clock-seam runtime via
#       /api/ghost-echoes (calls getRevivalTimeline → cutoffMs(now(),…));
#       proves the middleware pin reaches the heavy DB module in prod.
#   9.  Prune dangling images from previous builds.

set -euo pipefail

CONTAINER_NAME="persona-blog-a"
IMAGE_NAME="persona-blog-a"
HOST_PORT=7100
CONTAINER_PORT=7100
DATA_VOLUME="persona-blog-a-data"
SQLITE_VOLUME="persona-blog-a-sqlite"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/deployment.log"

# ── 1. Reset deployment.log; tee stdout + stderr for full traceability ──────
: > "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "==> [deploy] Starting deployment of ${CONTAINER_NAME} at $(date)"

# ── 2. Stop & remove existing container (idempotent) ────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> [deploy] Stopping existing container: ${CONTAINER_NAME}"
  docker stop --time 15 "${CONTAINER_NAME}" || true
  echo "==> [deploy] Removing existing container: ${CONTAINER_NAME}"
  docker rm --force "${CONTAINER_NAME}" || true
fi

# ── 3. Ensure named data volumes exist (data dir + SQLite collective memory) ─
echo "==> [deploy] Ensuring data volume: ${DATA_VOLUME}"
docker volume create "${DATA_VOLUME}" || true
echo "==> [deploy] Ensuring SQLite volume: ${SQLITE_VOLUME}"
docker volume create "${SQLITE_VOLUME}" || true

# ── 4. Build Docker image ────────────────────────────────────────────────────
# `npm run build` inside the builder stage runs the full prebuild chain:
#   check-token-compliance --guard  →  check-motion-sanctuary  →
#   check-ds-kbd  →  check-no-chip-lit-in-arrival  →
#   check-citation-delegation  →  check-duration-reasons  →
#   check-stage-tempo-divergence  →
#   check-no-raw-now (v169 NINTH guard — WARN mode; flags raw Date.now()
#     / new Date() outside the clock seam allowlist. Tally drops 100→80
#     this sprint after the collectiveMemory.ts wedge; flip to --error
#     once 2–3 more small wedges land: presence-hub (6), live-decay (5),
#     cell-event-ledger (3), cell-heat (3))  →
#   check-verify-bundle (v169 TENTH guard — freezes the VerifyBundleDto
#     wire shape across the API + SSR page)  →
#   check-user-journey (v168 EIGHTH guard, expanded v169 — seven-step
#     submit → read → endanger journey dispatched through the real
#     APIRoute handlers in-process, hermetic :memory: SQLite)  →
#   test:keep-hotkey → test:keep-legend → test:chip-lit → test:arrival →
#   test:citation-golden → test:journey-golden →
#   test:api-stamp-golden (v170 — proves jsonStamped's six napkin
#     acceptance properties: shape, pin identity within scope, nested-
#     scope isolation, body preservation, seam-overrides-caller, cross-
#     handler parity)  →
#   test:collective-memory-clock (v172 NEW — nine-section golden locking
#     the collectiveMemory.ts wedge: (0) fixture sanity, (1) pure
#     rateWindowOpen/cutoffMs edges, (2) stamps land on pinned clock,
#     (3) rate-limit windows deterministic under withClock, (4) velocity
#     cutoffs route through the seam, (5) daily-count bucket keys off
#     pinned today, (6) visitor-trust aging relative to the pin, (7)
#     pruneRateLimits uses pinned cutoff, (8) parallel withClock scopes
#     don't cross-contaminate. Runs against a :memory: DB swapped in via
#     __setSharedDbForTests — zero disk I/O. A drift in the collective-
#     memory seam fails the image build here, never reaches this script)
#     →
#   test:citation-delegation → test:duration-reasons →
#   test:stage-ease → test:stage-tempo → test:stage-tempo-divergence  →
#   astro build.
# Any guard failure fails the image build, fails this script, and leaves
# the previous container already stopped — operator re-runs after the fix.
echo "==> [deploy] Building Docker image: ${IMAGE_NAME}"
docker build \
  --pull \
  --no-cache \
  --tag "${IMAGE_NAME}" \
  "${SCRIPT_DIR}"

# ── 5. Run the new container ─────────────────────────────────────────────────
# Secrets are read from .env on the host (never baked into the image).
# GITHUB_PAT and DISPUTE_QUORUM_RATIO are optional — only forwarded when
# present in .env (keeps the default off-path clean).
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

# ── 6. Poll until Docker reports the container as running ──────────────────
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

# ── 7a. Post-boot deadline sweep ────────────────────────────────────────────
# Clears any expired drafts/stances that slipped past the last run. Safe
# to call on every redeploy; no-op when nothing is ripe.
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

# ── 7b. OTS upgrade sweep ───────────────────────────────────────────────────
# Upgrades a bounded batch of OpenTimestamps proofs from calendar receipts
# to fully-verified Bitcoin anchors whenever the calendar has caught up.
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

# ── 8a. Cited-cell warm-up — SSR page + metrics endpoint + terminal mouth ──
# Warms all three surfaces of the cited-cell story so the first real visitor
# (browser OR terminal) never pays a cold-start cost AND the ledger schema
# is eager-created before the first beacon arrives. v170 also routes the
# docs SSR through the clock seam (`now()` from src/lib/clock.ts).
echo "==> [deploy] Warming up /api/docs SSR (cited-cell heat + v165 tempo axis: shape × five distinct durations)…"
DOCS_STATUS=$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
echo "==> [deploy] /api/docs SSR warm-up: HTTP ${DOCS_STATUS}"

# Terminal mouth smoke-test. A real (axis, stage) pair from the 7×5
# product exercises the happy path (200 text/plain, non-empty body).
echo "==> [deploy] Warming up /api/docs/cite terminal mouth…"
CITE_BODY_FILE="$(mktemp)"
CITE_STATUS=$(curl --silent --show-error --output "${CITE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: text/plain" \
  "http://localhost:${HOST_PORT}/api/docs/cite?axis=typography&stage=fresh" \
  || echo '000')
CITE_BODY_LEN=$(wc -c < "${CITE_BODY_FILE}" | tr -d ' ')
CITE_BODY_PREVIEW=$(head -c 160 "${CITE_BODY_FILE}" | tr '\n' ' ')
rm -f "${CITE_BODY_FILE}"
echo "==> [deploy] /api/docs/cite warm-up: HTTP ${CITE_STATUS} · body=${CITE_BODY_LEN}B · preview=\"${CITE_BODY_PREVIEW}\""
if [ "${CITE_STATUS}" != "200" ] || [ "${CITE_BODY_LEN}" = "0" ]; then
  echo "==> [deploy] ⚠ Terminal mouth did not respond 200 with a body — investigate (container still up)." >&2
fi

echo "==> [deploy] Warming up cell-metrics endpoint…"
METRICS_RESPONSE=$(curl --silent --show-error --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/metrics/cited-cells" \
  || echo '{"error":"curl failed"}')
echo "==> [deploy] Cell-metrics baseline: ${METRICS_RESPONSE}"

# ── 8b. Verify-bundle warm-up (v169) — API + SSR page parity ──────────────
echo "==> [deploy] Warming up /api/verify-bundle endpoint (v169 TENTH guard runtime)…"
VERIFY_BUNDLE_BODY_FILE="$(mktemp)"
VERIFY_BUNDLE_STATUS=$(curl --silent --show-error --output "${VERIFY_BUNDLE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/verify-bundle/warmup-demo" \
  || echo '000')
VERIFY_BUNDLE_BODY_LEN=$(wc -c < "${VERIFY_BUNDLE_BODY_FILE}" | tr -d ' ')
VERIFY_BUNDLE_PREVIEW=$(head -c 200 "${VERIFY_BUNDLE_BODY_FILE}" | tr '\n' ' ')
rm -f "${VERIFY_BUNDLE_BODY_FILE}"
echo "==> [deploy] /api/verify-bundle/warmup-demo: HTTP ${VERIFY_BUNDLE_STATUS} · body=${VERIFY_BUNDLE_BODY_LEN}B · preview=\"${VERIFY_BUNDLE_PREVIEW}\""
if [ "${VERIFY_BUNDLE_STATUS}" != "200" ] || [ "${VERIFY_BUNDLE_BODY_LEN}" = "0" ]; then
  echo "==> [deploy] ⚠ Verify-bundle endpoint did not respond 200 with a body — investigate (container still up)." >&2
fi

echo "==> [deploy] Warming up /verify SSR page…"
VERIFY_PAGE_STATUS=$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/verify?slug=warmup-demo" \
  || echo '000')
echo "==> [deploy] /verify SSR warm-up: HTTP ${VERIFY_PAGE_STATUS}"
if [ "${VERIFY_PAGE_STATUS}" != "200" ]; then
  echo "==> [deploy] ⚠ /verify page did not respond 200 — investigate (container still up)." >&2
fi

# ── 8c. Stamped-JSON warm-up (v170) — runtime smoke-test of jsonStamped ───
# The prebuild golden (src/lib/api-stamp-golden.test.ts) already proved the
# seam's six acceptance properties at image-build time. This runtime probe
# just hits two canonical consumers and asserts the stamped field is on the
# wire so a broken middleware (clock pin not propagated into the handler)
# surfaces in deployment.log immediately — not during the first visitor.
#
#   (a) GET /api/stage-counts — pure `jsonStamped({ ...counts })` use. No
#       alias, no compatibility layer — the wire shape is `{ live, ripe,
#       fading, endangered, graveyard, computedAt }`. We grep the response
#       for `"computedAt":"` to prove the seam actually stamped it.
#   (b) GET /api/leaderboard — `jsonStamped(...)` + one-sprint `generatedAt`
#       alias. Both fields must appear this sprint (external RSS/embed
#       consumers depend on `generatedAt` until 2026-05 per Mike §PoI-2).
echo "==> [deploy] Warming up /api/stage-counts (v170 jsonStamped canonical)…"
STAGE_BODY_FILE="$(mktemp)"
STAGE_STATUS=$(curl --silent --show-error --output "${STAGE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/stage-counts" \
  || echo '000')
STAGE_BODY_LEN=$(wc -c < "${STAGE_BODY_FILE}" | tr -d ' ')
STAGE_BODY_PREVIEW=$(head -c 240 "${STAGE_BODY_FILE}" | tr '\n' ' ')
STAGE_HAS_STAMP=$(grep -c '"computedAt":"' "${STAGE_BODY_FILE}" || true)
rm -f "${STAGE_BODY_FILE}"
echo "==> [deploy] /api/stage-counts: HTTP ${STAGE_STATUS} · body=${STAGE_BODY_LEN}B · computedAt-hits=${STAGE_HAS_STAMP} · preview=\"${STAGE_BODY_PREVIEW}\""
if [ "${STAGE_STATUS}" != "200" ] || [ "${STAGE_HAS_STAMP}" -lt 1 ]; then
  echo "==> [deploy] ⚠ stage-counts missing jsonStamped seam output — investigate (container still up)." >&2
fi

echo "==> [deploy] Warming up /api/leaderboard (v170 jsonStamped + generatedAt alias)…"
LB_BODY_FILE="$(mktemp)"
LB_STATUS=$(curl --silent --show-error --output "${LB_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/leaderboard" \
  || echo '000')
LB_BODY_LEN=$(wc -c < "${LB_BODY_FILE}" | tr -d ' ')
LB_HAS_STAMP=$(grep -c '"computedAt":"' "${LB_BODY_FILE}" || true)
LB_HAS_ALIAS=$(grep -c '"generatedAt":"' "${LB_BODY_FILE}" || true)
rm -f "${LB_BODY_FILE}"
echo "==> [deploy] /api/leaderboard: HTTP ${LB_STATUS} · body=${LB_BODY_LEN}B · computedAt-hits=${LB_HAS_STAMP} · generatedAt-hits=${LB_HAS_ALIAS}"
if [ "${LB_STATUS}" != "200" ] || [ "${LB_HAS_STAMP}" -lt 1 ] || [ "${LB_HAS_ALIAS}" -lt 1 ]; then
  echo "==> [deploy] ⚠ leaderboard missing expected stamp or alias — investigate (container still up)." >&2
fi

# ── 8d. Collective-memory clock-seam warm-up (v172) ────────────────────────
# The v172 wedge migrates 20 raw Date.now()/new Date() callsites in
# `src/lib/collectiveMemory.ts` through `now()` / `nowDate()` / `nowISO()`
# from `src/lib/clock.ts`. The prebuild golden
# (`src/lib/collectiveMemory.clock.test.ts`) already hermetically proves
# the seam's acceptance properties at image-build time against a :memory:
# DB. This runtime probe hits a real read-through surface — the
# `/api/ghost-echoes` endpoint calls `getRevivalTimeline(slug)`, which
# now computes its cutoff via `cutoffMs(now(), windowWeeks * 7 * DAY_MS)`
# — so if the middleware pin ever failed to reach the DB module in
# production, the response would throw or 500 here instead of surfacing
# during the first real visitor's sparkline render.
#
# Probe is intentionally lightweight: a slug that doesn't exist yields a
# well-formed empty-timeline JSON (total:0, lastAt:null). We just assert
# HTTP 200 + non-empty body + the `buckets` field shape.
echo "==> [deploy] Warming up /api/ghost-echoes (v172 collectiveMemory clock seam runtime)…"
GHOST_BODY_FILE="$(mktemp)"
GHOST_STATUS=$(curl --silent --show-error --output "${GHOST_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/ghost-echoes?slug=warmup-demo" \
  || echo '000')
GHOST_BODY_LEN=$(wc -c < "${GHOST_BODY_FILE}" | tr -d ' ')
GHOST_HAS_BUCKETS=$(grep -c '"buckets":' "${GHOST_BODY_FILE}" || true)
GHOST_BODY_PREVIEW=$(head -c 200 "${GHOST_BODY_FILE}" | tr '\n' ' ')
rm -f "${GHOST_BODY_FILE}"
echo "==> [deploy] /api/ghost-echoes: HTTP ${GHOST_STATUS} · body=${GHOST_BODY_LEN}B · buckets-hits=${GHOST_HAS_BUCKETS} · preview=\"${GHOST_BODY_PREVIEW}\""
if [ "${GHOST_STATUS}" != "200" ] || [ "${GHOST_HAS_BUCKETS}" -lt 1 ]; then
  echo "==> [deploy] ⚠ ghost-echoes did not respond 200 with buckets — collectiveMemory seam may not be wired (container still up)." >&2
fi

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

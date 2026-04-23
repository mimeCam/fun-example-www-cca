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
# ── Sprint v163 (2026-04-22) — "Stage Tempo Divergence" (widens v162) ──
#   v162 guarded the shape half of each stage's felt tempo (a bespoke
#   cubic-bezier per stage, with a JND floor on every pair). v163
#   widens that guard to the FULL joint metric — 5-D Euclidean distance
#   over `(x1, y1, x2, y2, durationMs · τ)` — so diagonal cancellation
#   (ease drift ⊕ duration drift) is caught in the same test. Atomic
#   rename: `check-stage-ease-divergence` → `check-stage-tempo-divergence`.
#   Guard count stays at 7 (Mike napkin v163 §"widen, don't mint").
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/stage-tempo.ts (NEW) — the 5-D oracle. Exports
#       `STAGE_TEMPO_VECTORS` (Record<DecayStage, Tempo5>), `TAU`,
#       `SNAP_MS`, `TEMPO_JND_FLOOR`, `tempoDivergence`, `stagePairs`,
#       `minTempoDivergence`, `composeTempo`. Pure data + arithmetic.
#       Imports `STAGE_EASE_CURVES` and `stagePairs` from stage-ease.ts
#       so the 4-D shape half is single-source (no duplication). Day-one
#       invariance: with every stage at SNAP_MS=120ms, TAU=1/120 makes
#       the duration coord collinear → 5-D reduces to 4-D → byte-stable.
#     • src/lib/stage-tempo.test.ts (NEW) — 41 tests. Collinear-
#       invariance proof (5-D === 4-D on today's tokens), diagonal-
#       cancellation fixture (v162's 4-D sees 0, v163's 5-D sees 1.0),
#       strict-dominance invariant across all pairs, JND floor proof.
#     • scripts/check-stage-tempo-divergence.ts (RENAMED from
#       check-stage-ease-divergence.ts, +widened). Scans both
#       `--stage-*-ease` AND `--stage-*-duration` declarations in
#       tokens.css; resolves one hop of `var()` aliases via the shared
#       polymorphic `motionTokenResolver(prefix, …bodies)` helper —
#       one scanner, two axes (Sid §"polymorphism is a killer").
#       Emits per-breach diagnostics for ease-missing / ease-parity /
#       ease-alias / duration-missing / duration-parity / tempo-jnd.
#       Strips `@media (prefers-reduced-motion: reduce)` blocks before
#       resolution so the accessibility 0ms override doesn't leak.
#     • scripts/check-stage-tempo-divergence.test.ts (RENAMED + widened)
#       — 25 tests including the non-negotiable diagonal-cancellation
#       fixture (Paul §): pair with identical ease, 120ms-vs-240ms
#       duration; v162 sees 0, v163 sees 1.0 — strict dominance.
#     • src/lib/stage-ease.ts (UPDATED — doc-only) — comment now
#       directs readers to stage-tempo.ts for the joint oracle. The
#       module itself (the 4-D shape oracle) is UNCHANGED so every
#       v162 import site compiles byte-for-byte.
#     • AGENTS.md (UPDATED) — Prebuild-guards line now reads
#       "… duration-reasons · stage-tempo-divergence" (guard count 7).
#     • package.json (UPDATED) — `prebuild` chain swaps
#       `check-stage-ease-divergence.ts` for `check-stage-tempo-
#       divergence.ts` AND adds `--test src/lib/stage-tempo.test.ts`.
#       New top-level aliases: `check:stage-tempo-divergence`,
#       `test:stage-tempo`, `test:stage-tempo-divergence`. The old
#       `check:stage-ease-divergence` / `test:stage-ease-divergence`
#       aliases are gone; `test:stage-ease` stays (4-D oracle tests).
#
#   Infrastructure deltas this sprint: NONE.
#     No new env vars, ports, services, named volumes, or docker
#     networks. The new + renamed files (`src/lib/stage-tempo.ts`,
#     `scripts/check-stage-tempo-divergence.ts`, and their `.test.ts`
#     siblings) land inside paths the Dockerfile already COPY-s
#     wholesale (`COPY src/ ./src/` + `COPY scripts/ ./scripts/`),
#     so no Dockerfile edit is required. The prebuild chain picks up
#     the renamed guard automatically via `package.json`. Drift fails
#     the image build, fails this script, and leaves the previous
#     container already-stopped — operator re-runs after the fix.
#
# ── Startup sequence ─────────────────────────────────────────────────────
#   1. Truncate deployment.log and tee all subsequent output into it.
#   2. Stop + remove any previous container (idempotent).
#   3. Ensure named volumes exist (data dir + SQLite collective memory).
#   4. Build the Docker image (prebuild guards run inside `npm run build`).
#   5. Start the new container on 7100, wiring secrets from .env.
#   6. Poll until Docker reports the container as running.
#   7. Post-boot admin sweeps (deadline + OTS upgrade), if ADMIN_SECRET set.
#   8. Warm the citation trilogy — /api/docs SSR, /api/docs/cite terminal
#      mouth, and /api/metrics/cited-cells — so the first real visitor
#      (or curl) never pays a cold-start cost.
#   9. Prune dangling images from previous builds.

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
#   check-stage-tempo-divergence (v163 WIDENED — asserts byte parity
#     between STAGE_EASE_CURVES + STAGE_TEMPO_VECTORS in src/lib/ and
#     the --stage-{stage}-ease + --stage-{stage}-duration literals in
#     src/styles/tokens.css, plus the 5-D Euclidean JND floor on every
#     unordered pair; reduces to v162 behaviour on today's collinear
#     durations)  →
#   test:keep-hotkey  →  test:keep-legend  →  test:chip-lit  →
#   test:arrival  →  test:citation-golden  →
#   test:citation-delegation  →  test:duration-reasons  →
#   test:stage-ease (v162 — 5 curves distinct + 4-D pair divergence ≥
#     JND floor)  →
#   test:stage-tempo (v163 — 5-D joint oracle: collinear invariance,
#     diagonal-cancellation fixture, strict dominance over v162)  →
#   test:stage-tempo-divergence (v163 — scanner + parity + JND
#     reporter fixtures for the widened guard)  →
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

# ── 8. Cited-cell warm-up — SSR page + metrics endpoint + terminal mouth ──
# Warms ALL THREE surfaces of the cited-cell story so the first real
# visitor (browser OR terminal) never pays a cold-start cost AND the
# ledger schema is eager-created before the first beacon arrives:
#
#   (a) GET /api/docs — SSR on demand. Hydrates @astrojs/node's route
#       handler, reads the cell heat map, and tints all 35 grammar-
#       matrix cells. As of v162 the tempo axis of the 7×5 product is
#       five distinct cubic-bezier curves (one felt tempo per decay
#       stage), mirrored byte-for-byte between src/lib/stage-ease.ts
#       and src/styles/tokens.css — the prebuild guard above asserts
#       that parity on every Docker build, so warming this route is
#       ALSO the runtime smoke-test that the cascade resolves the
#       per-stage ease correctly.
#
#   (b) GET /api/docs/cite — terminal/`curl` mouth. Sends a hand-shaped
#       (axis, stage) pair and asserts a 200 response with a non-empty
#       body. Warms the route's import graph and proves the wire
#       contract holds end-to-end: the Node entry hydrates,
#       `cellCitationPayload()` emits bytes, and the HTTP surface
#       agrees with the SSR mouth. Query shape:
#       `?axis=typography&stage=fresh` — a real valid cell from the
#       7×5 product so the happy path really is exercised (never a
#       4xx).
#
#   (c) GET /api/metrics/cited-cells — read-only, unauthenticated; same
#       single producer (`heatedGrid()`) the SSR page uses. Forces
#       `ensureSchema()` on the ledger module, creating `cell_events`
#       + indexes on the SQLite volume the very first deploy.
echo "==> [deploy] Warming up /api/docs SSR (cited-cell heat + v162 tempo axis)…"
DOCS_STATUS=$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
echo "==> [deploy] /api/docs SSR warm-up: HTTP ${DOCS_STATUS}"

# Terminal mouth smoke-test. A real (axis, stage) pair from the 7×5
# product exercises the happy path (200 text/plain, non-empty body).
# `typography × fresh` is a canonical pairing used elsewhere in the test
# suite (REF_FIXTURE_AXIS/STAGE in citation-golden.ts), so the curl
# output is predictable for post-mortem inspection of deployment.log.
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

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

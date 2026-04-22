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
# ── Sprint v159 (2026-04-22) — Duration Reasons: verdict-ceremony joins ────
#   What shipped in the active git area this cycle (staged/unstaged):
#     • scripts/check-duration-reasons.ts (UPDATED) — `TARGET_FILES`
#       widened from `[tokens.css, motion.css]` to
#       `[tokens.css, motion.css, verdict-ceremony.css]`
#       (Krystle / Paul / Mike napkin v159). The ledger now enforces the
#       reason-citation rule across all three design-system CSS sources;
#       every literal `ms`/`s` in any of them must cite a label from
#       `scripts/lib/duration-reasons.ts` (aliases inherit; the
#       reduced-motion mask from v158 still exempts accessibility
#       overrides). Header docblock rewritten from "both" → "all" and
#       updated to name verdict-ceremony.css explicitly.
#     • scripts/check-duration-reasons.test.ts (UPDATED) — two new
#       assertions: (1) a `TARGET_FILES` ledger test that locks in
#       `src/styles/verdict-ceremony.css` as a tracked scope entry, and
#       (2) a new describe block running the guard against the live
#       `src/styles/verdict-ceremony.css` and asserting zero violations
#       (same `assertLiveFileClean()` helper introduced in v158).
#     • src/styles/verdict-ceremony.css (UPDATED) — the `data-act="1"`
#       base delay (`--act-delay: 0ms`) now carries a `/* reason: snap */`
#       comment sourced from the closed vocabulary, satisfying the newly
#       widened guard. No new tokens, no new timing — only an annotation.
#       (Acts 2 and 3 cite existing `var(--motion-ceremony-duration)` /
#       `var(--duration-bloom)` aliases and inherit their reasons.)
#     • AGENTS.md (UPDATED) — Contracts line widened: the parenthetical
#       now reads "tokens.css · motion.css · verdict-ceremony.css".
#       Guard line unchanged (`duration-reasons` already on the list
#       since v156); scope is what moved, again.
#
#   Infrastructure deltas this sprint: NONE.
#     No new env vars, ports, services, volumes, or docker networks.
#     Dockerfile already COPY-s `scripts/` and `src/` wholesale into the
#     builder stage, so the widened guard (extended `TARGET_FILES`
#     array, two new test assertions, and the annotated
#     `src/styles/verdict-ceremony.css`) all ship without a single
#     Dockerfile edit or docker-run-flag edit. `package.json` was
#     untouched — the prebuild chain link added in v156
#     (`check-duration-reasons`) automatically runs the widened guard.
#     Drift in tokens.css OR motion.css OR verdict-ceremony.css fails
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
#   8. Warm the /api/docs SSR route + /api/metrics/cited-cells so the
#      first real visitor never pays a cold-start cost.
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
#   check-ds-kbd  →  check-no-chip-lit-in-arrival (v154)  →
#   check-citation-delegation (v155)  →  check-duration-reasons
#   (v156 tokens.css · v158 + motion.css · v158 reduced-motion exempt ·
#    v159 + verdict-ceremony.css)  →
#   test:keep-hotkey  →  test:keep-legend  →  test:chip-lit (v153)  →
#   test:arrival (v154)  →  test:citation-golden (v155)  →
#   test:citation-delegation (v155)  →  test:duration-reasons
#   (v158 — three new fixtures + live motion.css regression ·
#    v159 + live verdict-ceremony.css regression)  →
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

# ── 8. Cited-cell warm-up — SSR page + metrics endpoint ────────────────────
# Warms BOTH surfaces of the cited-cell story so the first real visitor
# never pays a cold-start cost AND the ledger schema is eager-created
# before the first beacon arrives:
#
#   (a) GET /api/docs — SSR on demand (`export const prerender = false`).
#       The first render hydrates @astrojs/node's route handler, reads
#       `lifetimeByCell()` + `ledgerMaturity()` + `baseline()`, and tints
#       all 35 grammar-matrix cells with `data-heat`. v153 ships the
#       `.ds-kbd[data-lit]` crossfade rule + Legend voice tokens;
#       v154 adds the `.cell--arrived-shared::after` `↙` glyph rule +
#       the extracted `arrival.ts` client module; v155 fences the
#       server-render mouth of the citation ritual on the oracle's
#       `cellCitationLabel` + `cellAnchorId` (prebuild-enforced, so
#       warming this route is ALSO the smoke-test that the three-mouth
#       parity held through the build); v156 adds the duration-reason
#       ledger — every literal-ms / literal-s token in tokens.css now
#       cites a label from the closed vocabulary, also prebuild-enforced.
#       All static assets baked into dist/client/ at build time, no
#       runtime cost to warming. The arrival beat only paints when a
#       visitor lands via `?r=<nonce>`, so this warm-up exercises the
#       SSR path only.
#
#   (b) GET /api/metrics/cited-cells — read-only, unauthenticated; same
#       single producer (`heatedGrid()`) the SSR page uses. Forces
#       `ensureSchema()` on the ledger module, creating `cell_events`
#       + indexes on the SQLite volume the very first deploy.
echo "==> [deploy] Warming up /api/docs SSR (cited-cell heat + legend stack)…"
DOCS_STATUS=$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
echo "==> [deploy] /api/docs SSR warm-up: HTTP ${DOCS_STATUS}"

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

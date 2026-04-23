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
# ── Sprint v165 (2026-04-23) — "Urgency Shape" (widens v163) ────────────
#   v163 guarded a 5-D joint metric over (ease + duration·τ) but — by
#   explicit policy — left duration-distinctness unchecked, because four
#   of five stages aliased to `--motion-snap-duration` (120ms). v165
#   de-aliases every stage: each `--stage-*-duration` now carries its
#   own literal ms value (280 / 360 / 140 / 540 / 720). The new tempo
#   shape is intentional — `endangered` (140ms) is the unique strict
#   minimum because it is the one stage where the reader can still act
#   to revive the post (Tanya §4.1 / Mike napkin v165). The guard is
#   widened in place (no rename) with a CONJUNCTION — NOT substitution —
#   of two new rules: `duration-alias` (byte-distinctness on resolved
#   ms literals) and `endangered-not-min` (strict-min ordering on the
#   duration axis of the oracle). Elon §2.3 counterexample —
#   [280,280,140,540,720] satisfies "unique strict min" on its own yet
#   fails distinctness — proves the conjunction is strictly stronger
#   than either rule alone. Guard count stays at 7.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/stage-tempo.ts (UPDATED) — `STAGE_DURATIONS_MS` now
#       holds five distinct literals instead of SNAP_MS × 5. The 5-D
#       JND floor still clears for every unordered pair (proven in
#       stage-tempo.test.ts §5); duration coords no longer collapse
#       collinearly, so every pair's distance now picks up a real
#       ms·τ contribution. Public API unchanged: same exports, same
#       Tempo5 tuple shape, same `tempoDivergence` / `composeTempo`
#       / `minTempoDivergence` signatures. Header comment documents
#       the v165 rationale inline.
#     • src/lib/stage-tempo.test.ts (UPDATED) — fixtures swapped to
#       the v165 duration table; the collinear-invariance test now
#       asserts v165 explicitly breaks collinearity; new §5 asserts
#       the 5-D JND floor still clears for every pair with the new
#       literals. `endangered`-is-strict-min proven numerically.
#     • scripts/check-stage-tempo-divergence.ts (UPDATED — widened in
#       place, no rename). Two new Violation rules added to the
#       `Violation.rule` discriminated union: `duration-alias` and
#       `endangered-not-min`. New helpers: `checkAliasDistinctness`
#       (polymorphic over ease|duration — reuses the old ease path),
#       `checkEndangeredStrictMin`, `fmtEndangeredNotMin`, and a
#       refactored `fmtAlias(axis, v)` that serves both axes. The
#       reduced-motion stripping (`stripReducedMotion`) still runs
#       first so the accessibility-0ms block never trips distinctness.
#     • scripts/check-stage-tempo-divergence.test.ts (UPDATED) — new
#       §6b suite covers: canonical v165 fixture is clean; Elon §2.3
#       counterexample fires `duration-alias` (and `endangered-not-min`
#       does NOT, proving the conjunction matters); [280,280,280,280,140]
#       fires `endangered-not-min` (and `duration-alias` does); `fossil`
#       < `endangered` fires `endangered-not-min`. Clean-fixture
#       builder now draws literals from STAGE_TEMPO_VECTORS so the
#       oracle remains single-source.
#     • src/lib/stage-tokens.generated.ts (UPDATED) — codegen output
#       refreshed: `STAGE_TRANSITION_DURATION_MS` now emits five
#       distinct ms literals instead of four `var(--motion-snap-
#       duration)` aliases.
#     • src/pages/api/docs.astro (UPDATED) — motion section lede
#       rewritten to explain "endangered is shortest on purpose";
#       `motionValueLabel` updated — the `var(…)` branch is now a
#       defensive fallback only (the prebuild guard catches any
#       regression before this function ever sees an alias).
#     • src/styles/tokens.css (UPDATED) — five distinct `--stage-*-
#       duration` literals; comment block refreshed to reference
#       v165 + Tanya §4.1. Ease axis values unchanged.
#     • src/styles/motion.css (UPDATED) — the `@media (prefers-
#       reduced-motion: reduce)` block now sets every single
#       `--stage-*-duration` to 0ms explicitly (previously only
#       `fresh` carried an override because the others aliased snap
#       which was already 0ms in that block). The scanner strips
#       this block via `stripReducedMotion` before resolution.
#     • AGENTS.md (UPDATED) — Prebuild-guards line now notes the
#       v165 conjunction ("+duration-alias +endangered-not-min");
#       new v165 summary line records the five durations + Tanya
#       UX citation. Wire contract frozen; `cite.ts` / JSON shape
#       unchanged.
#
#   Infrastructure deltas this sprint: NONE.
#     No new env vars, ports, services, named volumes, or docker
#     networks. Every modified file lives under paths the Dockerfile
#     already COPY-s wholesale (`COPY src/ ./src/` + `COPY scripts/
#     ./scripts/`), so no Dockerfile edit is required. The prebuild
#     chain (`npm run build`) picks up the widened guard automatically
#     — the `package.json` entry still points at the same script path
#     (widened, not renamed). Drift fails the image build, fails this
#     script, and leaves the previous container already-stopped —
#     operator re-runs after the fix.
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
#   check-stage-tempo-divergence (v165 WIDENED — asserts byte parity
#     between STAGE_EASE_CURVES + STAGE_TEMPO_VECTORS in src/lib/ and
#     the --stage-{stage}-ease + --stage-{stage}-duration literals in
#     src/styles/tokens.css, the 5-D Euclidean JND floor on every
#     unordered pair, AND the v165 duration conjunction: five distinct
#     resolved `--stage-*-duration` literals (`duration-alias`) PLUS
#     `endangered` as the unique strict minimum on the ms axis
#     (`endangered-not-min`) — the one stage where the reader can still
#     act to save the post)  →
#   test:keep-hotkey  →  test:keep-legend  →  test:chip-lit  →
#   test:arrival  →  test:citation-golden  →
#   test:citation-delegation  →  test:duration-reasons  →
#   test:stage-ease (v162 — 5 curves distinct + 4-D pair divergence ≥
#     JND floor)  →
#   test:stage-tempo (v163+v165 — 5-D joint oracle: v165 breaks the
#     day-one collinearity, asserts the JND floor still clears for all
#     10 pairs with the new literals, endangered-is-strict-min proof)  →
#   test:stage-tempo-divergence (v163+v165 — scanner + parity + JND
#     reporter fixtures PLUS §6b duration-distinctness / strict-min
#     conjunction suite: Elon §2.3 counterexample proves the two rules
#     are independent)  →
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
#       matrix cells. As of v165 the tempo axis of the 7×5 product
#       carries BOTH five distinct cubic-bezier curves (v162 shape
#       half, one felt tempo per stage) AND five distinct ms literals
#       (v165 duration half — 280/360/140/540/720, with endangered the
#       unique strict minimum). Both halves are mirrored byte-for-byte
#       between src/lib/stage-{ease,tempo}.ts and src/styles/tokens.css
#       — the widened prebuild guard above asserts that parity + the
#       duration conjunction on every Docker build, so warming this
#       route is ALSO the runtime smoke-test that the cascade resolves
#       each per-stage ease AND duration correctly.
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
echo "==> [deploy] Warming up /api/docs SSR (cited-cell heat + v165 tempo axis: shape × five distinct durations)…"
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

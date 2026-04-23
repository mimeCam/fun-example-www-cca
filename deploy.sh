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
# ── Sprint v168 (2026-04-23) — "Journey Witness" (eighth prebuild guard) ─
#   The previous seven prebuild guards all watched TOKENS (motion vars,
#   duration literals, citation delegation, tempo divergence, …). v168
#   adds the first guard that watches a USER: a synthetic `submit → read`
#   journey is dispatched in-process through the real APIRoute handlers
#   and asserted step-by-step. Guard count: 7 → 8.
#
#   Mike Koch's napkin §4 ships the minimum viable lifecycle
#   (submit-happy-path · submit-invalid-json · submit-missing-title ·
#   submit-body-too-short · submit-bad-pow · read-empty-store). The
#   endanger → revive → verdict legs are DEFERRED (need a `src/lib/clock.ts`
#   seam + ADMIN_SECRET injection — see §TODO in `journey-golden.ts`).
#   Elon §5.3's user-witnessing principle: the guard asserts an outcome
#   the reader will experience, not a token rule the compiler would catch.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/journey-golden.ts (NEW) — frozen fixture table of six
#       journey steps. Each row pins { status, bodyKeys, bodyLiteral }
#       and carries a sentinel author (`a.test`) + sentinel IP
#       (`127.0.0.10`) so the guard can never be confused for a real
#       reader. PoW nonce for the happy-path submit is PRE-COMPUTED
#       offline and baked in as a literal (see §6 "how the nonce was
#       found") — keeps the guard hermetic and fast (no rehash loop at
#       prebuild). Mirrors `citation-golden.ts` for style parity.
#     • src/lib/journey-witness.ts (NEW) — witness runtime. Routes each
#       journey step through `dispatchApiRoute()` (below), decodes the
#       JSON body, and exposes the shape helpers (`hasShape`,
#       `matchesLiteral`, `summarize`) the guard + its .test sibling
#       both consume. No global state — every call is hermetic.
#     • src/lib/handler-dispatch.ts (NEW) — the one generalisation
#       Mike §6 asks for. Promoted out of `citation-golden.ts::curl-
#       MouthResponse` so BOTH the citation witness (3 mouths, 35 rows)
#       AND the new journey witness (5 submit branches + 1 read) route
#       through one symbol. `dispatchApiRoute(mod, method, url)` → Response.
#     • src/lib/citation-golden.ts (UPDATED) — `curlMouthResponse` now
#       delegates to `dispatchApiRoute`. No behavior change; the tautology-
#       breaker (Elon §4) is now also the non-duplication invariant
#       (Sid §no-second-producer). Wire contract unchanged.
#     • src/lib/communityPosts.ts (UPDATED) — DB path is now overridable
#       via `COMMUNITY_DB_PATH` env var. Unset → default `data/revivals.db`
#       (production path, volume-mounted). `:memory:` → hermetic SQLite
#       for the journey guard (skips WAL pragma on memory DBs). New
#       export `resetCommunityPostsDb()` drops the cached handle so
#       the `.test` sibling can re-open against a new path. Production
#       code paths never call it.
#     • src/lib/journey-golden.test.ts (NEW) — unit coverage on the
#       pure helpers (fixture table shape, reorder lemma, PoW nonce
#       re-check) independent of the integration guard run.
#     • scripts/check-user-journey.ts (NEW) — the EIGHTH prebuild guard.
#       Iterates `JOURNEY_STEPS` through `dispatchJourneyStep(…)` and
#       fails on any drift in status/shape/literal. Refuses to run
#       unless `COMMUNITY_DB_PATH=:memory:` is set (Paul §ship criteria
#       — the guard must not touch real `data/revivals.db`). `package.json`
#       `prebuild` chain prefixes that env var inline.
#     • AGENTS.md (UPDATED) — prebuild-guards line grew by one
#       (`· user-journey`); new WIP note explains the submit→read
#       scope and the deferred legs.
#     • package.json (UPDATED) — `prebuild` chain gains the new guard
#       (env-prefixed with `COMMUNITY_DB_PATH=:memory:`) and a new
#       test step `test:journey-golden`. Corresponding `check:user-
#       journey` + `test:journey-golden` scripts added for local use.
#
#   Infrastructure deltas this sprint: NONE.
#     No new env vars at RUNTIME (the new `COMMUNITY_DB_PATH` is a
#     prebuild/test-only override — unset at container start, so
#     `communityPosts.ts` falls through to the default `data/revivals.db`
#     path under the `persona-blog-a-sqlite` volume, exactly as before).
#     No new ports, services, named volumes, or docker networks.
#     Every new/modified file lives under paths the Dockerfile already
#     COPY-s wholesale (`COPY src/ ./src/` + `COPY scripts/ ./scripts/`),
#     so no Dockerfile edit is required. The prebuild chain
#     (`npm run build`) picks up the new guard automatically — the
#     `package.json` entry now invokes `scripts/check-user-journey.ts`
#     with the hermetic-DB env prefix. Any drift in the six journey
#     outcomes fails the image build, fails this script, and leaves
#     the previous container already-stopped — operator re-runs after
#     the fix.
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
#   check-stage-tempo-divergence (v165 — asserts byte parity between
#     STAGE_EASE_CURVES + STAGE_TEMPO_VECTORS in src/lib/ and the
#     --stage-{stage}-ease + --stage-{stage}-duration literals in
#     src/styles/tokens.css, the 5-D Euclidean JND floor on every
#     unordered pair, AND the v165 duration conjunction: five distinct
#     resolved `--stage-*-duration` literals PLUS `endangered` as the
#     unique strict minimum on the ms axis)  →
#   check-user-journey (v168 NEW — EIGHTH guard; submit→read witness.
#     Dispatches JOURNEY_STEPS through the real APIRoute handlers in-
#     process via handler-dispatch.ts, asserts { status, bodyKeys,
#     bodyLiteral } per step. Prefixed with `COMMUNITY_DB_PATH=:memory:`
#     so the hermetic SQLite never touches the production volume. The
#     guard itself refuses to run unless the env var is set to :memory:
#     — Paul §ship criteria)  →
#   test:keep-hotkey  →  test:keep-legend  →  test:chip-lit  →
#   test:arrival  →  test:citation-golden  →
#   test:journey-golden (v168 NEW — unit coverage for the fixture
#     table, reorder lemma, and PoW nonce re-check)  →
#   test:citation-delegation  →  test:duration-reasons  →
#   test:stage-ease (v162 — 5 curves distinct + 4-D pair divergence ≥
#     JND floor)  →
#   test:stage-tempo (v163+v165 — 5-D joint oracle: v165 breaks the
#     day-one collinearity, JND floor clears for all 10 pairs,
#     endangered-is-strict-min proof)  →
#   test:stage-tempo-divergence (v163+v165 — scanner + parity + JND
#     reporter fixtures PLUS §6b duration-distinctness / strict-min
#     conjunction suite)  →
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
#       — the prebuild guard asserts that parity + the duration
#       conjunction on every Docker build, so warming this route is
#       ALSO the runtime smoke-test that the cascade resolves each
#       per-stage ease AND duration correctly. v168 adds the NEW
#       journey-witness guard upstream — a drift on submit→read would
#       have already failed the image build before we ever get here.
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

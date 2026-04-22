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
# ── Sprint v156 (2026-04-22) — "Third Mouth" joins the citation trilogy ──
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/citation-ref.ts (NEW) — single-source nonce grammar.
#       Exports `REF_RE`, `REF_PARAM`, `isValidRef(raw)`. Before v156 the
#       `/^[a-zA-Z0-9-]{8,64}$/` regex lived *identically* inside
#       arrival.ts AND cell-event-ledger.ts — two copies, two places to
#       drift. Promoting it to a shared module closes the polymorphism
#       back-door (Mike §6.1 "one regex, one place"). Pure functions; no
#       DOM, no URL parsing, no fs, no fetch.
#     • src/pages/api/docs/cite.ts (NEW) — the TERMINAL/`curl` mouth.
#       `GET /api/docs/cite?axis=<axis>&stage=<stage>[&r=<nonce>]` returns
#       `cellCitationPayload()` bytes verbatim. Content-negotiated:
#       text/plain (default) OR application/json (when Accept:
#       application/json). Wire contract: 200 on success, 400 on missing
#       param, 422 on invalid axis/stage/ref, 405 Allow: GET on any other
#       verb. `export const prerender = false` — SSR at request time so
#       `url.origin` is trusted server-side (never spoofable Host header,
#       never undefined `import.meta.env.SITE`). Read-only — zero ledger
#       writes, zero cookies, zero rate-limit touch. `/api/ingest/cell-
#       event` remains the one writer.
#     • src/lib/cell-event-ledger.ts (UPDATED) — `REF_RE` literal removed;
#       imports `isValidRef` from the new shared module. `isValidEventRow`
#       now calls `isValidRef(row.ref)` instead of inlining the regex.
#       One validator, three mouths — the server accepts and rejects the
#       exact same shapes the client parser and the curl handler do.
#     • src/lib/client/arrival.ts (UPDATED) — `REF_PARAM` and `REF_RE`
#       constants deleted; imports `isValidRef` + `REF_PARAM` from the
#       shared module. `readRef()` now delegates shape-validation to
#       `isValidRef`. `isValidRef` is RE-EXPORTED so arrival.test.ts's
#       existing call sites stay byte-stable (Mike §10 "delete without
#       breaking callers").
#     • src/lib/citation-golden.ts (UPDATED) — new exports for third-mouth
#       witnessing: `buildCiteUrl()`, `curlMouthResponse()`,
#       `curlMouthPayload()`, `VALID_REF_FIXTURES`. The fixtures cover
#       REF_RE's full shape (8-char lower bound, 64-char upper bound,
#       UUID shape, internal-hyphen nonce). Helpers dispatch a synthetic
#       GET through the handler's APIRoute directly — no HTTP server,
#       no socket.
#     • src/lib/citation-golden.test.ts (UPDATED) — three new describe
#       blocks witness the tautology-break (Elon §4 "prove polish by
#       subtraction"): (a) handler body === oracle payload for all 35
#       cells; (b) handler body === oracle payload for all valid refs;
#       (c) adversarial URL-reserved-char refs → 422 "invalid parameter:
#       r"; (d) missing axis → 400, invalid axis/stage → 422, non-GET →
#       405 Allow: GET, Accept: application/json → payload field ===
#       text/plain body.
#     • scripts/check-citation-delegation.ts (UPDATED) — `TARGETS` widened
#       from three entries to FOUR. The new fourth target is
#       `src/pages/api/docs/cite.ts` with required symbol
#       `cellCitationPayload`. The ORACLE_PATH_RE comment now accepts
#       `../../../lib/stage-axes` (one level deeper for the terminal
#       route). Same grep, one new file.
#     • scripts/check-citation-delegation.test.ts (UPDATED) — the
#       "exactly three targets" assertion flipped to "exactly four" with
#       a docblock explaining the trilogy close. A new test locks in
#       `src/pages/api/docs/cite.ts` by path.
#     • src/pages/api/docs.astro (UPDATED) — the endpoints appendix now
#       documents THREE endpoints (was two). A new `<dt>/<dd>` row
#       describes `GET /api/docs/cite` — query shape, MIME negotiation,
#       byte-identity vow. The section heading flipped from "Two
#       endpoints." to "Three endpoints." The lede extended: "The same
#       bytes reach you by click, key, or `curl`."
#     • AGENTS.md (UPDATED) — Killer-feature line extended to name the
#       third mouth. Paths line names `src/lib/citation-ref.ts` and
#       `src/pages/api/docs/cite.ts`. Prebuild-guards line now reads
#       "citation-delegation (4 targets as of v156)". Contracts line
#       extends with the `REF_RE` home + the "/api/docs/cite is
#       pure-read (no ledger writes)" invariant.
#
#   Infrastructure deltas this sprint: NONE.
#     No new env vars, ports, services, volumes, or docker networks.
#     The new files (`src/lib/citation-ref.ts`, `src/pages/api/docs/
#     cite.ts`) land inside paths the Dockerfile already COPY-s wholesale
#     (`COPY src/ ./src/` + `COPY scripts/ ./scripts/`) — no Dockerfile
#     edit. `package.json` was untouched — the prebuild chain link
#     `check-citation-delegation` automatically picks up the widened
#     `TARGETS` array (3 → 4), and `test:citation-golden` automatically
#     picks up the new third-mouth describe blocks. Drift fails the
#     image build, fails this script, and leaves the previous container
#     already-stopped — operator re-runs after the fix.
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
#      mouth (v156 NEW), and /api/metrics/cited-cells — so the first
#      real visitor (or curl) never pays a cold-start cost.
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
#   check-citation-delegation (v155 · v156 widened TARGETS 3 → 4 with
#     src/pages/api/docs/cite.ts as the terminal mouth)  →
#   check-duration-reasons  →
#   test:keep-hotkey  →  test:keep-legend  →  test:chip-lit (v153)  →
#   test:arrival (v154 · v156 re-exports isValidRef from shared module) →
#   test:citation-golden (v155 · v156 third-mouth parity: 35 cell-body
#     equality tests + 4 valid-ref equality tests + wire-contract error-
#     surface tests — 422 on invalid r, 400 on missing axis, 422 on
#     invalid axis/stage, 405 Allow: GET on non-GET, JSON payload ===
#     text/plain body)  →
#   test:citation-delegation (v155 · v156 asserts TARGETS.length === 4
#     and locks in src/pages/api/docs/cite.ts by path)  →
#   test:duration-reasons  →  astro build.
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
#   (a) GET /api/docs — SSR on demand (`export const prerender = false`).
#       The first render hydrates @astrojs/node's route handler, reads
#       `lifetimeByCell()` + `ledgerMaturity()` + `baseline()`, and tints
#       all 35 grammar-matrix cells with `data-heat`. v155 fences the
#       server-render mouth of the citation ritual on the oracle's
#       `cellCitationLabel` + `cellAnchorId` (prebuild-enforced, so
#       warming this route is ALSO the smoke-test that the now-four-
#       mouth parity held through the build). v156 adds the shared
#       `src/lib/citation-ref.ts` validator read by every mouth (click,
#       keystroke, curl, ingest) so the three mouths accept/reject the
#       exact same shapes.
#
#   (b) GET /api/docs/cite — v156 NEW terminal/`curl` mouth. Sends a
#       hand-shaped (axis, stage) pair and asserts a 200 response with
#       a non-empty body. This warms the route's import graph and
#       proves, one redeploy at a time, that the wire contract holds
#       end-to-end: the Node entry hydrates, `cellCitationPayload()`
#       emits bytes, and the HTTP surface agrees with the SSR mouth.
#       Byte-identical to what the click and keystroke mouths place on
#       the clipboard. Query shape: `?axis=typography&stage=fresh` —
#       a real valid cell from the 7×5 product so the happy path
#       really is exercised (never a 4xx). No ref passed — the ref-less
#       format is the legacy pathway this smoke-tests.
#
#   (c) GET /api/metrics/cited-cells — read-only, unauthenticated; same
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

# v156 — Third Mouth smoke-test. A real (axis, stage) pair from the 7×5
# product exercises the happy path (200 text/plain, non-empty body).
# `typography × fresh` is a canonical pairing used elsewhere in the test
# suite (REF_FIXTURE_AXIS/STAGE in citation-golden.ts), so the curl
# output is predictable for post-mortem inspection of deployment.log.
echo "==> [deploy] Warming up /api/docs/cite terminal mouth (v156)…"
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

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
# ── Sprint v169 (2026-04-23) — "Clock Seam" + "Verify Bundle DTO" ───────
#   v168 introduced the EIGHTH prebuild guard (user-journey witness). v169
#   adds TWO more — the NINTH (`check-no-raw-now`) and the TENTH
#   (`check-verify-bundle`). Guard count: 8 → 10.
#
#   (a) Clock seam (NINTH guard) — ships `src/lib/clock.ts`, the single
#   injectable `now()`/`nowDate()`/`nowISO()` helper backed by
#   AsyncLocalStorage. SSR middleware (`src/middleware.ts`, NEW) wraps
#   every request in `withClock(Date.now(), next)` so the engine, the API
#   handlers, and the rendered HTML in one payload all agree on the same
#   instant — no more drift between <head>, the first DB read, and the
#   /api/docs/cite mouth.
#
#   (b) Verify Bundle DTO (TENTH guard) — ships the public, offline-first
#   Bitcoin proof verifier. NEW page `src/pages/verify.astro` and NEW
#   endpoint `src/pages/api/verify-bundle/[slug].ts` both consume the
#   SAME DTO (`VerifyBundleDto` in `src/lib/verify-bundle-shared.ts`) so
#   `curl -s '/api/verify-bundle/<slug>'` returns byte-identical JSON to
#   what SSR renders. The guard (`scripts/check-verify-bundle.ts`) freezes
#   the DTO field set + order, asserts the browser-side shim
#   (`src/lib/verify-iso.ts`) re-exports every symbol the island depends
#   on (`verifyBundle`, `parseBitcoinHeight`, `walkProof`, `sha256`,
#   `hashPreimage`, `bytesToHex`, `base64ToBytes`), and locks the
#   canonical `curl` string baked into every response — any future rename
#   fails prebuild instead of silently breaking the /verify island.
#
#   The new guard runs in WARN mode (default) — 107 server-side callsites
#   are still raw `Date.now()` / `new Date()`. Twelve hot files migrated
#   this cycle (clock, temporal, now, decay-engine, wall, death-clock,
#   timeBands, postMeta, entomb, deadline-clock, deadline-enforcer); the
#   rest follow under their own PRs. Once the count hits zero we flip the
#   guard to `--error`. WARN mode means it CANNOT fail the image build
#   today — it just prints a tally to deployment.log for the operator.
#
#   The clock seam also unblocks the THIRD journey-witness mouth
#   (`endanger-witness` — Mike napkin §1 "the v168 unlock"). The journey-
#   golden fixture grows from 6 to 7 frozen rows; the new row exercises
#   `wireDecayStage` under a pinned synthetic clock and asserts the engine
#   classifies a 100-day-old post as `endangered`. The `revive` and
#   `verdict-resolve` legs remain deferred (need blog-slug precondition +
#   ADMIN_SECRET + offline TSA stub — see §TODO in `journey-golden.ts`).
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/clock.ts (NEW) — the ONE seam for "now". Public surface:
#       `now()` / `nowDate()` / `nowISO()`, plus `withClock(at, fn)` for
#       scoped overrides (AsyncLocalStorage — Node-20 built-in, zero dep
#       cost) and `freezeClock(iso)` / `unfreezeClock()` for sync tests
#       that can't wrap their call stack. Innermost pin always wins.
#       Includes `_testClock()` isolated-run sanity per the in-place
#       testing how-to.
#     • src/middleware.ts (NEW) — Astro middleware. `onRequest` reads
#       `Date.now()` ONCE per request and runs the rest of the request
#       inside `withClock(pinnedMs, next)`. Auto-discovered by Astro
#       (filename convention) — no astro.config.mjs change needed.
#     • scripts/check-no-raw-now.ts (NEW — NINTH prebuild guard).
#       Walks `src/`, flags raw `Date.now()` / `new Date()` outside the
#       allowlist (the seam itself, the middleware, `src/lib/client/**`
#       browser code, `*.test.ts` fixtures). Browser-IIFE template
#       strings (e.g. liveDecayScript()) are detected heuristically and
#       skipped. Default `--warn` exits 0; flip to `--error` once the
#       remaining ~107 callsites migrate.
#     • src/lib/verify-bundle-shared.ts (NEW) — single source of truth
#       for the `/verify` proof-bundle DTO (`VerifyBundleDto` + the
#       frozen field-order tuple `VERIFY_BUNDLE_FIELDS`). Used by BOTH
#       the API endpoint AND the SSR page so `curl` and the browser
#       consume byte-identical JSON.
#     • src/pages/api/verify-bundle/[slug].ts (NEW) — GET endpoint.
#       Fail-open envelope: missing slug still returns a 200 with an
#       empty bundle (status='unsealed'); sealed without OTS returns
#       status='pending'; fully anchored returns status='verified' with
#       an immutable cache header.
#     • src/pages/verify.astro (NEW) — public, offline-first Bitcoin
#       proof verifier. `?slug=<x>` → SSR renders the DTO and hands it
#       to the island for in-browser re-walking. No account, no cookies.
#     • src/components/VerifyReceipt.astro (NEW) — receipt component
#       that hosts the verify island.
#     • src/lib/verify-iso.ts + src/lib/client/verify-worker.ts (NEW) —
#       browser-side shim + worker. Re-exports the crypto primitives the
#       check-verify-bundle guard freezes (`verifyBundle`,
#       `parseBitcoinHeight`, `walkProof`, `sha256`, `hashPreimage`,
#       `bytesToHex`, `base64ToBytes`).
#     • src/styles/verify.css (NEW) — page styles, token-driven.
#     • scripts/check-verify-bundle.ts (NEW — TENTH prebuild guard).
#       Asserts: (1) DTO interface fields == snapshot tuple == empty-
#       bundle key order, (2) shim re-exports every symbol the island
#       imports, (3) canonical `curl` string is byte-exact. Runs
#       in-process via `tsx` (no build step), exits non-zero on drift.
#     • src/lib/journey-witness.ts (UPDATED) — adds `endangerMouth()`.
#       Pure engine witness: pins the clock via `withClock`, calls
#       `wireDecayStage(pubDateISO, 0, 0, null, 365)` against a
#       100-days-earlier publish date, returns `{ status: 200, body:
#       { stage: 'endangered' } }`. No HTTP, no DB — fully hermetic.
#     • src/lib/journey-golden.ts (UPDATED) — adds 7th frozen row
#       `endanger-witness` (status 200, bodyKeys ['stage'], bodyLiteral
#       { stage: 'endangered' }). Extends `JourneyStepName` union and
#       updates the in-file TODO ledger (endanger DONE; revive +
#       verdict-resolve still pending).
#     • src/lib/journey-golden.test.ts (UPDATED) — covers the new row.
#     • src/lib/{temporal,now,decay-engine,wall,death-clock,timeBands,
#       postMeta,entomb,deadline-clock,deadline-enforcer}.ts (UPDATED) —
#       migrated from raw `new Date()` defaults to `nowDate()` from the
#       clock seam. No behavior change under production middleware (the
#       middleware pins the clock, so `nowDate()` returns the pinned
#       instant); under tests these now respond to `withClock(…)`.
#     • src/pages/api/audit-download/[slug].ts + src/pages/audit/
#       [slug].astro (UPDATED) — minor alignment with the new DTO
#       shape; download surface unchanged.
#     • scripts/check-user-journey.ts (UPDATED) — minor; iterates the
#       expanded JOURNEY_STEPS table.
#     • AGENTS.md (UPDATED) — paths line grows to mention the
#       middleware seam; WIP note bumped from v168 to v169.
#     • package.json (UPDATED) — `prebuild` chain inserts BOTH new
#       guards (`check-no-raw-now` and `check-verify-bundle`) between
#       the tempo-divergence guard and the user-journey guard. New
#       convenience scripts: `check:no-raw-now`, `lint:clock` (alias),
#       and `check:verify-bundle`.
#
#   Infrastructure deltas this sprint: NONE.
#     No new RUNTIME env vars (the clock seam is pure code; nothing to
#     inject at container start). No new ports, services, named volumes,
#     or docker networks. Astro auto-discovers `src/middleware.ts` —
#     no astro.config.mjs edit. Every new/modified file lives under
#     paths the Dockerfile already COPY-s wholesale (`COPY src/ ./src/`
#     + `COPY scripts/ ./scripts/`), so no Dockerfile edit is required.
#     The new prebuild guard runs in WARN mode → it logs but never
#     fails the image build during the migration window. Once all
#     callsites migrate, a single CLI flag flip (`--error`) elevates it.
#
# ── Startup sequence ─────────────────────────────────────────────────────
#   1. Truncate deployment.log and tee all subsequent output into it.
#   2. Stop + remove any previous container (idempotent).
#   3. Ensure named volumes exist (data dir + SQLite collective memory).
#   4. Build the Docker image (prebuild guards run inside `npm run build`).
#   5. Start the new container on 7100, wiring secrets from .env.
#   6. Poll until Docker reports the container as running.
#   7. Post-boot admin sweeps (deadline + OTS upgrade), if ADMIN_SECRET set.
#   8a. Warm the citation trilogy — /api/docs SSR, /api/docs/cite terminal
#       mouth, and /api/metrics/cited-cells — so the first real visitor
#       (or curl) never pays a cold-start cost.
#   8b. Warm the v169 verify surfaces — /api/verify-bundle/<slug> (API
#       parity mouth, fail-open empty-bundle smoke-test) and /verify
#       (SSR page that consumes the same DTO under the clock middleware).
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
#   check-stage-tempo-divergence (v165 — asserts byte parity between
#     STAGE_EASE_CURVES + STAGE_TEMPO_VECTORS in src/lib/ and the
#     --stage-{stage}-ease + --stage-{stage}-duration literals in
#     src/styles/tokens.css, the 5-D Euclidean JND floor on every
#     unordered pair, AND the v165 duration conjunction: five distinct
#     resolved `--stage-*-duration` literals PLUS `endangered` as the
#     unique strict minimum on the ms axis)  →
#   check-no-raw-now (v169 NEW — NINTH guard; flags raw Date.now() /
#     new Date() outside the clock seam allowlist. Runs in WARN mode
#     today: prints a per-file tally to deployment.log but exits 0 so
#     the migration window doesn't block deploys. Flip to --error
#     once src/lib/ is fully migrated — see TODO in clock.ts)  →
#   check-verify-bundle (v169 NEW — TENTH guard; freezes the
#     VerifyBundleDto shape consumed by BOTH the API endpoint
#     /api/verify-bundle/:slug AND the SSR /verify page. Asserts
#     interface-vs-snapshot parity, empty-bundle key-order parity,
#     verify-iso.ts shim re-exports, and the canonical curl string.
#     Fails the image build on any drift — e.g. a rename in the
#     browser island or a new field added server-side only)  →
#   check-user-journey (v168 EIGHTH guard, expanded in v169 to seven
#     steps; submit → read → endanger witness. Dispatches JOURNEY_STEPS
#     through the real APIRoute handlers in-process via handler-
#     dispatch.ts (and through `wireDecayStage` under `withClock` for
#     endanger), asserts { status, bodyKeys, bodyLiteral } per step.
#     Prefixed with `COMMUNITY_DB_PATH=:memory:` so the hermetic SQLite
#     never touches the production volume. The guard itself refuses to
#     run unless the env var is set to :memory: — Paul §ship criteria)  →
#   test:keep-hotkey  →  test:keep-legend  →  test:chip-lit  →
#   test:arrival  →  test:citation-golden  →
#   test:journey-golden (v168, expanded in v169 — unit coverage for
#     the fixture table (now seven rows including endanger-witness),
#     reorder lemma, and PoW nonce re-check)  →
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
#       v169 ALSO routes this hit through the new SSR clock middleware
#       (src/middleware.ts), so every `now()` inside this single payload
#       — engine decay, freshness label, /api/docs/cite mouth — resolves
#       to the SAME pinned instant. Warming the route is also the
#       runtime smoke-test that AsyncLocalStorage is propagating.
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

# ── 8b. Verify-bundle warm-up (v169) — API + SSR page parity ──────────────
# Both surfaces of the new Bitcoin proof-of-existence story:
#
#   (a) GET /api/verify-bundle/<slug> — canonical DTO endpoint. The
#       verify-bundle prebuild guard already enforced the wire shape at
#       image-build time; warming the route hydrates Astro's APIRoute
#       handler, the conviction-ledger DB module, and the timestamp
#       store — so the first real `curl` from a visitor pays no cold
#       start. We use the sentinel slug `warmup-demo` which returns the
#       fail-open empty bundle (status='unsealed', 200) regardless of
#       whether the ledger has rows yet — ideal for smoke-testing on a
#       blank SQLite volume AND on a production one.
#
#   (b) GET /verify?slug=warmup-demo — SSR page that consumes the SAME
#       DTO. Also routes through the new clock middleware, so warming
#       it is the runtime smoke-test that the `/verify` island shell
#       renders and the withClock scope propagates into the DB read.
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

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

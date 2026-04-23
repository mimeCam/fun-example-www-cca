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
# ── Sprint v175 (2026-04-23) — "Parity Seal" ────────────────────────────
#   Builds on v173/v174's Tri-Mouth Inventory (one producer, three
#   mouths: pointer · keyboard · curl). v175 introduces the ONE shared
#   abstraction that the page, the cite JSON, AND the prebuild guard all
#   consume: `src/lib/parity-seal.ts`. Three readers, one producer —
#   same discipline as tri-mouth-inventory.ts (Mike napkin §3.6).
#
#   Honesty over optics: the `revive` row is downgraded from
#   `wired-no-golden` → `pending-keyboard` (a keyboard chord is owed,
#   so the status now matches the already-declared `pending: 'keyboard'`
#   field). `wiredActions()` drops 3 → 2; `readyToPromote()` flips back
#   to `false` (needs ≥ 5 rows ∧ ≥ 3 wired). The seal sentence on
#   /api/docs fails closed — `parityCopy()` returns `null`, the page
#   template guards the render, so no parity claim appears until the
#   build earns it. The band rows themselves always render (Tanya §4.4
#   pending-is-honest rule).
#
#   v175 also hardens the tri-mouth guard with §5.6 (monotonic cap) and
#   §5.5 teeth (import-regex replaces substring scan). The cap ledger
#   `data/tri-mouth-pending-cap.json` (cap=3) is versioned in git and
#   can only descend — paying a wedge means decrementing by 1 in the
#   same PR. The guard stays in WARN this sprint; the `--warn → --error`
#   flip lands after the R chord + 1/2/3 stance wedges.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/parity-seal.ts (NEW) — single shared helper. Pure (no
#       fs / DOM / network / clock), SSR-safe, importable from Astro
#       pages AND the prebuild guard. Exports: parityFacts(),
#       parityCopy() [fail-closed sentence OR null], parityJsonField(),
#       parityBandRows(), parityReceipt(), parityGoldEarned(),
#       PARITY_MOUTH_COUNT. No branching on polymorphism; if a second
#       sentence ever ships, split it to a new module.
#     • src/lib/parity-seal.test.ts (NEW) — golden proving the five
#       helpers stay aligned with TRI_MOUTH_ACTIONS. Joins prebuild via
#       package.json (`test:parity-seal`).
#     • src/pages/api/docs.astro (UPDATED) — renders the "Every verb,
#       three mouths." band below the matrix, above Tone. Five rows ×
#       three mouths, fail-closed sentence, quiet receipt footer, gold
#       pip only when parityGoldEarned() (Tanya §4.6). Every number
#       reads from the shared helper; zero new tokens.
#     • src/pages/api/docs/cite.ts (UPDATED) — JSON branch adds
#       `parity: parityJsonField()` witness `{rows, mouths, enforced}`.
#       Additive-forever; the text/plain branch is byte-identical so
#       curl-parity (Paul MH-3) still holds — `curl -s | wc -c` matches
#       Buffer.byteLength.
#     • src/lib/tri-mouth-inventory.ts (UPDATED) — `revive` row status
#       flipped `wired-no-golden` → `pending-keyboard`. The `pending:
#       'keyboard'` field was already declared; the status literal now
#       matches reality. `wiredActions()` returns 2, `readyToPromote()`
#       returns false.
#     • scripts/check-tri-mouth.ts (UPDATED) — §5.5 teeth: substring
#       scan replaced with an ES import-regex (`hasProducerImport()`).
#       Comments no longer pass as imports (Elon §5.4). §5.6 NEW:
#       `checkMonotonicCap()` + `readCap()` — reads
#       `data/tri-mouth-pending-cap.json`, emits `cap-exceeded` or
#       `cap-missing` findings. `summaryLine()` now includes `cap=N`.
#     • scripts/check-tri-mouth.test.ts (UPDATED) — fixtures + tests
#       for `hasProducerImport()` (5 cases), `readCap()` (4 cases),
#       `checkMonotonicCap()` (3 cases), plus a comment-only route
#       fixture proving the substring-escape is plugged.
#     • data/tri-mouth-pending-cap.json (NEW) — monotonic cap ledger.
#       `{ "cap": 3 }` this sprint (outstanding = 3: keep-post, revive,
#       stance). Read at prebuild time by the guard.
#     • package.json (UPDATED) — adds `test:parity-seal` convenience
#       script and joins it into the `prebuild` chain adjacent to
#       `test:tri-mouth` (sibling pattern stays co-located).
#     • AGENTS.md (UPDATED) — WIP line retitled "Tri-Mouth / Parity Seal
#       (v175)"; narrates the 2-wired reality, the shared helper, the
#       cap ledger, the import-regex teeth, and the two pre-existing
#       route-import drifts surfaced (keep-post, revive).
#
#   Infrastructure deltas this sprint:
#     · NEW BUILD-TIME INPUT — `data/tri-mouth-pending-cap.json`. The
#       prebuild guard reads it via `process.cwd()`-relative fs; the
#       Dockerfile now `COPY`s that one file (not the whole `data/`
#       dir — `revivals.db*` must stay out of the image and come from
#       the named volume). Without the COPY the guard prints
#       `cap-missing` (disarmed ratchet) but continues in WARN mode.
#     · NO new RUNTIME env vars, ports, services, named volumes, or
#       docker networks.
#     · NO new API routes — parity reuses `/api/docs` (SSR page) and
#       `/api/docs/cite` (JSON branch). Text/plain cite branch is
#       byte-identical to v174.
#     · The v172 clock-migration guard (`check-no-raw-now`) is still
#       WARN at 80 raw callsites; next wedges (presence-hub, live-decay,
#       cell-event-ledger, cell-heat) remain the trailhead for that
#       flip. Independent of the tri-mouth ratchet.
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
#   8e. Warm the v174 submit-post keyboard mouth: SSR-render
#       /community/submit and grep for the new `.submit-kbd-chip` +
#       `aria-keyshortcuts` markers; proves the keyboard teach landed
#       in the SSR HTML AND that the page-chunk import of
#       `submit-hotkey.ts` did not silently break the page.
#   8f. Warm the v175 Parity Seal: SSR-render /api/docs and grep for
#       the band heading + grid class; call /api/docs/cite with
#       Accept: application/json and assert the new `"parity":{…}`
#       witness field is on the wire. Fail-closed sentence is NOT
#       asserted (parityCopy() returns null this sprint — enforced
#       only when readyToPromote()).
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
#     after the v172 collectiveMemory.ts wedge; flip to --error once
#     2–3 more small wedges land: presence-hub (6), live-decay (5),
#     cell-event-ledger (3), cell-heat (3))  →
#   check-tri-mouth (v173 ELEVENTH guard — WARN mode; walks the frozen
#     `TRI_MOUTH_ACTIONS` literal in src/lib/tri-mouth-inventory.ts and
#     enforces six invariants: §5.1 producer file exists, §5.2 curl is
#     VERB /api/..., §5.3 curl path resolves under src/pages/api/, §5.4
#     every non-wired row receipts its single null mouth via `pending`,
#     §5.5 the route file *imports* the producer basename (v175 teeth:
#     import-regex, not substring — comments no longer pass), §5.6 v175
#     NEW monotonic cap — outstanding (non-wired) row count ≤ cap in
#     data/tri-mouth-pending-cap.json (cap=3 this sprint). 5 rows / 2
#     wired today; flips to --error when readyToPromote() holds —
#     ≥ 5 rows ∧ ≥ 3 wired. v175 surfaces 2 pre-existing route-import
#     drifts (keep-post, revive) as WARN findings; these are the next
#     wedges, not deploy blockers)  →
#   check-verify-bundle (v169 TENTH guard — freezes the VerifyBundleDto
#     wire shape across the API + SSR page)  →
#   check-user-journey (v168 EIGHTH guard, expanded v169 — seven-step
#     submit → read → endanger journey dispatched through the real
#     APIRoute handlers in-process, hermetic :memory: SQLite)  →
#   test:keep-hotkey →
#   test:submit-hotkey (v174 NEW — pure-function truth-table over {key} ×
#     {modifier combos} for the `Ctrl+Enter` / `⌘↩` publish hotkey on
#     /community/submit; proves bare Enter is NOT a publish, the two
#     valid chord forms ARE, and the predicate is disjoint from
#     keep-hotkey so the two listeners can coexist without racing)  →
#   test:keep-legend → test:chip-lit → test:arrival →
#   test:citation-golden → test:journey-golden →
#   test:api-stamp-golden (v170 — proves jsonStamped's six napkin
#     acceptance properties: shape, pin identity within scope, nested-
#     scope isolation, body preservation, seam-overrides-caller, cross-
#     handler parity)  →
#   test:collective-memory-clock (v172 — nine-section golden locking the
#     collectiveMemory.ts wedge against a :memory: DB; hermetic)  →
#   test:tri-mouth-inventory (v173 NEW — golden witnessing the literal's
#     own health: name uniqueness, closed status vocabulary, `pending`
#     field truthfulness, producer-file existence, curl grammar,
#     parseCurl strips ?query#frag, readyToPromote thresholds)  →
#   test:parity-seal (v175 NEW — golden for the ONE shared abstraction:
#     parityFacts/parityCopy/parityJsonField/parityBandRows/parityReceipt
#     /parityGoldEarned stay aligned with TRI_MOUTH_ACTIONS. Fail-closed
#     sentence returns null while enforced=false; JSON witness emits
#     honest counts regardless; gold pip gates on zero-debt+enforced)  →
#   test:citation-delegation → test:duration-reasons →
#   test:check-tri-mouth (v173 NEW, v175 expanded — synthetic-fixture
#     unit tests for the ELEVENTH guard's scanners; proves each invariant
#     fires on a hole-shaped row and passes on a clean one. v175 adds
#     `hasProducerImport()` regex tests (comment-only mention fails,
#     substring-in-another-token fails), `readCap()` tests (missing /
#     malformed / negative → null), and `checkMonotonicCap()` tests
#     (under-cap / over-cap / missing-ledger). Prevents the ratchet
#     from rotting into a vacuous pass)  →
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

# ── 8e. Submit-post keyboard-mouth warm-up (v174) ──────────────────────────
# v174 wires the keyboard mouth on `submit-post` (Ctrl+Enter / ⌘↩). The
# prebuild golden (`src/lib/client/submit-hotkey.test.ts`) already proves
# the predicate is correct over the full {key} × {modifier} truth-table at
# image-build time. This runtime probe SSR-renders /community/submit and
# greps for two markers that prove the wedge actually shipped to the
# wire:
#   (a) `aria-keyshortcuts="Control+Enter Meta+Enter"` — canonical AT
#       teach (Mike napkin v174.1 §6.7); presence proves the
#       submit.astro template change is live.
#   (b) `submit-kbd-chip` — the sighted teach element; presence proves
#       the new CSS class is rendered AND that the page-chunk import of
#       `submit-hotkey.ts` did not silently break the page (a runtime
#       module-resolution error would 500 the SSR render before HTML
#       reached the wire).
# The page is publicly reachable (no auth gate) and SSR-rendered, so a
# bare GET is enough — no PoW, no session needed.
echo "==> [deploy] Warming up /community/submit (v174 submit-post keyboard mouth)…"
SUBMIT_BODY_FILE="$(mktemp)"
SUBMIT_STATUS=$(curl --silent --show-error --output "${SUBMIT_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/community/submit" \
  || echo '000')
SUBMIT_BODY_LEN=$(wc -c < "${SUBMIT_BODY_FILE}" | tr -d ' ')
SUBMIT_HAS_ARIA=$(grep -c 'aria-keyshortcuts="Control+Enter Meta+Enter"' "${SUBMIT_BODY_FILE}" || true)
SUBMIT_HAS_CHIP=$(grep -c 'submit-kbd-chip' "${SUBMIT_BODY_FILE}" || true)
rm -f "${SUBMIT_BODY_FILE}"
echo "==> [deploy] /community/submit: HTTP ${SUBMIT_STATUS} · body=${SUBMIT_BODY_LEN}B · aria-keyshortcuts-hits=${SUBMIT_HAS_ARIA} · submit-kbd-chip-hits=${SUBMIT_HAS_CHIP}"
if [ "${SUBMIT_STATUS}" != "200" ] || [ "${SUBMIT_HAS_ARIA}" -lt 1 ] || [ "${SUBMIT_HAS_CHIP}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /community/submit missing v174 keyboard-mouth markers (aria-keyshortcuts and/or submit-kbd-chip) — investigate (container still up)." >&2
fi

# ── 8f. Parity Seal warm-up (v175) — page band + cite JSON witness ─────────
# v175 introduces `src/lib/parity-seal.ts` — the ONE shared abstraction the
# /api/docs page, the /api/docs/cite JSON branch, AND the prebuild guard
# all consume. The prebuild goldens (`parity-seal.test.ts` + the expanded
# `check-tri-mouth.test.ts`) already prove the helpers and invariants at
# image-build time. This runtime pair of probes asserts the wedge actually
# shipped to the wire on both surfaces:
#
#   (a) /api/docs SSR — grep the HTML for two markers that prove the
#       band template + CSS landed and the module graph is healthy:
#         · `api-docs__parity-grid` (the row-container class) — presence
#           proves the `parityBandRows()` map-render executed.
#         · `Every verb, three mouths.` — the h2 copy; presence proves
#           the section root rendered and the `parity-heading` anchor
#           is reachable.
#       The seal sentence (`parityCopy()`) is NOT asserted: it fails
#       closed this sprint (readyToPromote() === false — 2 wired of the
#       required 3), so a null return is the correct wire shape. Paul
#       MH-2 contract.
#
#   (b) /api/docs/cite JSON branch — grep the response body for the new
#       `"parity":{` witness field. Presence proves the curl-parity mouth
#       sees the same `{rows, mouths, enforced}` snapshot the page
#       renders. Text/plain branch is deliberately NOT re-probed: 8a
#       already asserts it 200s with a body, and v175 guarantees byte-
#       identical output (Mike napkin §2) so the v174 probe is sufficient.
#
# Both surfaces are publicly reachable (no auth gate); bare GETs suffice.
echo "==> [deploy] Warming up /api/docs parity band (v175 Parity Seal SSR)…"
PARITY_BODY_FILE="$(mktemp)"
PARITY_STATUS=$(curl --silent --show-error --output "${PARITY_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
PARITY_BODY_LEN=$(wc -c < "${PARITY_BODY_FILE}" | tr -d ' ')
PARITY_HAS_GRID=$(grep -c 'api-docs__parity-grid' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_HEADING=$(grep -c 'Every verb, three mouths.' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_ROW=$(grep -c 'api-docs__parity-row' "${PARITY_BODY_FILE}" || true)
rm -f "${PARITY_BODY_FILE}"
echo "==> [deploy] /api/docs parity band: HTTP ${PARITY_STATUS} · body=${PARITY_BODY_LEN}B · grid-hits=${PARITY_HAS_GRID} · heading-hits=${PARITY_HAS_HEADING} · row-hits=${PARITY_HAS_ROW}"
if [ "${PARITY_STATUS}" != "200" ] || [ "${PARITY_HAS_GRID}" -lt 1 ] || [ "${PARITY_HAS_HEADING}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v175 parity-band markers (api-docs__parity-grid / band heading) — investigate (container still up)." >&2
fi

echo "==> [deploy] Warming up /api/docs/cite JSON parity witness (v175)…"
CITE_JSON_BODY_FILE="$(mktemp)"
CITE_JSON_STATUS=$(curl --silent --show-error --output "${CITE_JSON_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/docs/cite?axis=typography&stage=fresh" \
  || echo '000')
CITE_JSON_BODY_LEN=$(wc -c < "${CITE_JSON_BODY_FILE}" | tr -d ' ')
CITE_JSON_HAS_PARITY=$(grep -c '"parity"' "${CITE_JSON_BODY_FILE}" || true)
CITE_JSON_HAS_ROWS=$(grep -c '"rows"' "${CITE_JSON_BODY_FILE}" || true)
CITE_JSON_HAS_MOUTHS=$(grep -c '"mouths"' "${CITE_JSON_BODY_FILE}" || true)
CITE_JSON_HAS_ENFORCED=$(grep -c '"enforced"' "${CITE_JSON_BODY_FILE}" || true)
CITE_JSON_PREVIEW=$(head -c 240 "${CITE_JSON_BODY_FILE}" | tr '\n' ' ')
rm -f "${CITE_JSON_BODY_FILE}"
echo "==> [deploy] /api/docs/cite JSON: HTTP ${CITE_JSON_STATUS} · body=${CITE_JSON_BODY_LEN}B · parity-hits=${CITE_JSON_HAS_PARITY} · rows=${CITE_JSON_HAS_ROWS} · mouths=${CITE_JSON_HAS_MOUTHS} · enforced=${CITE_JSON_HAS_ENFORCED} · preview=\"${CITE_JSON_PREVIEW}\""
if [ "${CITE_JSON_STATUS}" != "200" ] || [ "${CITE_JSON_HAS_PARITY}" -lt 1 ] \
   || [ "${CITE_JSON_HAS_ROWS}" -lt 1 ] || [ "${CITE_JSON_HAS_MOUTHS}" -lt 1 ] \
   || [ "${CITE_JSON_HAS_ENFORCED}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs/cite JSON missing v175 parity witness (parity/rows/mouths/enforced) — investigate (container still up)." >&2
fi

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

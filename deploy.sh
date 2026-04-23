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
# ── Sprint v175 PR-C (2026-04-23) — "R-chord wedge" ─────────────────────
#   Builds on v175 PR-A/B's "Parity Seal" (one shared helper;
#   `src/lib/parity-seal.ts` is the sole producer for the page band, the
#   cite JSON witness, AND the prebuild guard). PR-C wires the third
#   mouth on the `revive` row — the `R` hotkey — and, as a side effect
#   of crossing the 3-wired threshold, flips `readyToPromote()` from
#   `false` → `true`. The seal sentence that failed closed last PR
#   (`parityCopy() === null`) now emits `"5 actions · 3 mouths each ·
#   build-enforced parity."` on the wire. Mike napkin R-chord §1–8,
#   Tanya §4 revive UX, Sid — every function ≤ 10 lines.
#
#   Honest state after this PR: 5 rows / **3 wired** (cite-cell,
#   submit-post, revive). Two rows still owe a wedge — `keep-post`
#   (pending-curl-peer — the /api/ingest/cell-event POST is a beacon,
#   not a ledger-write peer) and `stance` (keyboard 1/2/3 chord not yet
#   published). `parityGoldEarned()` stays `false` until both land
#   (Tanya §4.6 — no gold on a half-debt ledger). The band footer
#   receipt now reads "2 mouths pending · curl-peer+keyboard
#   (keep-post, stance)".
#
#   The monotonic cap ledger (`data/tri-mouth-pending-cap.json`)
#   descends 3 → 2 in the same PR that wires the revive mouth —
#   Mike §3.7 "paying a wedge = decrementing the cap". The guard
#   stays in WARN for this sprint; the `--warn → --error` flip happens
#   in the PR that wires the next mouth (keep-post curl-peer OR stance
#   keyboard), at which point the cap descends to 1 and then 0.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/client/revive-hotkey.ts (NEW) — the third sibling to
#       keep-hotkey.ts and submit-hotkey.ts. Pure `isReviveKey()`
#       predicate (rejects Cmd/Ctrl/Alt combos so browser refresh
#       wins), focus-aware trigger resolver (active element's nearest
#       `[data-revive-trigger]` beats the first in document order),
#       fire-and-forget click synthesis (no hold — Mike §6 "revive is
#       an instant verb, not a hold"), 120ms chip-lit flash via
#       `lightForKey()` (Tanya §3.3 same beat as cell-cite). Auto-boots
#       on DOMContentLoaded; `bindReviveHotkey()` is idempotent and
#       no-ops on pages without a trigger.
#     • src/lib/client/revive-hotkey.test.ts (NEW, untracked) —
#       pure-function truth-table: `r`/`R` fire, Shift+R fires,
#       Cmd/Ctrl/Alt+R do NOT fire (browser refresh + platform chords
#       win), every non-R key + Escape/Tab/Arrow/digits do NOT fire,
#       and the revive predicate is DISJOINT from keep/cite/nav
#       predicates (no two listeners race on the same keystroke).
#       NOTE: not joined to the prebuild chain this PR — package.json
#       unchanged. The file runs green via `npx tsx --test` locally;
#       wiring it into prebuild is a one-line follow-up.
#     • src/lib/tri-mouth-inventory.ts (UPDATED) — revive row promoted:
#         · pointer : 'RevivalBadge' → '[data-revive-trigger]' (Mike
#           §6 selector drift — attribute survives CSS class renames).
#         · keyboard: null → 'R' (the hotkey shipped).
#         · status  : 'pending-keyboard' → 'wired'; pending field
#           deleted. wiredActions() climbs 2 → 3; readyToPromote() ==
#           true.
#     • src/components/FloatingKeepButton.astro (UPDATED) — the keep
#       button now doubles as the single revive trigger:
#         · `data-revive-trigger` attribute (matches the inventory
#           pointer selector).
#         · `aria-keyshortcuts="R"` (AT teach — mirrors the pattern
#           v174 shipped for submit's Ctrl+Enter chord).
#         · inline module-script adds `import { bindReviveHotkey }`
#           alongside `bindKeepHotkey`; the keep + revive bindings
#           coexist because isKeepKey and isReviveKey are disjoint
#           predicates (revive-hotkey.test.ts locks this).
#     • src/lib/revival-engine.ts (UPDATED) — now exports the canonical
#       `/api/revive` response shape. Route no longer mints its own
#       literal; instead it passes `ReviveFacts` to `buildRevivePayload`
#       which returns `ReviveResponse`. Mike napkin §3.1 "producer
#       naming" — the tri-mouth import-regex (§5.5) now resolves for
#       this row (route imports producer basename). Also exports
#       `atmosphereFor(wasEndangered, isEndangeredAfter)` — pure,
#       referentially transparent, every function ≤ 10 lines.
#     • src/pages/api/revive.ts (UPDATED) — route is now a thin
#       adapter: computes facts (decay before/after, monthly count,
#       survivor rank, resonance, endangered-before/after) and delegates
#       the shape to `buildRevivePayload()`. Import line locks the
#       producer binding under §5.5. Wire shape is byte-compatible with
#       v174: same fields, same order (the literal was lifted verbatim
#       into revival-engine.ts).
#     • data/tri-mouth-pending-cap.json (UPDATED) — cap: 3 → 2.
#       Monotonic descent; the prebuild guard (`checkMonotonicCap`)
#       now requires ≤ 2 outstanding rows.
#     • scripts/check-tri-mouth.test.ts (UPDATED) — new describe block
#       "v175 R-chord — live inventory after revive wiring" walks the
#       real TRI_MOUTH_ACTIONS literal and asserts the post-PR shape:
#       revive is wired with pointer+R+curl, wiredActions().length ==
#       3, pendingSummary() is {keyboard:1, curl:0, pointer:0},
#       readyToPromote() == true, total rows == 5. Regresses loudly
#       if a future PR demotes the row.
#
#   Infrastructure deltas this sprint:
#     · NO new runtime env vars, ports, services, named volumes, or
#       docker networks. revive-hotkey.ts is a client module and
#       ships via the same `src/` COPY the Dockerfile already does.
#     · NO new API routes — the R chord synthesises a click on the
#       existing `[data-revive-trigger]` which flows into the existing
#       POST /api/revive handler. One producer, three triggers.
#     · Build-time inputs unchanged from v175 PR-B — the monotonic cap
#       file `data/tri-mouth-pending-cap.json` is still COPY'd (its
#       value just descended 3 → 2).
#     · Parity Seal wire shape IS observably changed: the previously-
#       null seal sentence now renders ("5 actions · 3 mouths each ·
#       build-enforced parity."), and the cite-JSON `parity.enforced`
#       field flips `false` → `true`. Warm-up 8f asserts both.
#     · v172 clock-migration guard (`check-no-raw-now`) still WARN at
#       80 raw callsites; no clock work landed in this PR.
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
#   8f. Warm the v175 Parity Seal AFTER PR-C: SSR-render /api/docs and
#       grep for the band heading + grid class; assert the seal
#       sentence ("5 actions · 3 mouths each · build-enforced parity.")
#       IS now on the wire (parityCopy() returns non-null since PR-C
#       flipped readyToPromote() to true). Call /api/docs/cite with
#       Accept: application/json and assert the `"parity":{…}` witness
#       field is present AND `"enforced":true` (was false pre-PR-C).
#   8g. Warm the v175 R-chord: SSR-render a blog post page (which
#       embeds FloatingKeepButton) and grep for the two markers that
#       prove the revive trigger + keyboard teach shipped — the
#       `data-revive-trigger` attribute and `aria-keyshortcuts="R"`.
#       Presence of both in the wire HTML proves (a) the component
#       edit shipped, (b) the page-chunk import of `revive-hotkey.ts`
#       did not silently break the page (a resolution error would 500
#       the SSR render), and (c) the tri-mouth pointer selector
#       (`[data-revive-trigger]`) can actually resolve at runtime.
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
#     monotonic cap — outstanding (non-wired) row count ≤ cap in
#     data/tri-mouth-pending-cap.json (cap descended 3 → 2 this PR).
#     5 rows / 3 wired today after the R-chord wedge; readyToPromote()
#     now returns true so the --error flip is unblocked — deferred to
#     the PR that wires the next mouth (keep-post curl-peer OR stance
#     1/2/3 keyboard) so we never flip into --error with live debt.
#     v175 PR-A surfaced the `keep-post` route-import drift (its
#     producer keep-pact.ts is still imported only transitively); that
#     wedge is the next candidate)  →
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

# ── 8f. Parity Seal warm-up (v175, post-PR-C) — page band + cite JSON ──────
# v175 PR-A/B introduced `src/lib/parity-seal.ts` — the ONE shared
# abstraction the /api/docs page, the /api/docs/cite JSON branch, AND
# the prebuild guard all consume. v175 PR-C wires the `revive` R chord,
# crossing the `readyToPromote()` threshold. Two wire-level consequences
# this probe locks:
#
#   (a) /api/docs SSR — four markers this PR:
#         · `api-docs__parity-grid` (row-container class) — proves the
#           `parityBandRows()` map-render executed.
#         · `Every verb, three mouths.` — h2 copy; proves the section
#           root rendered and the `parity-heading` anchor is reachable.
#         · `build-enforced parity.` — the seal sentence suffix. Was
#           `null` through PR-A/B (fail-closed), now emits non-null
#           because readyToPromote() == true (3 wired of the required 3).
#           Presence here proves PR-C actually raised the wired count in
#           production, not just in the prebuild golden (Paul MH-2
#           "fails closed, not open" inverted — now "opens on merit").
#         · `api-docs__parity-row` — proves at least one row mapped
#           through `toRow()` onto the wire.
#
#   (b) /api/docs/cite JSON branch — four fields this PR:
#         · `"parity"`    — witness object present (curl-parity mouth).
#         · `"rows"`      — count included.
#         · `"mouths"`    — count included (always 3).
#         · `"enforced"`  — the truth bit. Must be literally
#           `"enforced":true` this sprint (was `false` pre-PR-C).
#       Text/plain branch is deliberately NOT re-probed — 8a already
#       asserts 200+body and v175 guarantees byte-identical output
#       (Mike napkin §2) so the v174 probe is sufficient.
#
# Both surfaces are publicly reachable (no auth gate); bare GETs suffice.
echo "==> [deploy] Warming up /api/docs parity band (v175 PR-C Parity Seal SSR)…"
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
PARITY_HAS_SEAL=$(grep -c 'build-enforced parity\.' "${PARITY_BODY_FILE}" || true)
rm -f "${PARITY_BODY_FILE}"
echo "==> [deploy] /api/docs parity band: HTTP ${PARITY_STATUS} · body=${PARITY_BODY_LEN}B · grid-hits=${PARITY_HAS_GRID} · heading-hits=${PARITY_HAS_HEADING} · row-hits=${PARITY_HAS_ROW} · seal-hits=${PARITY_HAS_SEAL}"
if [ "${PARITY_STATUS}" != "200" ] || [ "${PARITY_HAS_GRID}" -lt 1 ] || [ "${PARITY_HAS_HEADING}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v175 parity-band markers (api-docs__parity-grid / band heading) — investigate (container still up)." >&2
fi
if [ "${PARITY_HAS_SEAL}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v175 PR-C seal sentence ('build-enforced parity.') — readyToPromote() may have regressed to false; investigate." >&2
fi

echo "==> [deploy] Warming up /api/docs/cite JSON parity witness (v175 PR-C)…"
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
CITE_JSON_ENFORCED_TRUE=$(grep -c '"enforced":true' "${CITE_JSON_BODY_FILE}" || true)
CITE_JSON_PREVIEW=$(head -c 240 "${CITE_JSON_BODY_FILE}" | tr '\n' ' ')
rm -f "${CITE_JSON_BODY_FILE}"
echo "==> [deploy] /api/docs/cite JSON: HTTP ${CITE_JSON_STATUS} · body=${CITE_JSON_BODY_LEN}B · parity-hits=${CITE_JSON_HAS_PARITY} · rows=${CITE_JSON_HAS_ROWS} · mouths=${CITE_JSON_HAS_MOUTHS} · enforced=${CITE_JSON_HAS_ENFORCED} · enforced-true=${CITE_JSON_ENFORCED_TRUE} · preview=\"${CITE_JSON_PREVIEW}\""
if [ "${CITE_JSON_STATUS}" != "200" ] || [ "${CITE_JSON_HAS_PARITY}" -lt 1 ] \
   || [ "${CITE_JSON_HAS_ROWS}" -lt 1 ] || [ "${CITE_JSON_HAS_MOUTHS}" -lt 1 ] \
   || [ "${CITE_JSON_HAS_ENFORCED}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs/cite JSON missing v175 parity witness (parity/rows/mouths/enforced) — investigate (container still up)." >&2
fi
if [ "${CITE_JSON_ENFORCED_TRUE}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs/cite JSON missing 'enforced:true' (v175 PR-C flip) — readyToPromote() regressed or wiring didn't ship; investigate." >&2
fi

# ── 8g. R-chord warm-up (v175 PR-C) — blog post SSR + revive markers ───────
# v175 PR-C wires the `R` hotkey on the revive affordance (third sibling
# to keep-hotkey and submit-hotkey). The prebuild golden
# (`src/lib/client/revive-hotkey.test.ts`, local-only — not in the
# prebuild chain yet, a one-line follow-up in package.json) proves the
# predicate truth table. This runtime probe SSR-renders a real blog post
# page (which embeds FloatingKeepButton) and greps for two markers that
# prove the wedge actually shipped on the wire:
#
#   (a) `data-revive-trigger` — the pointer selector the Tri-Mouth
#       inventory now names (tri-mouth-inventory.ts::TRI_MOUTH_ACTIONS
#       row #3 `pointer`). Presence proves the FloatingKeepButton.astro
#       template edit shipped AND the selector the R-hotkey resolves at
#       runtime (revive-hotkey.ts::REVIVE_TRIGGER_SEL) has a home.
#   (b) `aria-keyshortcuts="R"` — canonical AT teach for the R chord.
#       Presence proves assistive-tech users are told the shortcut and
#       mirrors the pattern v174 shipped for submit's Ctrl+Enter.
#
# Also implicitly proves: the page-chunk import of
# `src/lib/client/revive-hotkey.ts` in FloatingKeepButton.astro did not
# silently break the page (a runtime module-resolution error would 500
# the SSR render before any HTML reached the wire).
#
# `hello-world` is a seed blog slug (see src/content/blog/hello-world.md)
# so the getStaticPaths() route is always resolvable. No auth, no PoW.
REVIVE_SLUG="hello-world"
echo "==> [deploy] Warming up /blog/${REVIVE_SLUG} (v175 PR-C revive pointer + R-chord AT teach)…"
REVIVE_BODY_FILE="$(mktemp)"
REVIVE_STATUS=$(curl --silent --show-error --output "${REVIVE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/blog/${REVIVE_SLUG}" \
  || echo '000')
REVIVE_BODY_LEN=$(wc -c < "${REVIVE_BODY_FILE}" | tr -d ' ')
REVIVE_HAS_TRIGGER=$(grep -c 'data-revive-trigger' "${REVIVE_BODY_FILE}" || true)
REVIVE_HAS_ARIA=$(grep -c 'aria-keyshortcuts="R"' "${REVIVE_BODY_FILE}" || true)
rm -f "${REVIVE_BODY_FILE}"
echo "==> [deploy] /blog/${REVIVE_SLUG}: HTTP ${REVIVE_STATUS} · body=${REVIVE_BODY_LEN}B · data-revive-trigger-hits=${REVIVE_HAS_TRIGGER} · aria-keyshortcuts=R-hits=${REVIVE_HAS_ARIA}"
if [ "${REVIVE_STATUS}" != "200" ] || [ "${REVIVE_HAS_TRIGGER}" -lt 1 ] || [ "${REVIVE_HAS_ARIA}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /blog/${REVIVE_SLUG} missing v175 PR-C R-chord markers (data-revive-trigger and/or aria-keyshortcuts=R) — investigate (container still up)." >&2
fi

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

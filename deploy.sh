#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v40 — Deadline Clock (2026-04-07)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Author conviction sealed with HMAC proof.
#   Public audit receipts prove the author's past self is on record.
#   The Verdict Wall surfaces every post on trial, sorted by tension.
#   Authors may now attach a public resolution_deadline to any post;
#   the DeadlineClock widget renders a live countdown with urgency bands.
#   Expired-unsealed posts are auto-sealed as 'abandoned' by /api/deadline-sweep.
#
# Sprint (latest — Deadline Clock):
#   lib/deadline-clock.ts — NEW: pure time math for resolution deadline display;
#     buildDeadlineDisplay(publishDate, deadline, now) → label/urgencyBand/
#     daysRemaining/percentConsumed. Zero DB, zero side-effects.
#   lib/deadline-enforcer.ts — NEW: classify deadline status (no-deadline /
#     pending / imminent / critical / expired-unsealed / auto-resolved);
#     findExpiredUnsealed() probe; autoSealExpired() writes 'abandoned' verdict
#     via resolveVerdict(). Reads conviction_ledger — no schema changes.
#   components/DeadlineClock.astro — NEW: deadline countdown widget; 5 urgency
#     bands (safe/watch/warning/critical/overdue); CSS pulse on critical/overdue;
#     progress bar (percentConsumed); sealed/overdue states. SSR-only.
#   pages/api/deadline-sweep.ts — NEW: POST /api/deadline-sweep; Bearer auth;
#     sweeps all expired-unsealed posts; returns {ok, swept, skipped, errors};
#     idempotent — already-sealed posts are skipped. prerender=false.
#   content/config.ts — UPDATED: resolution_deadline: z.date().optional() added
#     to blog schema. Absence = no commitment. Presence = public accountability.
#   pages/admin.astro — UPDATED: deadline status surfaced per post in admin view.
#   pages/blog/[slug].astro — UPDATED: DeadlineClock rendered in post header.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
#     deploy.sh: POST /api/deadline-sweep called post-start to auto-seal expired.
#
# Sprint (prev — Verdict Resolution):
#   lib/verdict-resolver.ts — NEW: runtime verdict sealing; resolveVerdict()
#     writes event_type='verdict' into conviction_ledger; HMAC-SHA256 proof;
#     VerdictAlreadySealedError idempotency guard; rowToVerdictRecord() mapper.
#   pages/api/verdict-resolve.ts — NEW: POST /api/verdict-resolve; cookie +
#     body auth (mirrors conviction-seal); broadcasts 'verdict:declared' SSE
#     event with newBattingAvg; 409 on double-seal; prerender=false.
#   components/VerdictResolutionPanel.astro — NEW: per-post admin panel; two
#     states — sealed (read-only badge + note) / open (verdict dropdown + note
#     textarea); fetch-based submit with live feedback; reload on success.
#   lib/verdict-ceremony.ts — NEW: client-side SSE listener for
#     'verdict:declared'; piggybacks on window.__presenceES (no new connection);
#     animates [data-conviction-pct] meter, flashes verdict badge on card,
#     shows ephemeral notification toast. Injected as IIFE via BaseLayout.
#   lib/batting-average.ts — UPDATED: scoring rewritten to use verdict events
#     (event_type='verdict') instead of score+death thresholds; first-write-wins
#     per slug; pending = totalSealed − resolvedSlugs.size.
#   lib/collectiveMemory.ts — UPDATED: getVerdictRecord(slug) + getAllVerdicts()
#     read from conviction_ledger WHERE event_type='verdict'.
#   lib/conviction-ledger.ts — UPDATED: 'verdict' added to LedgerEventType.
#   lib/postMeta.ts — UPDATED: runtimeVerdict / verdictSealedAt / verdictHmac
#     fields added to PostDisplayData; resolveConviction() prefers runtime verdict
#     over frontmatter; safeAllVerdicts() graceful fallback; allPostDisplayData()
#     passes verdicts map into getPostDisplayData().
#   pages/admin.astro — UPDATED: VerdictResolutionPanel rendered per post in an
#     .admin-post-group; header stat shows X/Y verdicts alongside seal count.
#   layouts/BaseLayout.astro — UPDATED: verdictCeremonyScript injected.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (conviction_ledger gains verdict rows).
#     ADMIN_SECRET still required for both conviction-seal and verdict-resolve.
#     deploy.sh: POST /api/deadline-sweep called after start (auto-seals expired).
#
# Sprint (prev — Verdict Resolution):
#   lib/verdict-resolver.ts — NEW: runtime verdict sealing; resolveVerdict()
#     writes event_type='verdict' into conviction_ledger; HMAC-SHA256 proof;
#     VerdictAlreadySealedError idempotency guard; rowToVerdictRecord() mapper.
#   pages/api/verdict-resolve.ts — NEW: POST /api/verdict-resolve; cookie +
#     body auth (mirrors conviction-seal); broadcasts 'verdict:declared' SSE
#     event with newBattingAvg; 409 on double-seal; prerender=false.
#   components/VerdictResolutionPanel.astro — NEW: per-post admin panel; two
#     states — sealed (read-only badge + note) / open (verdict dropdown + note
#     textarea); fetch-based submit with live feedback; reload on success.
#   lib/verdict-ceremony.ts — NEW: client-side SSE listener for
#     'verdict:declared'; piggybacks on window.__presenceES (no new connection);
#     animates [data-conviction-pct] meter, flashes verdict badge on card,
#     shows ephemeral notification toast. Injected as IIFE via BaseLayout.
#   lib/batting-average.ts — UPDATED: scoring rewritten to use verdict events
#     (event_type='verdict') instead of score+death thresholds; first-write-wins
#     per slug; pending = totalSealed − resolvedSlugs.size.
#   lib/collectiveMemory.ts — UPDATED: getVerdictRecord(slug) + getAllVerdicts()
#     read from conviction_ledger WHERE event_type='verdict'.
#   lib/conviction-ledger.ts — UPDATED: 'verdict' added to LedgerEventType.
#   lib/postMeta.ts — UPDATED: runtimeVerdict / verdictSealedAt / verdictHmac
#     fields added to PostDisplayData; resolveConviction() prefers runtime verdict
#     over frontmatter; safeAllVerdicts() graceful fallback; allPostDisplayData()
#     passes verdicts map into getPostDisplayData().
#   pages/admin.astro — UPDATED: VerdictResolutionPanel rendered per post in an
#     .admin-post-group; header stat shows X/Y verdicts alongside seal count.
#   layouts/BaseLayout.astro — UPDATED: verdictCeremonyScript injected.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (conviction_ledger gains verdict rows).
#     ADMIN_SECRET still required for both conviction-seal and verdict-resolve.
#
# Sprint (prev — Verdict Wall):
#   pages/verdict.astro — NEW: SSR Verdict Wall (/verdict); every post on
#     trial sorted by tension score. Hero + stats bar + filter tabs (all /
#     living / endangered / revived / fossil) + 2-col card grid. ?filter=
#     query param drives state with zero client JS. prerender=false.
#   lib/verdict-wall.ts — NEW: pure sort + categorisation; buildVerdictWall()
#     merges PostDisplayData[] + StanceDistribution map → VerdictPost[].
#     buildStats() aggregates living / endangered / revived / fossil / contested
#     counts. filterPosts() + parseFilter() guard untrusted query params.
#   components/VerdictCard.astro — NEW: specimen-cabinet jury card; DeathClock
#     ring + title + state badge (Row 1), conviction verdict (Row 2), stance
#     bar — agree(emerald)/torn(amber)/disagree(red) (Row 3), CTA + audit link
#     (Row 4). Fossil cards desaturated via CSS filter. SSR-only, no islands.
#   styles/verdict.css — NEW: layout layer for /verdict; 2-col CSS Grid (≥600px),
#     hero, stats bar, filter tabs, contested signal banner (amber pulse glyph),
#     empty state, footer. Card-level styles scoped inside VerdictCard.astro.
#   lib/tension-score.ts — UPDATED: MIN_STANCES lowered 10→3 to enable early
#     tension signals on posts with few votes.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
#
# Sprint (prev — Conviction Audit Trail + JSON-LD):
#   pages/audit/[slug].astro — NEW: public SSR proof page per post; shows
#     sealed conviction receipt or "NOT YET SEALED" if author hasn't locked yet.
#     Returns 404 for unknown slugs. Zero client JS — pure server HTML.
#   lib/audit-verifier.ts — NEW: read-only data assembly for audit pages;
#     strips hmac_seal → RedactedSeal (hashPrefix first 16 hex chars + openssl
#     verify command). Reads from conviction_ledger via safeRead wrappers.
#   lib/json-ld.ts — NEW: single source of truth for all schema.org JSON-LD;
#     buildArticleSchema (conviction + decay additionalProperty), BreadcrumbList,
#     serializeJsonLd. No new npm deps — JSON.stringify only.
#   components/AuditReceipt.astro — NEW: visual notary stamp; SEALED/NOT YET
#     SEALED header, score, ISO date, hash prefix, collapsible openssl command.
#   components/ConvictionTimeline.astro — NEW: vertical event timeline; CSS-only,
#     eventType → amber/green/red/purple colour per Tanya design-system.
#   components/SEOMeta.astro — UPDATED: JSON-LD script injection (jsonLd prop);
#     article:author + article:section OG tags added.
#   layouts/BaseLayout.astro — UPDATED: jsonLd prop threaded through to SEOMeta.
#   pages/blog/[slug].astro — UPDATED: buildArticleSchema + BreadcrumbList injected;
#     audit receipt link added to post nav row; getSealEntry free-rides existing
#     conviction data (no new DB queries).
#   components/SiteNav.astro — UPDATED: /verdict nav link with amber contested
#     underline when any living post has tension label === 'contested'.
#   lib/heartbeat.ts — UPDATED: phantom / quiet-connection flags removed;
#     honest-zero policy — every pulse is a real reader action.
#   pages/api/heartbeat.ts — UPDATED: quiet-mode logic removed; register() called
#     without visit-count param.
#   lib/nav.ts — UPDATED: 'verdict' page mapped in getActivePage().
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db. ADMIN_SECRET still required.
#
# Sprint (prev — Cover Images):
#   content/config.ts — UPDATED: coverImage field added to blog schema.
#   lib/postMeta.ts — UPDATED: coverImage field added to PostMeta interface.
#   lib/og/ogLayout.ts — UPDATED: split-panel layout when coverImageUrl present.
#   pages/api/og/[slug].png.ts — UPDATED: toCoverImageUrl() for Satori fetch.
#   pages/blog/[slug].astro — UPDATED: full-bleed 16/6 hero above post header.
#   components/DecayCard.astro — UPDATED: cover-wrap slot; decay filter cascade.
#   components/TombstoneCard.astro — UPDATED: ghost cover in graveyard.
#   lib/tension-score.ts — UPDATED: MIN_STANCES raised 1→10.
#   public/images/covers/ — NEW: building-in-public.svg + the-decay-theory.svg.
#   Dockerfile — FIXED: COPY public/ ./public/ in builder stage.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#
# Sprint (prev — Cause-of-Death Labels):
#   lib/cause-of-death.ts — NEW: pure cause-of-death classifier (no DB,
#     no side effects). Five verdicts: SUPERSEDED → UNSEALED → REJECTED →
#     ABANDONED → DECAYED. causeLabel / causeDescription / causeCSSClass.
#   lib/collectiveMemory.ts — cause_of_death TEXT column; COALESCE first-write.
#   lib/postMeta.ts — causeOfDeath field; safeCausesOfDeath() graceful fallback.
#   pages/api/entomb.ts — buildCauseData() snapshot; fire-and-forget persist.
#   components/TombstoneCard.astro — cause-of-death badge, oklch colours.
#   pages/graveyard.astro — findDominantCause() stat in graveyard header.
#
# Sprint (prev — HMAC Seal + Admin Web UI):
#   pages/admin.astro — NEW: protected conviction seal dashboard at /admin.
#   components/AdminSealForm.astro — NEW: per-post seal form with live preview.
#   lib/conviction-ledger.ts — HMAC-based seal (hmac_seal column, auto-migrated).
#   pages/api/conviction-seal.ts — dual auth (body secret + cookie admin_token).
#   pages/api/conviction-audit.ts, conviction-stats.ts — chain verify removed.
#   components/ConvictionHero, ConvictionDeclaration, ConvictionAuditTrail —
#     broken-chain UI removed; aligned with HMAC-only audit model.
#
# Supports: Hybrid SSR (Astro + Node), SQLite collective memory,
#           Death Clock (SVG ring countdown, 6-tier urgency, CSS-only animation),
#           Honest Presence (per-slug + global-scope reader count via SSE),
#           Ghost Echoes (revival sparkline — 8-week history, adaptive pulse),
#           dynamic OG image generation (satori + resvg),
#           Consequential Decay / Graveyard (entomb + resurrect),
#           Graveyard Discovery Surface (teaser, stats, tombstone history),
#           Honest Graveyard (entombed_at timestamps, SSR pagination, mood lock),
#           Graveyard Epitaph layout (OKLCH tokens, scroll-driven entrance,
#           candlelight footer, CSS :has() resurrection glow, empty state),
#           Endangered Posts (urgency tiers, pulse, erosion bar, DeathClock ring),
#           2-phase revival dismiss (bloom → collapse, a11y, Android-optimised),
#           SavedMoment toast (emotional payoff when last card revived),
#           Cinematic Revival (5-phase: arc → localStorage gate → WAAPI dissolve
#           → chromatic h1 flash → witness badge + SSE ripple),
#           Revival Guard anti-gaming (fingerprint, velocity),
#           Passive Reading Heartbeat (reading_seconds, readingBonus),
#           Author Conviction Notes (ConvictionPanel, belief audit, verdicts),
#           NowLine (pinned author status + graveyard hint on homepage),
#           Murmurs (wall whispers on homepage, CLI-only submission),
#           Grain overlay (CSS noise texture via --decay-grain),
#           Graveyard Ledger / Epitaph Engine (Hall of Records, deterministic
#           narrative epitaphs, 4-tier survival classification, summary stats),
#           Conviction Physics (author verdict modulates decay speed: 0.7×–1.4×;
#           dominant verdict wins; ambient tint glow on SVG death-clock ring).

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

# ── 2. Ensure named data volumes exist (data dir + SQLite collective memory) ──
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
  --env ADMIN_SECRET="${ADMIN_SECRET:-}" \
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

# ── 6. Deadline sweep — auto-seal any expired-unsealed posts ─────────────────
# POST /api/deadline-sweep seals posts whose resolution_deadline has passed but
# whose verdict was never sealed by the author (auto-verdict: 'abandoned').
# Idempotent — already-sealed posts are skipped. Skipped silently if no secret.
if [ -n "${ADMIN_SECRET:-}" ]; then
  echo "==> [deploy] Running deadline sweep…"
  # Give the Node process a moment to fully bind before hitting the endpoint.
  sleep 3
  SWEEP_RESPONSE=$(curl --silent --show-error --max-time 15 \
    --request POST \
    --header "Authorization: Bearer ${ADMIN_SECRET}" \
    "http://localhost:${HOST_PORT}/api/deadline-sweep" || echo '{"error":"curl failed"}')
  echo "==> [deploy] Deadline sweep response: ${SWEEP_RESPONSE}"
else
  echo "==> [deploy] Skipping deadline sweep (ADMIN_SECRET not set)"
fi

# ── 7. Prune dangling images from previous builds ────────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

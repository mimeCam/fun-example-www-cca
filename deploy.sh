#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog hybrid SSR site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.
# All errors are captured in deployment.log for post-mortem investigation.
#
# Architecture v52 — Verdict Wall Outcome Filters (2026-04-07)
#   Core feature: Temporal Decay + Collective Memory — posts visually age;
#   reader attention revives them. Author conviction sealed with HMAC proof.
#   Public audit receipts prove the author's past self is on record.
#   The Verdict Wall surfaces every post on trial, sorted by tension.
#   The Prediction Vault tracks every falsifiable claim across all posts;
#   verdicts are sealed by admin via HMAC proof — reality decides outcomes.
#   The Verdict Dispute Engine lets readers who staked 'disagree' formally
#   challenge an author's sealed verdict; ≥33% dispute ratio marks it
#   'contested' and excludes it from the batting average until resolved.
#   OG cards now lead with accountability: batting average is the hero.
#   Live Conviction Meter: batting average animates in real-time as verdicts
#   are sealed — no page reload needed; SSE stream reused (no extra connection).
#   Conviction Anchor: every conviction seal and verdict is posted to a public
#   GitHub Gist — independently verifiable, immutable revision history; the
#   author cannot quietly delete the record. Fail-open: local DB is the source
#   of truth; GitHub is corroboration only. PAT scope: gist only.
#   Verdict Ceremony: each sealed verdict now has a permanent public ceremony
#   page at /verdict/[slug] — three-act proof the accountability loop closed.
#   Live SSE layer reveals Act III (batting average) in real-time if visitor
#   is present at the exact moment the verdict is written. VerdictCard CTA
#   links directly to the ceremony when a verdict exists.
#   Batting Average Hero: homepage rebuilt conviction-first — the single %
#   number is the above-fold hero (Zone 1); living posts with verdict filter
#   tabs (all/correct/wrong/pending) sit below (Zone 2). Dedicated OG share
#   card at /api/og/batting-average.png (5 min cache).
#   RFC 3161 Trusted Timestamps: every conviction seal and verdict is now
#   notarised by FreeTSA.org (public, free RFC 3161 TSA) — a cryptographically
#   signed timestamp token (TST) is stored alongside the HMAC proof in
#   conviction_ledger; the audit page surfaces the TST for independent
#   openssl verification. Fail-open: HMAC seal remains valid without TSA.
#   Full CMS Trust Verification: rfc3161-verifier.ts upgraded from byte-scanner
#   to full pkijs CMS SignedData validation — "verified: true" now means the
#   TSA signature cryptographically checks out against the bundled FreeTSA root
#   CA cert (src/assets/freetsa-ca.der). TrustBadge on conviction hero now
#   shows a live cryptographic badge. New GET /api/trust-verify/:slug endpoint
#   for admin tooling. Fail-open unchanged.
#   Track Record Page: authoritative /track-record SSR page — three-act layout:
#   Act I (BattingAverageHero, reused), Act II (full conviction ledger table:
#   every sealed bet, score/10, seal date, verdict badge, resolved date, Gist
#   anchor link — CSS Grid, responsive), Act III (CSS-only running accuracy
#   sparkline — bar height = running % at each resolved verdict; 50% cognitive
#   anchor dashed baseline). Navigation chip (batting average %) now deep-links
#   to /track-record. No new DB tables, no new npm packages, no new services.
#   Verdict Wall Outcome Filters: filter tabs on /verdict refactored from
#   decay-state (living/endangered/revived/fossil) to conviction-outcome
#   (correct/wrong/pending) — aligns the wall with the accountability model;
#   wrong gets equal visual weight to correct (calm red, no shame treatment —
#   Tanya §VerdictPage); VerdictWallStats gains correct/wrong/pending counts;
#   stats bar updated to show outcome pair + contested signal; parseFilter()
#   updated to accept new valid values; CSS adds outcome-aware active states
#   and stat-value colour tokens.
#
# Sprint (latest — Verdict Wall Outcome Filters):
#   lib/verdict-wall.ts — UPDATED: ConvictionOutcome type added ('correct' |
#     'wrong' | 'pending'); VerdictFilter now aliases ConvictionOutcome | 'all'
#     (living/endangered/revived/fossil no longer valid filter values);
#     VerdictWallStats gains correct/wrong/pending counts alongside existing
#     decay-state counts; resolveOutcome() maps runtimeVerdict → outcome;
#     buildStats() tallies outcome counts; filterPosts() filters by outcome;
#     parseFilter() valid set updated; _testVerdictWall() assertions updated.
#   src/pages/verdict.astro — UPDATED: FilterTab gains optional variant field;
#     tabs array rebuilt with correct/wrong/pending entries (Tanya §VerdictPage);
#     stats bar shows correct/wrong pair + contested signal; filter nav aria
#     label updated; tab class list includes verdict-filter-tab--{variant}.
#   src/styles/verdict.css — UPDATED: outcome-variant active states added
#     (.verdict-filter-tab--correct/wrong/pending.--active); stat value colour
#     tokens (.verdict-stat__value--correct/--wrong) added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Track Record Page):
#   pages/track-record.astro — NEW: SSR page at /track-record; assembles
#     buildTrackRecord() data from existing conviction + verdict ledgers;
#     renders BattingAverageHero (Act I) + TrackRecord (Acts II+III).
#     prerender=false. Page meta adapts to sealed/cold state.
#   components/TrackRecord.astro — NEW: Act II ledger table (CSS Grid, 7-col;
#     responsive down to 480 px — collapses sealed-date + anchor on very small
#     screens); Act III sparkline (CSS-only, bar-height = running pct, 50%
#     dashed baseline); tamper-evidence footer (first seal date).
#   lib/track-record.ts — NEW: pure O(n) assembly; buildTrackRecord() reads
#     getSealEntry() + getVerdictRecord() + getAnchorData() + computeBattingAverage()
#     (all existing helpers — zero new DB queries); outcomeToStatus() maps
#     VerdictOutcome → TrackRecordStatus; buildRunningHistory() derives sparkline
#     data points in verdict-chronological order. Fail-open (try/catch → cold state).
#   components/SiteNav.astro — UPDATED: batting chip href /verdict → /track-record;
#     tooltip copy "See prediction timeline →" → "See full track record →".
#   lib/nav.ts — UPDATED: 'track-record' added to PageId union + PAGE_PREFIXES
#     mapping; _testNav() updated with /track-record assertion.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Full CMS Trust Verification):
#   lib/rfc3161-verifier.ts — UPGRADED: full pkijs CMS SignedData verification;
#     pkijs.setEngine() one-time WebCrypto init; parseSignedData() + verifyCmsSignature()
#     validate against bundled FreeTSA CA cert; extractTstGenTime() reads genTime
#     from TSTInfo.eContent; assertGenTimesMatch() cross-checks byte-scanner vs
#     pkijs (±1 s); verifyToken() now async; verified=true = CMS sig valid.
#     src/assets/freetsa-ca.der — NEW: bundled FreeTSA root CA cert (DER format);
#     read once at runtime by getFreeTsaCert() singleton; enables offline
#     CMS chain verification without external network call.
#   pages/api/trust-verify/[slug].ts — NEW: GET /api/trust-verify/:slug; live
#     RFC 3161 re-verification endpoint; returns { verified, timestamp, tsaName,
#     slug }; 200 with verified=false when no TST exists. For admin tooling.
#     prerender=false.
#   components/AuditReceipt.astro — UPDATED: await verifyToken() (now async);
#     no UX change — openssl command still shown for independent validation.
#   components/TrustBadge.astro — UPDATED: await verifyToken() (now async);
#     badge now reflects genuine CMS sig validation, not just parseability.
#   components/ConvictionHero.astro — UPDATED: TrustBadge imported; tst prop
#     accepted; TrustBadge rendered right-aligned in conviction label row
#     (Tanya §TrustBadge placement — pushed to row end via margin-left:auto).
#   pages/blog/[slug].astro — UPDATED: getTstForSeal() called; tstData passed
#     to ConvictionHero so TrustBadge is live on post pages.
#   package.json — UPDATED: pkijs@^3.4.0 added (MIT, ~180 KB; used by
#     Let's Encrypt tooling; zero native deps — pure JS/WebCrypto).
#   Dockerfile — UPDATED: COPY --from=builder /app/src/assets/ ./src/assets/
#     added to server stage so freetsa-ca.der is available at runtime
#     (readFileSync resolves against process.cwd() = /app).
#   Infrastructure: no new services, volumes, env vars, or networks.
#     pkijs installed via npm ci (package.json updated). freetsa-ca.der bundled
#     in image via Dockerfile src/assets copy. SQLITE_VOLUME mounts revivals.db
#     (tst_* columns already migrated). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Batting Average Hero):
#   components/BattingAverageHero.astro — NEW: Zone 1 conviction hero section;
#     full-height above fold; large amber pct, pill badges (correct/wrong/
#     pending), HMAC anchor badge, share button (clipboard API + prompt
#     fallback); cold state (em dash + "no verdicts sealed yet"); data-cm-pct
#     wires into existing initLiveConviction() for zero-reload live updates.
#     SSR-only.
#   components/RiverFilter.astro — NEW: verdict filter tabs for the homepage
#     feed; state lives in URL param ?verdict= (shareable + crawlable); hidden
#     until avg.correct + avg.wrong > 0 (Elon cold-start rule); SSR filters
#     post list — no client re-fetch, no flash of wrong content. Exports
#     VerdictFilter type (all | correct | wrong | pending).
#   lib/og/battingAverageLayout.ts — NEW: dedicated Satori JSX tree for 1200×630
#     batting average share card; amber pct hero, progress bar, stats row
#     (correct/wrong/pending), HMAC badge; cold variant (em dash). Pure function;
#     zero side-effects; independent of accountabilityLayout.
#   pages/api/og/batting-average.png.ts — NEW: GET /api/og/batting-average.png;
#     dedicated batting average OG share card; 5 min cache (public, max-age=300);
#     pipeline: computeBattingAverage() → battingAverageLayout() → PNG.
#   lib/og/renderOGImage.ts — UPDATED: renderBattingAverageImage() export added;
#     used by batting-average.png.ts.
#   pages/index.astro — UPDATED: homepage rewrite; Zone 1 = BattingAverageHero;
#     Zone 2 = DecayCard feed with RiverFilter (SSR verdict filtering via
#     ?verdict= param); ogSlug='batting-average' → og:image from
#     /api/og/batting-average.png; band layout removed; endangered posts remain.
#   components/SiteNav.astro — UPDATED: navigation surgery (Tanya §17); 3 links
#     (posts · verdict · now); graveyard/predictions/map links removed; batting
#     chip now an <a> linking to /verdict; ghost chip cold state ("0 bets sealed")
#     when no verdicts exist; presence dot only — text/count spans removed.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Conviction River):
#   pages/map.astro — NEW: SSR Conviction River page at /map; fetches all
#     non-entombed posts via allPostDisplayData(); builds RiverPost[] via
#     buildRiverPosts(); positions each node as % along temporal axis (publish
#     → deadline). Year markers generated server-side. prerender=false.
#   lib/river-data.ts — NEW: server adapter PostDisplayData[] → RiverPost[];
#     toRiverPost() maps slug/title/url/publishedAt/deadline/decayOpacity/
#     decayBlur/decaySat/verdict/daysRemaining; riverClientScript() returns
#     self-contained IIFE for 60s decay tick (rAF loop, no external deps).
#   components/RiverNode.astro — NEW: individual prediction node; CSS vars
#     (--decay-opacity/--decay-blur/--decay-sat) control live appearance;
#     verdict ring colour: emerald(still-true)/rose(wrong)/ash(abandoned)/
#     amber(unaudited)/cold(null). SSR-only.
#   components/RiverLegend.astro — NEW: river legend panel; explains verdict
#     colour ring codes and decay visual system. SSR-only.
#   styles/river.css — NEW: Conviction River layout; horizontal scroll canvas,
#     year markers, node positioning, verdict ring palette, decay animation
#     vars, empty state, responsive behaviour.
#   lib/client/river.ts — NEW: client-side decay tick module (60s rAF loop);
#     reads data-posts JSON from #river-data element; patches CSS vars per
#     node; no SSE, no fetch — pure wall-clock math.
#   lib/nav.ts — UPDATED: 'map' added to PageId + PAGE_PREFIXES.
#   components/SiteNav.astro — UPDATED: /map nav link added.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Verdict Ceremony):
#   pages/verdict/[slug].astro — NEW: SSR ceremony page at /verdict/[slug]/;
#     assembles SealEntry + VerdictRecord + BattingAverage from DB; 404 for
#     unknown slugs; renders pending state when seal exists but no verdict yet.
#     prerender=false. Links to /audit/[slug]/ for full audit trail.
#   components/VerdictCeremony.astro — NEW: three-act ceremony component;
#     Act I (original conviction: score, HMAC fingerprint, Gist anchor link);
#     Act II (verdict outcome badge, author note, HMAC stamp, resolved date);
#     Act III (sitewide batting average — starts visually cold; @starting-style
#     reveals it on load when already resolved; verdict-reveal.ts patches it
#     live if visitor is present at verdict time). SSR-only — no polymorphism.
#   lib/client/verdict-reveal.ts — NEW: ceremony-page SSE listener; reuses
#     window.__heartbeat EventSource (Mike arch §3 — one connection); on
#     'verdict:declared' event for this slug: reveals Act III via class toggle,
#     patches data-vc-pct / data-vc-correct / data-vc-wrong / data-vc-pending;
#     race guard prevents double-reveal if SSR already served resolved state.
#   lib/verdict-resolver.ts — UPDATED: getVerdictRecord(slug) added — read-only
#     single-slug lookup for the ceremony page; queries conviction_ledger WHERE
#     event_type='verdict'; returns null if verdict not yet sealed. Safe to call
#     from any SSR route; never writes.
#   components/VerdictCard.astro — UPDATED: Row 4 CTA logic branched on
#     runtimeVerdict; sealed posts show 'Verdict sealed ◈' link to ceremony page
#     (emerald colour — loop closed); entombed posts without verdict show graveyard
#     link; unsealed living posts show 'Take Stance →' as before.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     GITHUB_PAT optional (Conviction Anchor — gist scope only).
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Conviction Anchor):
#   lib/conviction-anchor.ts — NEW: GitHub Gist integration; anchorConviction()
#     creates a public Gist (one per post) at seal time containing slug/score/
#     hmac/sealedAt JSON; anchorVerdict() PATCHes the same Gist appending a
#     verdict block; GitHub revision history makes the original seal immutable.
#     Fail-open contract: callers catch errors; local seal is the source of truth.
#     PAT scope required: gist only — never a broader token.
#   lib/anchor-verifier.ts — NEW: live cross-verification at audit page render
#     time; fetches raw Gist JSON, compares hmac to local DB; returns
#     verified / mismatch / unreachable / no-anchor — mismatch surfaces visibly
#     as a red flag on the audit page; not suppressed.
#   lib/conviction-ledger.ts — UPDATED: three new anchor columns auto-migrated
#     (anchor_gist_id, anchor_url, anchor_raw_url); updateAnchor() / getAnchorData()
#     / getAnchorGistId() accessors added; nullable — pre-anchor era rows carry null.
#   lib/audit-verifier.ts — UPDATED: anchorUrl added to RedactedSeal; assembleAuditPayload()
#     reads getAnchorData() and threads anchorUrl into the seal struct.
#   pages/api/conviction-seal.ts — UPDATED: calls anchorConviction() post-seal
#     when GITHUB_PAT env var present; persists receipt via updateAnchor();
#     anchorUrl included in JSON response. Fail-open — GitHub errors don't abort seal.
#   pages/api/verdict-resolve.ts — UPDATED: calls anchorVerdict() on existing
#     Gist (via getAnchorGistId()) when GITHUB_PAT present; fail-open.
#   components/AuditReceipt.astro — UPDATED: external anchor row added; shows
#     Gist link when anchored, '⏳ anchor pending' otherwise; anchor-verification
#     badge (verified / mismatch / unreachable / pending) colour-coded.
#   pages/audit/[slug].astro — UPDATED: calls verifyAnchor(slug) at render time
#     and passes AnchorVerification to AuditReceipt.
#   Infrastructure: no new services or volumes. One new optional env var:
#     GITHUB_PAT — gist-scoped PAT; omit to skip anchoring (fail-open).
#     SQLITE_VOLUME mounts revivals.db (anchor columns auto-migrated on first run).
#     ADMIN_SECRET still required. deploy.sh passes GITHUB_PAT from .env.
#     POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Live Conviction Meter):
#   lib/client/live-conviction.ts — NEW: client-side SSE listener for
#     'verdict:declared' events; reuses window.__heartbeat EventSource (Mike
#     arch §3 — one connection, no duplicates); rAF counter animation tweens
#     batting-average pct; prefers-reduced-motion instant patch; circuit-breaker
#     skips animation when delta === 0. DOM contract: data-cm-pct / data-cm-
#     correct / data-cm-wrong / data-cm-pending attributes on ConvictionMeter.
#   lib/client/verdict-flash.ts — NEW: ephemeral fixed-position verdict banner;
#     mounts → auto-fades after 3 s → self-removes; verdict-aware colour (green/
#     amber/rose/ash) per Tanya §3.1; ARIA live region for screen readers;
#     suppressed entirely under prefers-reduced-motion (ARIA still fires).
#   styles/conviction-live.css — NEW: CSS transitions for ConvictionMeter live
#     updates; color-variant swap (background/border/box-shadow only — no height);
#     cm-digit-pop keyframe via linear() spring easing; correct-pill highlight;
#     prefers-reduced-motion guard disables all transitions & animations.
#   components/ConvictionMeter.astro — UPDATED: id="conviction-meter" for DOM
#     targeting; data-cm-pct / data-cm-correct / data-cm-wrong / data-cm-pending
#     attributes added for live patching; deferred <script> calls initLiveConviction().
#   layouts/BaseLayout.astro — UPDATED: imports conviction-live.css globally so
#     the CSS is available on every page that renders ConvictionMeter.
#   pages/api/verdict-resolve.ts — UPDATED: verdict:declared SSE broadcast now
#     includes correct / wrong / pending pill counts alongside newBattingAvg so
#     the client can patch all four values in one atomic update.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Accountability OG Image Pipeline):
#   lib/og/accountabilityData.ts — NEW: discriminated-union data contract
#     (cold | post | home variants); buildPostAccountabilityData() +
#     buildHomeAccountabilityData() builders isolate DB access from layout.
#   lib/og/accountabilityLayout.ts — NEW: Satori JSX tree (1200×630);
#     accountability-first design — batting % hero in amber; cold/post/home
#     variants; design tokens locked to Tanya's colour system.
#   lib/og/renderOGImage.ts — UPDATED: renderAccountabilityImage() export
#     added (new pipeline); toSVG() generalised to accept any element tree;
#     legacy renderOGImage() retained for decay-aesthetic cards.
#   pages/api/og/[slug].png.ts — UPDATED: uses accountability pipeline
#     (batting avg hero) instead of decay-aesthetic layout for per-post cards.
#   pages/api/og/home.png.ts — NEW: GET /api/og/home.png; sitewide
#     accountability OG card; linked from homepage <meta og:image>.
#     Pipeline: buildHomeAccountabilityData() → accountabilityLayout() → PNG.
#   config/seo.config.ts — UPDATED: homeOgImageUrl() convenience alias added;
#     ogImageUrl() doc updated to mention 'home' slug.
#   pages/index.astro — UPDATED: og:image points to /api/og/home.png via
#     homeOgImageUrl() so social shares lead with batting average.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (unchanged). ADMIN_SECRET still required.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Verdict Dispute Engine):
#   lib/verdict-dispute.ts — NEW: dispute state machine; recordDispute()
#     writes to verdict_disputes table (same revivals.db WAL singleton);
#     getDisputeState() → no-verdict / no-stancers / clean / contested;
#     disputeAlreadyRecorded() idempotency guard; UNIQUE index on
#     (post_slug, session_id). Auto-creates verdict_disputes table on first
#     use — zero schema migrations needed.
#   pages/api/verdict-dispute.ts — NEW: POST /api/verdict-dispute; gated by
#     X-Session-Id header + stance check (only 'disagree' stakers may file);
#     idempotent (double-submit returns current state); returns state/ratio/
#     total/disputes. prerender=false.
#   components/DisputeChallenge.astro — NEW: "Challenge Moment" UI; renders
#     inert HTML, client script gates visibility (localStorage stance check);
#     shown only to readers who staked 'disagree' + verdict sealed + not yet
#     disputed; fetch POST on click → reveals outcome + updates tally badge.
#   components/DisputeTally.astro — NEW: public dispute ratio badge; always
#     visible when verdict sealed; colour-coded grey → amber → terra cotta
#     (contested); live-updated by DisputeChallenge client script.
#   lib/batting-average.ts — UPDATED: contested verdicts (dispute ratio ≥33%)
#     treated as pending — excluded from correct/wrong denominator; prevents
#     author self-grading; isContested() helper wraps getDisputeState().
#   lib/stance-ledger.ts — UPDATED: getStanceForSession() added — point lookup
#     returning the recorded stance for a session (used by verdict-dispute API).
#   pages/blog/[slug].astro — UPDATED: DisputeChallenge + DisputeTally
#     components rendered; getDisputeState() called server-side; audit-receipt-
#     nudge row reflowed to flex to accommodate tally badge inline.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     verdict_disputes table auto-created in revivals.db (SQLITE_VOLUME).
#     ADMIN_SECRET still required for seal-prediction + conviction-seal.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Prediction Vault):
#   lib/prediction-engine.ts — NEW: pure prediction logic; derivePredictionStatus()
#     (pending / overdue / correct / incorrect / partial); flattenPredictions()
#     flattens all post predictions with real-time status; computeStats() accuracy
#     metrics; groupByStatus() UI ordering (Overdue → Pending → Resolved).
#     predictions_ledger table auto-created in revivals.db (same SQLITE_VOLUME).
#     Zero new npm deps — better-sqlite3 already in use. No schema migrations.
#   pages/api/seal-prediction.ts — NEW: POST /api/seal-prediction; cookie + body
#     auth (mirrors verdict-resolve.ts); HMAC-SHA256 audit proof; INSERT OR IGNORE
#     idempotency guard; 409 on double-seal. prerender=false.
#   components/PredictionCard.astro — NEW: per-prediction display card; compact
#     mode for inline post rendering; status badges (pending/overdue/correct/
#     incorrect/partial); resolution_criteria and deadline display; SSR-only.
#   components/PredictionVault.astro — NEW: public /predictions wall; three
#     groups — Overdue (urgent) / Pending / Resolved; accuracy stats bar.
#   pages/predictions.astro — NEW: SSR /predictions route; getCollection + wall-
#     clock status derivation at request time. prerender=false.
#   content/config.ts — UPDATED: predictions: z.array(predictionSchema).optional()
#     added to blog schema. prediction.id values are immutable post-publish.
#   lib/batting-average.ts — UPDATED: PredictionAccuracy type +
#     computePredictionBattingAverage() for nav chip.
#   lib/nav.ts — UPDATED: 'predictions' added to PageId + PAGE_PREFIXES.
#   components/SiteNav.astro — UPDATED: /predictions nav link added.
#   pages/blog/[slug].astro — UPDATED: PredictionCard inline section renders
#     per-post predictions; links to /predictions vault.
#   Infrastructure: no new services, volumes, env vars, or npm packages.
#     SQLITE_VOLUME mounts revivals.db (predictions_ledger auto-created).
#     ADMIN_SECRET still required for seal-prediction + conviction-seal.
#     deploy.sh: POST /api/deadline-sweep still called post-start (unchanged).
#
# Sprint (prev — Deadline Clock):
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
GITHUB_PAT_VAL="$(grep -oP '^GITHUB_PAT=\K.*' "${SCRIPT_DIR}/.env" 2>/dev/null || echo '')"

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
  ${GITHUB_PAT_VAL:+--env GITHUB_PAT="${GITHUB_PAT_VAL}"} \
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

# ── 7. Prune dangling images from previous builds ────────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

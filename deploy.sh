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
# ── Sprint "v179 CiteFlash + cron-lazy-boot" (2026-04-23) — active cycle ──
#   Two independent wedges ship together in this sprint's active git area:
#
#   (A) CiteFlash / ApiAlso design-system consolidation (Mike napkin §4,
#       Tanya §5 pass 1). The copy→arrive→verify receipt flash and the
#       "Also via API" curl chip now ship as TWO reusable primitives any
#       citable region can mount, with a new prebuild guard freezing the
#       single-source-of-truth discipline (one `@keyframes cite-flash*`
#       producer, one JS producer for `CITE_FLASH_DURATION_MS`). Wired
#       onto /api/docs this sprint: the matrix gets one inline CiteFlash
#       mark next to its h2, the endpoint docs row grows one ApiAlso chip
#       that reveals `curl -s "${origin}/api/docs/cite?axis=…&stage=…"`.
#       Files in the active git area:
#         · src/lib/cite-flash.ts          (NEW ~170 lines, pure)
#         · src/components/CiteFlash.astro (NEW ~210 lines, SSR + inline IIFE)
#         · src/components/ApiAlso.astro   (NEW ~190 lines, SSR + inline IIFE)
#         · src/styles/cite-flash.css      (NEW ~175 lines, two keyframes,
#                                           no new tokens — reuses --motion-
#                                           cite-ack-duration + --gold*)
#         · scripts/check-cite-flash-reuse.ts (NEW — the guard, WARN mode
#                                           on first ship; flips --error
#                                           in the next wedge once the
#                                           four legacy receipt-* keyframes
#                                           collapse onto CiteFlash)
#         · src/pages/api/docs.astro       (UPDATED — imports + mounts
#                                           <CiteFlash /> next to matrix h2,
#                                           <ApiAlso endpoint="/api/docs/cite"
#                                           params={axis, stage} /> inside
#                                           the endpoint docs dd, and marks
#                                           the matrix container `data-citable`
#                                           so the IIFE's copy listener fires)
#         · package.json                   (UPDATED — prebuild chain grows
#                                           one line: `check-cite-flash-reuse`
#                                           slotted after `check-no-chip-
#                                           lit-in-arrival` and before
#                                           `check-citation-delegation`)
#         · AGENTS.md                      (UPDATED — adds "WIP — CiteFlash
#                                           consolidation" line flagging
#                                           the four remaining receipt-*
#                                           holdouts as next wedge)
#
#   (B) cron-runner production lazy-boot fix (Sid — deployment.log receipt).
#       Previous deploys witnessed `cron-runner boot witness: boot-lines=0
#       · ts-iso-lines=0` because Astro's `astro:server:start` integration
#       hook only fires under `astro dev` / `astro preview`; the compiled
#       standalone Node server (`dist/server/entry.mjs`) never ran the
#       integration pipeline, so deadline-sweeper and OTS-poller never
#       ticked. Fix: middleware now calls a new `bootFromEnv()` seam on
#       the first request (idempotent via `booted` guard). HOST/PORT come
#       from the Dockerfile's existing `ENV PORT=7100`. Files in the
#       active git area:
#         · src/lib/cron-runner.ts (UPDATED — +32: exports `bootFromEnv()`)
#         · src/middleware.ts      (UPDATED — +8: calls bootCronFromEnv()
#                                   before pinning the clock on every
#                                   request; the `booted` flag keeps it
#                                   O(1) after the first tick)
#       Expected deploy-time effect: probe 8l (cron-runner stderr witness)
#       should now see `boot-lines=1 · ts-iso-lines=1` in docker logs once
#       the first warm-up request (probe 8a hits /api/docs) lights the
#       middleware. The probe stays observational (WARN on miss) per its
#       existing preamble — `test:ledger-clock` at build time is the teeth.
#
#   Infrastructure deltas this sprint: NONE.
#     · No new env vars, ports, services, named volumes, docker networks,
#       or npm deps. All seven touched/new src/ + scripts/ files ship via
#       the existing `COPY scripts/` + `COPY src/` + `COPY package.json`
#       layers at the top of the builder stage — `docker build --no-cache`
#       picks them up without a Dockerfile edit. The existing
#       `persona-blog-a-data` + `persona-blog-a-sqlite` named volumes are
#       reused as-is. Port 7100 stays the single public-facing surface
#       (external Caddy terminates SSL and proxies to it).
#     · PREBUILD CHAIN FLIPS: one new line joins the wall.
#         `npx tsx scripts/check-cite-flash-reuse.ts`
#       — sweeps src/styles + src/components + src/layouts for any second
#       `@keyframes cite-flash*` / `@keyframes receipt-*` producer, and
#       src/lib + src/components for raw-ms literals near `cite-flash`
#       references. WARN mode this wedge (four legacy receipt-* keyframes
#       still exist in seal-receipt / arrival-receipt / audit-receipt /
#       verify-receipt). Next wedge consolidates those and flips to
#       `--error`. Observational only this sprint — the image still
#       builds on violations; they surface in deploy.log as warn lines.
#     · RUNTIME PROBES: one new probe (8n) witnesses CiteFlash + ApiAlso
#       markers on /api/docs. WARN-only (Mike §8 "build-time gate, runtime
#       witness"). See the probe's in-place preamble for the exact markers.
#     · Probe 8l (v173 cron-runner stderr witness): same probe, same
#       contract — but with the (B) lazy-boot fix in place, the boot line
#       should now APPEAR in docker logs for the first time in production.
#       Silence here after this sprint means the middleware lazy-boot
#       seam regressed; before this sprint silence was a known-false-
#       negative documented in the probe preamble.
#
#   Previous-sprint banner ("v178 Parity Console") preserved below for
#   continuity — that wedge's probes (8m) are still live and still green
#   on every deploy. Earlier sprints' banners are kept in git history.
#
# ── Sprint "v178 Parity Console" (2026-04-23) — on-page tri-mouth proof ──
#   Pure-discipline wedge that brings the "three mouths, one byte" identity
#   ON-PAGE, inside /api/docs, as a reading-column section (Tanya UX §7).
#   ONE new pure producer (src/lib/parity-proof.ts::buildProof), ONE new
#   SSR component (src/components/ParityConsole.astro), ONE new client
#   module (src/lib/client/parity-console.ts), ONE new prebuild guard
#   (scripts/check-parity-proof.ts — `--error` from day one, no warn mode),
#   ONE new unit+integration suite (src/lib/parity-proof.test.ts — 35
#   cells + VALID_REF_FIXTURES + byteDrift unit tests). The citation-
#   delegation guard's TARGETS literal grows 4 → 6 — the SSR proof file
#   AND the client repainter are both now registered as oracle consumers,
#   so any future file-level reimplementation of `cellCitationPayload`
#   inside EITHER module fails the prebuild (same teeth the existing
#   four targets already have).
#
#   Infrastructure deltas this sprint: NONE.
#     · No new env vars, ports, services, named volumes, docker networks,
#       or npm deps. Everything ships via the existing `COPY scripts/` +
#       `COPY src/` + `COPY package.json` layers at the top of the
#       builder stage — the next `docker build --no-cache` picks them up
#       without a Dockerfile edit. The existing `persona-blog-a-data`
#       + `persona-blog-a-sqlite` volumes are reused as-is. No schema
#       migrations, no new API surfaces — the client repainter refetches
#       from the EXISTING `GET /api/docs/cite` terminal mouth (already
#       warmed in probe 8a + 8f), so no new route to probe.
#     · PREBUILD CHAIN FLIPS: two new lines join the wall. One guard
#       (inserted right after `check-tri-mouth.ts --error`):
#         `npx tsx scripts/check-parity-proof.ts`
#       — sweeps 35 cells + VALID_REF_FIXTURES and asserts `driftBytes
#       === 0` for every ParityProof (fail-closed, no warn phase). One
#       test (inserted right after `test:citation-golden`):
#         `npx tsx --test src/lib/parity-proof.test.ts`
#       — locks byteDrift semantics (UTF-8 byte length, not code-unit),
#       sweeps every (axis, stage), and asserts pointer ≡ keyboard ≡
#       curl byte-for-byte. Any drift in ANY of the three mouths fails
#       `npm run build` → image build fails → this script exits non-zero
#       → previous container stays stopped → operator re-runs after fix.
#     · check-citation-delegation guard: the TARGETS literal grows from
#       four files to six (v178 adds `src/lib/parity-proof.ts` and
#       `src/lib/client/parity-console.ts`). Every consumer of
#       `cellCitationPayload` is now registered as an oracle delegate;
#       a future reimplementation in EITHER new file would fail the
#       existing delegation guard (unchanged teeth, wider reach).
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/parity-proof.ts (NEW, ~160 lines) — the pure producer.
#       `buildProof(axis, stage, origin, ref?)` assembles the three mouth
#       payloads: pointer and keyboard both route through the SAME
#       `cellCitationPayload()` oracle (the UI split is for the reader —
#       the bytes are one oracle); curl dispatches through
#       `curlMouthPayload()` (the existing handler-invoking helper
#       citation-golden.ts owns). `byteDrift(...strings)` is the pure
#       UTF-8-byte pairwise witness (returns 0 iff every string is
#       byte-identical to the first). `proofSweep(origin)` yields one
#       ParityProof per (axis, stage) — the prebuild guard's input.
#       `defaultProof(origin)` is the SSR convenience for the grid's
#       origin cell (`typography × fresh`). `diffSentence(proof)` is
#       the narrator ("0 bytes · pointer ≡ keyboard ≡ curl" at rest).
#     • src/components/ParityConsole.astro (NEW, ~113 lines) — the
#       on-page demonstrator. Reading-column section, SSR-rendered,
#       mounted on /api/docs right below the matrix (above the endpoint
#       docs). Three `<figure data-pane="…">` panes (pointer / keyboard /
#       curl), each showing the exact payload for the currently-focused
#       cell (or the rest-state origin). One `data-parity-diff` line
#       whose `data-drift` attr flips between `zero` and `drift` — with
#       `data-drift="zero"` the line reads the parity sentence. One
#       `data-parity-jump` anchor that keyboard users use to land on
#       the focused cell.
#     • src/lib/client/parity-console.ts (NEW, ~206 lines) — the DOM
#       repainter. One `focus` listener (capture; `focus` does not
#       bubble) on `.api-docs__matrix`. On focus-change: rewrite pointer
#       + keyboard panes from the oracle (pure), mark the curl pane
#       pending, refetch `/api/docs/cite?axis=…&stage=…` with
#       `cache: 'no-store'`, write the curl bytes, repaint the diff
#       line via the SHARED `byteDrift()` / `diffSentence()` from
#       parity-proof.ts. Fail-closed: curl errors render as "—" in
#       the pane and "curl pending" in the diff line (never red,
#       never blocking).
#     • src/styles/parity-console.css (NEW) — tokens-only section
#       shell + pane grid + diff line. Motion fires ONLY when drift > 0
#       (arrival / drift-narration only — at rest, zero frames); a
#       reduced-motion sanctuary drops even that.
#     • scripts/check-parity-proof.ts (NEW, ~103 lines) — the prebuild
#       guard. Walks 35 (axis × stage) cells + every VALID_REF_FIXTURES
#       nonce and asserts `driftBytes === 0` for every resulting
#       ParityProof. Single success line (`✅ check-parity-proof: N
#       proofs green (drift=0 everywhere).`) on the happy path; one
#       grep-friendly finding per drift on failure. `--error` mode from
#       day one per Mike napkin §5 (no warn purgatory).
#     • src/lib/parity-proof.test.ts (NEW, ~151 lines) — unit +
#       handler-integration suite. byteDrift pure semantics (empty /
#       single / identical / differing / UTF-8 multibyte edge cases),
#       default-cell wiring, full 35-cell sweep with driftBytes === 0,
#       VALID_REF_FIXTURES sweep (pointer leg equals oracle
#       byte-for-byte), proofSweep() row count equals
#       STAGE_AXES × DECAY_STAGES, diffSentence narrator phrasing
#       ("0 bytes · pointer ≡ keyboard ≡ curl" at rest vs
#       "<N> bytes drift" on drift).
#     • scripts/check-citation-delegation.ts (UPDATED, +9) — TARGETS
#       literal grows 4 → 6: adds `src/lib/parity-proof.ts`
#       (requiredSymbols: cellCitationPayload, cellCitationLabel,
#       cellAnchorId — the SSR helper imports all three) and
#       `src/lib/client/parity-console.ts` (requiredSymbols:
#       cellCitationPayload — the client repainter routes pointer +
#       keyboard through it). Mouth strings: "parity proof (SSR)" /
#       "parity console (client)".
#     • scripts/check-citation-delegation.test.ts (UPDATED, +15/−3) —
#       TARGETS.length assertion flips 4 → 6; new test asserts both new
#       paths are registered.
#     • src/pages/api/docs.astro (UPDATED, +16) — imports
#       `ParityConsole` + `parity-console.css`; mounts `<ParityConsole />`
#       inside the reading column, right below the matrix; imports
#       `../../lib/client/parity-console` inside the page's `<script>`
#       so the client module bundles with the docs chunk.
#     • package.json (UPDATED, +2/−1 on prebuild + 2 new npm scripts) —
#       prebuild chain grows one guard (after `check-tri-mouth.ts
#       --error`) and one test (after `test:citation-golden`). Two new
#       convenience scripts: `check:parity-proof` +
#       `test:parity-proof`.
#
#   Credits: Mike Koch (napkin §2 shape, §4 file table + LoC budget,
#   §5 points-of-interest — origin discipline, no-trailing-newline,
#   no-store on refetch, fail-closed curl pane, zero-new-animations,
#   §6 work distribution, §8 shipping criteria), Tanya Donska (UX spec
#   §7 tri-mouth proof strip "bring it on-page", §10 motion roster —
#   motion narrates drift only, §11 rounded-corner discipline —
#   container > detail), Elon Musk (§1 red-line — prebuild guards are
#   the moat, §5 "bring it on-page"), Paul Kim (§7 90-second
#   make-or-break test — can a reader eyeball parity in one glance?),
#   AGENTS.md (freeze, one-oracle), Sid — 2026-04-23.
#   Motto: "code maintenance without tests."
#
# ── Sprint "v173 Ledger+Jobs Wedge" (2026-04-23) — clock-seam migration ──
#   Pure-discipline wedge between v177.1 and the next big feature: 17
#   raw `Date.now()` / `new Date()` callsites across ten ledger + cron
#   + job files now route through the `clock.ts` seam, the cron stderr
#   helper is consolidated to ONE producer, and a new prebuild golden
#   locks the byte-identity invariant at the ledger floor. The
#   `check-no-raw-now` tally falls 80 → 63, which puts the guard's
#   `--warn → --error` flip 1–2 wedges away (next two flagged: presence-
#   hub, live-decay). NO infrastructure deltas — no new env vars, ports,
#   services, named volumes, docker networks, or npm deps; the touched
#   src/ files ship via the existing `COPY src/ ./src/` layer; the new
#   prebuild test ships via the same layer; the existing
#   `persona-blog-a-data` + `persona-blog-a-sqlite` volumes are reused
#   as-is (the wedge is internal-API only — no new wire surfaces, no
#   schema migrations).
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/clock.ts (UPDATED, +28) — extracts `logJson(job, event,
#       data)` as the single producer for cron/job stderr lines. The
#       function reads its `ts` from `nowISO()` so a `withClock(iso, …)`
#       scope can pin the stamp during tests. Three files (cron-runner,
#       deadline-sweeper, ots-poller) duplicated the same three-line
#       helper before this wedge — they now collapse to a 3-line curry
#       that delegates here. Inline `_testClock()` block grows one
#       stderr-snoop assertion (Mike PoI-2: pin must reach the stamp).
#     • src/lib/cell-event-ledger.ts (UPDATED, +6/−3) — three default-
#       arg callsites (`clampTimestamp(ts, now = …)`, `windowCutoff
#       (days, now = …)`, `ledgerMaturity(now = …)`) flip from raw
#       `Date.now()` to `clockNow()`. Default arg semantics preserved
#       (caller can still inject a custom now); inside `withClock(iso, …)`
#       the seam is observed at call time, not at module load (Mike PoI-2).
#     • src/lib/conviction-ledger.ts (UPDATED, +18/−2) — both ledger-
#       write `ts` stamps (`buildChainParams`, `sealConviction`) move
#       to the seam. Adds a `__setDbForTests(handle | null)` test hatch
#       (mirrors `__setSharedDbForTests` in collectiveMemory.ts) so the
#       new ledger-clock golden can pin a `:memory:` DB without mutating
#       data/revivals.db on disk. Closes the old singleton + initialises
#       the schema on the override.
#     • src/lib/stance-ledger.ts (UPDATED, +12/−1) — `recordStance`
#       timestamp routes through the seam; same `__setDbForTests` hatch
#       as conviction-ledger (one twin per ledger, three :memory: DBs
#       in the golden — see below).
#     • src/lib/verdict-dispute.ts (UPDATED, +4/−2) — `writeDisputeRes-
#       olution` + `recordDispute` stamps move to the seam.
#     • src/lib/verdict-resolver.ts (UPDATED, +3/−1) — `resolveVerdict`
#       seal `ts` moves to the seam (HMAC + chain hash share the pinned
#       stamp under `withClock`, so a sealed verdict is reproducible
#       under a frozen clock).
#     • src/lib/graveyard-ledger.ts (UPDATED, +4/−1) — `survivalDays`
#       fallback (`post.entombedAt ?? new Date()`) flips to `nowDate()`
#       from the seam.
#     • src/lib/cron-store.ts (UPDATED, +8/−3) — three `Date.now()`
#       writes (`recordStart`, `recordFinish`, `recordError`) move to
#       the seam. Mike PoI-3: cron-runner is outside the SSR request,
#       so the seam falls through to wall-clock in prod; the wedge is
#       about future test pinnability, not a live drift fix.
#     • src/lib/cron-runner.ts (UPDATED, +6/−4) — local 3-line `logJson`
#       helper retired; replaced by a job-name curry over
#       `clockLogJson('cron-runner', …)` — every callsite below stays
#       at two args while the `ts` is pinned through `nowISO()`.
#     • src/lib/jobs/deadline-sweeper.ts (UPDATED, +6/−5) — same
#       retirement: local `logJson` collapses to a curry over the
#       shared seam.
#     • src/lib/jobs/ots-poller.ts (UPDATED, +6/−13) — same retirement
#       PLUS the skew-clock read in `warnStuckSeals()` (`now =
#       Date.now()`) flips to `clockNow()` so the "stuck > 4h / > 24h"
#       thresholds are pin-testable. The `LogPayload` interface is
#       deleted — the shared seam owns the shape now.
#     • src/lib/ledger-clock.test.ts (NEW, ~140 lines) — the §E byte-
#       identity invariant carried to the ledger floor. Three sections:
#         (1) Three independent SQLite ledgers (cell-event, conviction,
#             stance) all stamp at FROZEN_MS under one `withClock(iso,
#             …)` — and rows from two distinct scopes don't cross-
#             contaminate (Promise.all with two distinct ISOs).
#         (2) Mike PoI-2: `clampTimestamp(ts)` re-evaluates the seam at
#             call time — in-window passes through, far-past clamps to
#             pinned-now − 1h, far-future clamps to pinned-now + 1h.
#         (3) `clock.logJson` stamps via the seam — one line under a
#             scope, two lines in the same scope are byte-identical
#             on `ts`, ts shape matches `nowISO()` outside any scope.
#       Hermetic via three `:memory:` DBs (one per ledger) swapped in
#       through each ledger's `__setDbForTests` hatch — never touches
#       `data/revivals.db`.
#     • package.json (UPDATED, +2 inserts) — `prebuild` chain grows one
#       entry between `test:collective-memory-clock` and `test:tri-mouth-
#       inventory`: `REVIVALS_DB_PATH=:memory: npx tsx --test src/lib/
#       ledger-clock.test.ts`. Also adds the matching `test:ledger-clock`
#       npm script for local invocation. Any drift in any of the ten
#       wedged files now FAILS the image build.
#     • scripts/check-no-raw-now.ts (UPDATED, +14/−5) — wedge log grows
#       a v173 entry: tally fell 80 → 63 across ten files; the next
#       two fattest wedges (presence-hub:6, live-decay:5) plus cell-
#       heat:3 put the guard flip to `--error` within reach of the
#       wedge AFTER the next.
#     • AGENTS.md (UPDATED) — `WIP — Clock migration` line bumps from
#       "80 raw callsites" to "63 raw callsites remain after v173
#       ledger+jobs wedge. Flip --error after next 1–2 wedges
#       (presence-hub, live-decay)."
#
#   Infrastructure deltas this sprint: NONE.
#     · No new env vars, ports, services, named volumes, docker networks,
#       or npm deps. The two test-time env vars introduced by the new
#       golden (`COMMUNITY_DB_PATH=:memory:` already in prebuild;
#       `REVIVALS_DB_PATH=:memory:` already used by keep-golden) are
#       deliberately NOT forwarded by `docker run` — pinning the prod
#       container to `:memory:` would lose stance/conviction/revival
#       state on every restart (critical regression). Test-time seams
#       only.
#     · Reused unchanged: `persona-blog-a-data` (server-side data dir),
#       `persona-blog-a-sqlite` (collective-memory + revivals + stance
#       + conviction + verdict ledgers). The wedge is INTERNAL API
#       only — every existing wire shape is preserved, every existing
#       SQLite schema is preserved, every existing route's response is
#       byte-identical (just now reproducible under a pinned clock).
#     · The `cron-runner` boot stderr line is now emitted by the shared
#       seam — its JSON shape is EXACTLY preserved (`{ts, job, event,
#       data}` with the same key order), and runtime probe 8l (NEW
#       this sprint) greps `docker logs` for that exact shape to
#       witness the consolidation reached the wire.
#
#   Credits: Mike Koch (napkin §2 cluster wedge — ten files migrated in
#   one cluster instead of one-per-PR; PoI-2 default-arg seams; PoI-3
#   cron-runner future-pinnability; §3.3 fattest-wedge ordering),
#   Paul Kim (E7 — "one pinned clock per SSR request" carried to the
#   ledger floor; §E byte-identity invariant cloned from citation-
#   golden to ledger-clock golden), Elon Musk (§1 red-line — guard is
#   the canary; §5.2 wedge-log keeps the migration calendar honest),
#   Krystle Clear (per-file freeze-witness pattern), Tanya Donska (§6
#   evidentiary stamps don't dance — same shape pre/post wedge),
#   Sid (≤-10 LOC per function — the new `logJson` is 3 lines, every
#   curry is 1 line, every `__setDbForTests` is 4 lines).
#   2026-04-23.
#
# ── Sprint v177.1 "Arrival Receipt §E" (2026-04-23) — cross-mouth wall ──
#   v177.1 closes the one follow-up v177 left open: the arrival-receipt
#   golden test is JOINED to the prebuild wall this sprint, AND its §E
#   block (the whole point of the sprint) promotes the falsifiable
#   criterion from "a test you can run locally" to "a gate npm run
#   prebuild enforces before astro build starts". Any drift between the
#   three mouths — producer / route body / DOM painter — now FAILS the
#   Docker image build (→ this script exits non-zero, previous container
#   already stopped, operator redeploys after fixing the drift).
#
#   The handshake itself — copy→arrive→verify — shipped in v177:
#   `/api/docs?r=<nonce>` now earns a visible, named receipt. One pure
#   producer (src/lib/arrival-receipt.ts::buildArrivalReceipt), three
#   mouths — the same shape fans out to SSR HTML, the new curl endpoint,
#   and the browser DOM. v177.1 is the lock on that three-way identity.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/arrival-receipt.test.ts (UPDATED) — §E cross-mouth
#       byte-parity golden added. Four pinned vectors (three happy:
#       typography×fresh, tempo×endangered, drag-highlight×fossil;
#       one fail: unknown-cell). Every vector funnels through
#       `observeThreeMouths()` which reads all three paths under ONE
#       `withClock()` scope:
#         A) producer     → `serializeArrivalReceipt(buildArrivalReceipt(…))`
#         B) route body   → invokes `GET /api/docs/arrival` in-process via
#                           a minimal `{ url, request }` context
#         C) painter bytes→ `receiptBytesForPanel(buildArrivalReceipt(…))`
#       Then `assertTriMouthParity()` asserts A≡B≡C + no trailing
#       newline/CR + single-line shape + `JSON.stringify(JSON.parse(x))
#       ≡ x` (catches pretty-print / key-reorder drift). Two extra guards:
#       the route returns `Cache-Control: no-store` on BOTH happy AND
#       failure paths (a reverse-proxy that ever pinned `pinnedAt` would
#       serve a stale clock to a later happy hit — one assertion, one
#       line). Header: `content-type: application/json; charset=utf-8`.
#     • src/lib/client/arrival-acknowledge.ts (UPDATED) — extracted the
#       panel's ONE JSON-serialisation callsite into a new exported
#       helper `receiptBytesForPanel(r)`. `writePanel()` now calls that
#       helper instead of `serializeArrivalReceipt()` directly. The
#       helper is a pure re-export of the producer's bytes from the
#       painter's POV — extracting it means the §E golden can observe
#       the painter's bytes without pulling a DOM library into CI (Mike
#       napkin §6.1 "zero new deps"). Byte-level behaviour of the panel
#       is UNCHANGED; the wire-level `data-receipt-json` attribute
#       carries the exact same bytes as before the refactor.
#     • package.json (UPDATED) — one-line addition to the `prebuild`
#       chain: `npx tsx --test src/lib/arrival-receipt.test.ts` inserted
#       right after `check-tri-mouth.ts --error`. The test was NOT on
#       the prebuild wall in v177 (called out as a follow-up); v177.1
#       closes that follow-up. Every drift between the three mouths
#       now fails the image build.
#     • AGENTS.md (UPDATED) — v177 "WIP — Arrival Receipt" entry
#       retired; replaced with "Arrival Receipt (shipped v177.1): third
#       mouth live at GET /api/docs/arrival; §E cross-mouth golden on
#       the prebuild wall, pinned clock, 4 vectors inc. one fail."
#     • src/pages/api/docs/arrival.ts (NEW) — third mouth. Thin route
#       handler: reads axis/stage/r from URL, hands to the producer,
#       emits `serializeArrivalReceipt()` bytes + `statusForReason()`
#       HTTP code. `prerender = false` because the body embeds the
#       per-request pinned clock. Non-GET verbs route through a shared
#       `rejectNonGet` helper that emits 405 with `Allow: GET`.
#     • src/components/ArrivalReceipt.astro (NEW) — dockable aside
#       panel. SSR emits the shell (hidden by default) with the
#       `data-arrival-panel` DOM handle + three `data-arrival-{cell,
#       ref,pinned}` slots the client module paints into. Tokens-only
#       styling, reduced-motion honoured.
#     • src/lib/client/arrival-acknowledge.ts (NEW) — browser
#       orchestrator. Reads `?r=<nonce>` + hash-encoded cell, calls
#       the SAME `buildArrivalReceipt()` helper (one producer!), paints
#       the panel DOM, emits byte-identical JSON to
#       `data-receipt-json` (Mike §5.10 falsifiable criterion), pulses
#       the target cell once via `--motion-cite-ack-*` tokens.
#     • src/styles/arrival-receipt.css (NEW) — dock panel + one-beat
#       pulse. Tokens-only; reduced-motion sanctuary at the bottom.
#     • src/styles/motion.css (UPDATED) — adds the single motion token
#       pair `--motion-cite-ack-duration` + `--motion-cite-ack-easing`
#       (semantic alias over flow — 200ms, same tempo as the rest of
#       the handshake surfaces). Reduced-motion inherits zero.
#     • src/pages/api/docs.astro (UPDATED) — imports ArrivalReceipt +
#       arrival-receipt.css, gates the client module import on
#       `Astro.url.searchParams.has('r')` (zero bytes for non-arrival
#       visitors, Mike §5.6), renders `<ArrivalReceipt />` inside the
#       reading column.
#
#   Infrastructure deltas this sprint:
#     · NO new env vars, ports, services, named volumes, or docker
#       networks. Still a pure-SSR + pure-client handshake; no DB, no
#       ledger, no rate-limit table. The existing `persona-blog-a-data`
#       + `persona-blog-a-sqlite` volumes are reused as-is; no schema
#       work, no migrations.
#     · NO Dockerfile changes. The two touched files (test + client
#       helper) both live under `src/` and ship via the existing
#       `COPY src/` layer. The updated package.json (prebuild chain)
#       is already in the `COPY package.json package-lock.json* ./`
#       layer at the top of the builder stage, so `npm run build`
#       picks up the new chain on the next `docker build --no-cache`.
#     · PREBUILD CHAIN FLIPS: one new line joins the wall between
#       `check-tri-mouth.ts --error` and `check-verify-bundle.ts`:
#         `npx tsx --test src/lib/arrival-receipt.test.ts`
#       The §E cross-mouth golden is the falsifiable criterion — any
#       drift between producer, route body, or DOM painter bytes fails
#       `npm run build` (image build fails → this script exits non-zero
#       → previous container stays stopped → operator re-runs after fix).
#     · New wire-level guarantees (runtime, enforced by this script):
#         · The §E golden runs IN the builder stage at image-build
#           time. If any of the 4 vectors' producer/route/painter bytes
#           ever diverge, the image never gets tagged. All existing
#           probes 8k.a–8k.f (panel shell, conditional chunk, happy
#           path, malformed → 400, unknown-cell → 404, POST → 405)
#           remain — they cover the three mouths end-to-end at runtime.
#         · NEW runtime probe 8k.g — deploy-time byte-identity witness.
#           A SECOND happy vector (tempo × endangered with a distinct
#           ref suffix) hits `GET /api/docs/arrival` and asserts 200 +
#           `"ok":true` + `"anchor":"axis-tempo-stage-endangered"` +
#           `Cache-Control: no-store` on BOTH happy AND fail responses.
#           The §E golden proves the bytes identical at BUILD; 8k.g
#           proves the route keeps serving them under production env
#           (middleware clock pin, no-store header, charset=utf-8).
#
# ── Sprint v176 PR-E "seal wave" (2026-04-23) — ParityPip hoist + flip ──
#   Pays the last wedge on the Tri-Mouth Inventory and hoists the parity
#   dot out of inline /api/docs markup into ONE site-wide partial. Three
#   things flip on `main` this cycle:
#     1. `keep-post` row status `pending-curl-peer` → `wired`; its curl
#        field moves from the event-beacon stand-in (`POST /api/ingest/
#        cell-event`) to the dedicated ledger-write peer (`POST /api/keep`,
#        already mounted in PR-E wave 1). Inventory now reads 5/5 wired.
#     2. Cap ledger (`data/tri-mouth-pending-cap.json`) descends 1 → 0;
#        `check-tri-mouth` prebuild flips `--warn` → `--error`. Fail-closed
#        on any future drift (Paul MH-2 / Krystle ratchet).
#     3. `parityGoldEarned()` returns true for the first time; the new
#        `<ParityPip />` partial lights its dot and the operator-language
#        sentence is emitted on two surfaces: site footer (every page via
#        BaseLayout) AND the /api/docs parity section.
#   Mike napkin PR-E §3.4 (partial), §3.5 (hoist), §3.7 (single oracle),
#   Tanya UX §3 (anatomy), §6 (rename — "API parity: passing", not "gold
#   pip"), §9 (state matrix), Elon §5.5 (three nouns + a number), Paul
#   MH-1 (pip-ignition moment), Sid — every helper ≤ 10 lines, zero
#   module-level state, zero new tokens, zero new animations.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/components/ParityPip.astro (NEW, untracked) — one renderer,
#       two surfaces. Pure SSR (no DOM, no JS hydration, no client
#       islands). Reads only from `src/lib/parity-seal.ts` (parityFacts /
#       parityGoldEarned / parityCopy / PARITY_MOUTH_COUNT). Renders:
#       a <span class="parity-pip__dot"> (8px, --gold/--gold-dim/
#       --text-tertiary depending on state), a plain-English label
#       ("API parity: passing" when gold; "API parity: N channel(s)
#       pending" when enforced but debt remains; "API parity: dark"
#       when not enforced), a fact tail ("5 rows · 3 channels ·
#       build-enforced"), and a fail-closed operator-language copy
#       paragraph (parityCopy() → null drops the <p> silently). Two
#       variants: `footer` (wraps in <aside>, full-width band; default)
#       and `inline` (drops the aside for embedding; what /api/docs
#       uses). Click target is an <a href="/api/docs#parity">.
#     • src/layouts/BaseLayout.astro (UPDATED) — imports ParityPip and
#       mounts `<ParityPip variant="footer" />` at the top of the
#       <footer class="site-footer">. Every page that uses BaseLayout
#       now carries the pip — the louder sibling of the footer nav
#       links. No new CSS here; the component is self-styling.
#     • src/pages/api/docs.astro (UPDATED) — the inline parity-pip +
#       seal-sentence markup is REPLACED by `<ParityPip variant="inline"
#       dotId="parity-dot" />`. The page retains the per-row matrix
#       (parityBandRows()) + the quiet `parityReceipt()` summary line.
#       Two cosmetic deltas on the wire:
#         · h2 copy changes `Every verb, three mouths.` → `Every verb,
#           three channels.` (Tanya §6 rename — "mouth"/"pip" are
#           retired from user-visible copy; "channel" is the plain
#           word for pointer/keyboard/curl).
#         · The <section> gains `id="parity"` so the partial's
#           `<a href="/api/docs#parity">` resolves to a real anchor.
#       CSS classes `.api-docs__parity-pip` and `.api-docs__parity-seal`
#       are RETIRED (the CSS is owned by `.parity-pip__*` now).
#     • src/lib/tri-mouth-inventory.ts (UPDATED) — `keep-post` row
#       flipped: status `pending-curl-peer` → `wired`; curl field
#       `POST /api/ingest/cell-event` → `POST /api/keep` (the ledger-
#       write peer PR-E wave 1 mounted). wiredActions() climbs 4 → 5;
#       pendingSummary() reports zero on every kind; parityGoldEarned()
#       flips true. The file's producer reference is unchanged
#       (src/lib/keep-pact.ts — `/api/keep.ts` already imports
#       `keepPact` from it, satisfying §5.5 import-regex).
#     • data/tri-mouth-pending-cap.json (UPDATED) — cap 1 → 0. Monotonic
#       descent; `checkMonotonicCap` now requires ≤ 0 outstanding rows
#       (i.e. none). Comment bumped PR-D → PR-E; phrased "0 rows
#       pending, 5/5 wired, parityGoldEarned() === true".
#     • package.json (UPDATED) — two edits to `prebuild`:
#         · `check-tri-mouth.ts` → `check-tri-mouth.ts --error`
#           (fail-closed on any inventory drift from now on).
#         · NEW test line inserted into the chain:
#           `COMMUNITY_DB_PATH=:memory: REVIVALS_DB_PATH=:memory: npx
#           tsx --test src/lib/keep-golden.test.ts` — the three-mouth
#           byte-identical golden from PR-E wave 1, now part of the
#           prebuild wall (no longer local-only).
#     • src/lib/collectiveMemory.ts (UPDATED) — `dbPath()` now honours
#       `REVIVALS_DB_PATH` when set (mirrors `COMMUNITY_DB_PATH` on
#       communityPosts.ts); pass `:memory:` for hermetic tests. Default
#       `data/revivals.db` is unchanged — production path is 1:1 the
#       same, so the named SQLite volume (`persona-blog-a-sqlite`
#       mounted at /app/data) still persists revivals across deploys.
#     • src/lib/keep-golden.test.ts (UPDATED) — header comments + a
#       new `before()` guard now ALSO require `REVIVALS_DB_PATH=:memory:`
#       alongside the existing `COMMUNITY_DB_PATH=:memory:`. Without it
#       the three-mouth deepEqual breaks on re-runs (the route's
#       `incrementRevival` would inherit stale `kept` state from a
#       persistent dev revivals.db). Paul Kim hermetic rule §2.
#     • scripts/check-tri-mouth.ts (UPDATED) — adds
#       `printGoldPipBannerIfEarned()` (≤ 10 LoC, Sid): under `--error`
#       mode, when 5/5 wired AND cap=0, prints ONE celebratory summary
#       line (`tri-mouth: 5/5 wired, cap=0, pip=lit ✓`). Pure print,
#       no new module, no new branch in parity-seal.ts. Surfaces in
#       the Docker build log → deployment.log on every redeploy.
#     • scripts/check-tri-mouth.test.ts (UPDATED) — describe block
#       collapsed "v176 1/2/3-stance" → "v176 PR-E keep-post". New
#       assertions: keep-post row is `wired` with curl `POST /api/keep`;
#       wiredActions().length === 5; pendingSummary() all zero;
#       readyToPromote() still true. Revive + stance rows asserted
#       un-regressed. Fails loud on any future demotion.
#     • scripts/check-token-compliance.ts (UPDATED) — adds
#       `src/components/ParityPip.astro` to `GUARD_FILES`. The new
#       partial is token-only (no hard-coded hex, no raw px / ms);
#       guarded from day one so future edits cannot introduce drift.
#
#   Infrastructure deltas this sprint:
#     · NO new env vars in production. `REVIVALS_DB_PATH` is a TEST-
#       time seam only (required to be `:memory:` for keep-golden);
#       when unset (runtime / deploy), the default `data/revivals.db`
#       inside the `persona-blog-a-sqlite` volume is used — identical
#       to every prior sprint. The env var is NOT forwarded in the
#       `docker run` block; forwarding `:memory:` into production
#       would LOSE REVIVAL STATE ON RESTART (critical regression).
#     · NO new ports, services, networks, or named volumes. ParityPip
#       is a pure-SSR Astro partial; it ships via the same `COPY src/`
#       the Dockerfile already does.
#     · NO new API routes. /api/keep was mounted in PR-E wave 1 and is
#       already warmed by probe 8i; this PR only flips the INVENTORY
#       row from `pending-curl-peer` → `wired` (a value, not a path).
#     · NO Dockerfile changes. The cap-ledger COPY line still reads
#       the same file; only the JSON value descended 1 → 0.
#     · Prebuild chain: `check-tri-mouth` flips from WARN to ERROR.
#       Any future drift (a row demotion, cap monotonicity violation,
#       missing producer import) now FAILS the image build — the
#       container-rerun safety net in this script means the previous
#       container is already stopped, so the operator must redeploy
#       after the fix. This is by design (Paul MH-2 / Mike §8).
#     · New wire-level artefacts to warm:
#         · Every page's footer now carries `.parity-pip` + `.parity-
#           pip__dot` + `data-parity-state="lit"` (site-wide; one new
#           probe 8j below on `/`).
#         · /api/docs h2 copy changed (mouths → channels); probe 8f
#           grep strings updated accordingly.
#         · /api/docs parity anchor `id="parity"` must resolve — the
#           pip's href (`/api/docs#parity`) is the only click path.
#
# ── Sprint v176 PR-D (2026-04-23) — "1/2/3-stance wedge" ────────────────
#   Builds on v175 PR-C's R-chord wedge (which crossed the
#   `readyToPromote()` threshold at 3 wired rows). PR-D wires the fourth
#   mouth — the `1` / `2` / `3` keyboard chord on the `stance` row of
#   StickyStanceBar — bringing the tri-mouth tally to 4 wired of 5. All
#   remaining debt now lives on ONE row (`keep-post`, curl-peer), so the
#   next PR that pays that wedge flips `check-tri-mouth --warn →
#   --error` and mints the parity gold pip. Mike napkin v176 §1–8,
#   Tanya §3.2 seal-closed state + §3.3 chip-lit discipline, Krystle
#   PR-D scope, Sid — every function ≤ 10 lines, zero module-level state.
#
#   Honest state after this PR: 5 rows / **4 wired** (cite-cell,
#   submit-post, revive, stance). ONE row still owes a wedge —
#   `keep-post` (pending-curl-peer — the /api/ingest/cell-event POST is
#   a beacon, not a ledger-write peer). `parityGoldEarned()` stays
#   `false` until that last wedge lands (Tanya §4.6 — no gold on a
#   half-debt ledger). The band footer receipt now reads "1 mouth
#   pending · curl-peer (keep-post)". readyToPromote() stays `true`.
#
#   The monotonic cap ledger (`data/tri-mouth-pending-cap.json`)
#   descends 2 → 1 in the same PR that wires the stance keyboard —
#   Mike §3.7 "paying a wedge = decrementing the cap". The guard
#   stays in WARN for this sprint; the `--warn → --error` flip happens
#   in the follow-up PR that wires keep-post's curl-peer, at which
#   point the cap descends to 0 (Paul MH-2, Mike §8 out-of-scope).
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/client/stance-hotkey.ts (NEW, untracked) — the fourth
#       sibling to keep-hotkey.ts / submit-hotkey.ts / revive-hotkey.ts.
#       Pure `isStanceKey()` predicate (rejects Cmd/Ctrl/Alt combos so
#       Cmd+1/Ctrl+1 browser tab-switches + Alt+1 platform chords
#       fall through; Shift+digit produces !/@/# which is implicitly
#       filtered). Pure `keyToStance()` mapper (`1→agree`, `2→torn`,
#       `3→disagree`; one frozen STANCE_KEY_MAP as sole source of
#       truth). Bar-visibility gate (no-op until `.ssb` carries
#       `ssb--visible` — mirrors submit-hotkey's inStep3 gate).
#       Voted-state gate (no double-cast). Text-input focus guard.
#       120ms chip-lit flash via `lightForKey()` (Tanya §3.3 same
#       beat). Auto-boots on DOMContentLoaded; `bindStanceHotkey()`
#       idempotent and no-ops on pages without `.ssb`.
#     • src/lib/client/stance-hotkey.test.ts (NEW, untracked) —
#       pure-function truth-table: `1`/`2`/`3` fire, Cmd+1/Ctrl+1/
#       Alt+1 do NOT fire (browser tab-switch + platform chords win),
#       Shift-produced `!`/`@`/`#` do NOT fire, keyToStance maps in
#       the right order, and the stance predicate is DISJOINT from
#       keep/revive predicates so the four keyboard mouths never race
#       on a single keystroke. Joined to the prebuild chain this PR
#       (package.json adds the `--test` line).
#     • src/lib/tri-mouth-inventory.ts (UPDATED) — stance row promoted:
#         · keyboard: null → '1|2|3' (the hotkey shipped).
#         · status  : 'pending-keyboard' → 'wired'; pending field
#           deleted. wiredActions() climbs 3 → 4; readyToPromote()
#           stays `true` (it crossed the threshold last sprint).
#     • src/components/StickyStanceBar.astro (UPDATED) — the three
#       inline vote buttons now teach the 1/2/3 mnemonic:
#         · `aria-keyshortcuts="1"|"2"|"3"` (AT teach — mirrors the
#           pattern v174 shipped for submit's Ctrl+Enter and v175
#           shipped for revive's R).
#         · nested `<kbd class="ds-kbd ssb-vote-kbd">` chip per button
#           — same ds-kbd class the keep/revive/submit chips use, so
#           ds-kbd-lit.ts::lightForKey flashes on matching keystroke.
#           Fourth consumer of the ds-kbd design system.
#         · `ssb-vote-kbd` CSS: margin-left var(--space-1), opacity
#           0.7 → 1 on hover, hidden on mobile (<640px) so the 44px
#           touch bar stays uncrowded.
#         · inline module-script imports `../lib/client/stance-hotkey`
#           (auto-boot on import keeps the binding in the post-page
#           bundle graph).
#     • data/tri-mouth-pending-cap.json (UPDATED) — cap: 2 → 1.
#       Monotonic descent; the prebuild guard (`checkMonotonicCap`)
#       now requires ≤ 1 outstanding row. Comment bumped v175 → v176.
#     • scripts/check-tri-mouth.test.ts (UPDATED) — previous v175
#       R-chord describe block collapsed into new "v176 1/2/3-stance
#       — live inventory after stance wiring" block. Asserts the
#       post-PR shape: stance wired with pointer+1|2|3+curl, revive
#       stays wired (no regression), wiredActions().length == 4,
#       pendingSummary() is {keyboard:0, curl:0, pointer:0} (the
#       `keep-post` row's curl-peer debt lives in the status, not
#       the `pending` field), readyToPromote() == true. Regresses
#       loudly if a future PR demotes either row.
#     • package.json (UPDATED) — new `test:stance-hotkey` script and
#       the same line added to the `prebuild` chain (right after
#       `test:submit-hotkey`); AGENTS.md version bump 175 → 176.
#
#   Infrastructure deltas this sprint:
#     · NO new runtime env vars, ports, services, named volumes, or
#       docker networks. stance-hotkey.ts is a client module and
#       ships via the same `src/` COPY the Dockerfile already does.
#     · NO new API routes — the 1/2/3 chord synthesises a click on
#       the existing `.ssb-vote-btn[data-vote="…"]` which flows into
#       the existing POST /api/stance handler. One producer
#       (stance-ledger.ts), three mouths.
#     · Build-time inputs unchanged from v175 — the monotonic cap
#       file `data/tri-mouth-pending-cap.json` is still COPY'd (its
#       value just descended 2 → 1).
#     · Parity Seal wire shape unchanged from v175 PR-C — seal sentence
#       still renders `"5 actions · 3 mouths each · build-enforced
#       parity."`, cite-JSON `parity.enforced` stays `true`. The band
#       footer receipt tightens from "2 mouths pending" to "1 mouth
#       pending" but the seal itself is unchanged. 8f probe stays
#       the same; a new 8h probe was added for the stance keyboard.
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
#   8h. Warm the v176 1/2/3-stance wedge: reuse the same blog post
#       SSR and grep for the four markers that prove the StickyStance-
#       Bar keyboard teach shipped — three `aria-keyshortcuts="1|2|3"`
#       attrs (one per vote button) AND the `ssb-vote-kbd` chip class
#       (shared ds-kbd family). Presence of all proves (a) the
#       StickyStanceBar.astro template edit shipped, (b) the page-chunk
#       import of `stance-hotkey.ts` did not silently break the page,
#       (c) the fourth ds-kbd-family chip is resolvable at runtime.
#   8i. Warm the v176 PR-E keep-post curl peer (POST /api/keep) using
#       three NON-MUTATING probes so the warm-up never bumps a real
#       revival count: (a) GET /api/keep → 405 (rejector mounted; the
#       module-scope `import { keepPact }` from `../../lib/keep-pact`
#       resolved); (b) POST with malformed body → 400 ("Invalid JSON");
#       (c) POST with an unknown slug + a synthetic x-session-id → 400
#       ("Unknown slug"). Path (c) also exercises the slug-resolution
#       helper, which dynamically imports `astro:content` — a cold
#       failure there would 500 every real keep, so we want it to
#       surface at deploy-time, not on the first reader's chord. With
#       the PR-E flip, the `keep-post` row is now `wired` — a pass
#       here is a CI-backed promise, not a stand-in.
#   8j. Warm the v176 PR-E site-wide ParityPip footer partial by fetching
#       the home page `/` and grepping for the three markers that prove
#       the new `<ParityPip variant="footer" />` mount in BaseLayout
#       reached the wire: (a) the `.parity-pip` band class (component
#       rendered), (b) the `.parity-pip__dot` span (the lit dot exists),
#       and (c) the lit state attribute `data-parity-state="lit"` (gold
#       is EARNED — parityGoldEarned() returned true in SSR, not the
#       pending/dark fallback). The click target `href="/api/docs#parity"`
#       is also asserted — that anchor must resolve on /api/docs (see
#       probe 8f which now greps for `id="parity"`). One renderer, two
#       surfaces; this probe covers the site-wide half (every page via
#       BaseLayout), while 8f covers the /api/docs inline half.
#   8k. Warm the v177 "Arrival Receipt" third mouth. Five NON-MUTATING
#       probes cover the copy→arrive→verify handshake end-to-end:
#         (a) GET /api/docs (no ?r=)            → grep `data-arrival-panel`
#             in the SSR HTML. The `<ArrivalReceipt />` panel shell is
#             ALWAYS rendered (hidden until the client module paints it
#             from the hash), so a non-arrival visitor must still carry
#             the DOM handle the acknowledge module will hydrate into.
#         (b) GET /api/docs?r=<uuid>            → grep `arrival-acknowledge`
#             in the SSR HTML. The client module import is conditional
#             on `?r=` being present at SSR time (Mike napkin §5.6 —
#             zero-bytes for non-arrivals); presence proves the gate
#             latched and the bundler emitted the module chunk.
#         (c) GET /api/docs/arrival?axis=typography&stage=fresh&r=<uuid>
#             → HTTP 200 application/json with `"ok":true`, `"cell"`,
#             `"pinnedAt"`, `"parity"`. Happy path — proves the single
#             producer `buildArrivalReceipt()` is importable, the
#             serializer emits stable key order, and the SSR clock pin
#             reached the handler (the ISO-8601 `pinnedAt` string is
#             the witness).
#         (d) GET /api/docs/arrival?axis=typography&stage=fresh&r=bad
#             → HTTP 400 with `"reason":"malformed"`. The ref `bad`
#             fails `isValidRef()` (length < 8); proves the closed
#             reason vocabulary + `statusForReason()` mapping fires.
#         (e) GET /api/docs/arrival?axis=bogus-axis&stage=fresh&r=<uuid>
#             → HTTP 404 with `"reason":"unknown-cell"`. Proves the
#             AXIS_SET / STAGE_SET frozen validation sets reject
#             off-catalog coordinates AND the malformed→unknown-cell
#             precedence (bad ref would've won at 400).
#         (f) POST /api/docs/arrival                → HTTP 405 with
#             `Allow: GET`. Proves the shared `rejectNonGet` helper is
#             bound to every non-GET verb (sibling of ./cite.ts).
#       One producer, three mouths: (a)/(b) = SSR HTML mouth, (c) = curl
#       mouth, and the client module (bundled in b) is the DOM mouth.
#       All three derive their receipt from the same `buildArrivalReceipt`
#       pure function — probe (c) is the byte-identical anchor for the
#       falsifiable criterion (Mike napkin §5.10).
#   8m. Warm the v178 "Parity Console" on-page demonstrator. SSR-render
#       /api/docs and grep for seven markers that prove the new reading-
#       column section shipped AND the SSR helper dispatched cleanly
#       through the citation oracle:
#         · `data-parity-console`             — section root (component
#           mounted; a render-throw inside `await defaultProof(…)` would
#           500 the whole page before any HTML reached the wire).
#         · `Three mouths, one byte.`         — the section h2 copy
#           (plain-word user-facing title; Tanya §7).
#         · `data-pane-body="pointer"`        — the three pane bodies,
#         · `data-pane-body="keyboard"`         one per mouth. Presence
#         · `data-pane-body="curl"`             of all three proves the
#                                               panes map rendered and
#                                               each carries a non-empty
#                                               `<code>` body.
#         · `0 bytes · pointer ≡ keyboard ≡ curl` — the diff sentence at
#           rest. `diffSentence(proof)` emits this EXACT string iff
#           `driftBytes === 0`; its presence on the wire is the deploy-
#           time witness that the SSR helper's three-mouth parity
#           invariant held for the default cell (`typography × fresh`).
#         · `parity-console` client module reference — inside the
#           bundled script chunk, the module is imported from docs.astro;
#           its name surfaces in the emitted chunk filename. Presence
#           proves the page-chunk import did not silently break.
#       Observational build-time truth is the actual gate: the prebuild
#       guard (`check-parity-proof.ts`) sweeps 35 cells +
#       VALID_REF_FIXTURES at image-build time and fails the image on
#       ANY non-zero drift (→ operator redeploys after fix). This probe
#       is the "live container carries the proof" witness — a regression
#       here WARNs without tearing the container down.
#
#   8l. Witness the v173 ledger+jobs wedge on the wire by reading
#       `docker logs` and grepping for the cron-runner boot stderr line.
#       The cron-runner integration hook fires on `astro:server:start`
#       (~5s after container boot per cold-start delay), and the boot
#       line is now emitted by the SHARED `clock.logJson` seam — same
#       JSON shape as before (`{ts, job:"cron-runner", event:"boot",
#       data:{baseUrl, jobs}}`) but the producer collapsed from three
#       duplicate helpers to one. Probe asserts (a) one matching line
#       exists, (b) `"job":"cron-runner"` is present, (c) `"event":
#       "boot"` is present, (d) the `"ts":"…Z"` ISO-8601 stamp is
#       parseable. Observational only — failure WARNs, container
#       stays up; the build-time `test:ledger-clock` golden is where
#       the actual teeth live (Mike §8 "build-time gate, runtime
#       witness"). This is the v173 ledger wedge's deploy-time
#       receipt that the consolidation reached production stderr.
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
#   check-cite-flash-reuse (v179 NEW — WARN mode. Enforces single-source-
#     of-truth for the copy→arrive flash: one `@keyframes cite-flash*`
#     producer (src/styles/cite-flash.css), one JS producer
#     (src/lib/cite-flash.ts). Also flags remaining `@keyframes receipt-*`
#     holdouts (seal-receipt / arrival-receipt / audit-receipt / verify-
#     receipt) as drift vectors the next wedge will consolidate, and
#     warns on raw-ms literals near `cite-flash` references anywhere
#     outside the pure helper. Flips to `--error` once the four legacy
#     receipt-* keyframes collapse onto CiteFlash)  →
#   check-citation-delegation  →  check-duration-reasons  →
#   check-stage-tempo-divergence  →
#   check-no-raw-now (v169 NINTH guard — WARN mode; flags raw Date.now()
#     / new Date() outside the clock seam allowlist. Tally cadence:
#     100 → 80 after v172 collectiveMemory.ts wedge; 80 → 63 after
#     THIS SPRINT's v173 ledger+jobs cluster wedge (ten files: cell-
#     event/conviction/stance/verdict-dispute/verdict-resolver/
#     graveyard ledgers + cron-store/cron-runner + jobs/deadline-
#     sweeper/ots-poller). Flip to `--error` is now 1–2 wedges away —
#     next two flagged: presence-hub (6 callsites), live-decay (5).
#     Plus cell-heat (3) puts the guard's own promotion within reach
#     of the wedge AFTER next)  →
#   check-parity-proof (v178 TWELFTH guard — NEW this sprint. Imports
#     `buildProof` / `proofSweep` from src/lib/parity-proof.ts and
#     sweeps 35 (axis, stage) cells + every VALID_REF_FIXTURES nonce;
#     asserts `driftBytes === 0` for every resulting ParityProof. No
#     warn phase — `--error` mode from day one (Mike napkin §5). The
#     new on-page `<ParityConsole />` demonstrator renders bytes
#     directly from this producer, so a non-zero drift here would mean
#     the reader SEES drift in the browser — catching it at image-build
#     time keeps the console's "0 bytes" claim honest on the wire.
#     Single success line `✅ check-parity-proof: N proofs green` on
#     the happy path; grep-friendly single-line findings on failure.
#     Runs right after `check-tri-mouth --error`)  →
#   check-tri-mouth --error (v173 ELEVENTH guard — v176 PR-E flipped from
#     WARN → ERROR this sprint. Walks the frozen `TRI_MOUTH_ACTIONS`
#     literal in src/lib/tri-mouth-inventory.ts and enforces six
#     invariants: §5.1 producer file exists, §5.2 curl is VERB /api/...,
#     §5.3 curl path resolves under src/pages/api/, §5.4 every non-wired
#     row receipts its single null mouth via `pending`, §5.5 the route
#     file *imports* the producer basename (v175 teeth: import-regex,
#     not substring — comments no longer pass), §5.6 v175 monotonic
#     cap — outstanding (non-wired) row count ≤ cap in data/tri-mouth-
#     pending-cap.json (cap descended 1 → 0 this PR). 5 rows / 5 wired
#     today — FULL BOARD. Any drift that demotes a row OR violates the
#     cap monotonicity now FAILS the image build (Paul MH-2 /
#     Mike §8). When the guard passes with the board full, it prints
#     ONE celebratory summary line (`tri-mouth: 5/5 wired, cap=0,
#     pip=lit ✓`) — pure print, no new module, surfaces in this log)  →
#   test:arrival-receipt (v177.1 NEW — joined the prebuild chain this
#     sprint, right after check-tri-mouth. §A–§D (shape · key order ·
#     closed reason vocabulary · pin identity) + §E (cross-mouth byte-
#     parity golden, THE falsifiable criterion). §E reads all three
#     mouths under one `withClock()` scope — producer bytes via
#     `serializeArrivalReceipt(buildArrivalReceipt(…))`, route body via
#     in-process invocation of `GET /api/docs/arrival`, painter bytes
#     via `receiptBytesForPanel(buildArrivalReceipt(…))` — and asserts
#     A≡B≡C on 4 pinned vectors (typography×fresh, tempo×endangered,
#     drag-highlight×fossil, + one fail: unknown-cell). Extra lines:
#     no-trailing-newline, no-CR, single-line shape, and `JSON.
#     stringify(JSON.parse(x)) === x` (catches pretty-print drift);
#     route `Cache-Control: no-store` on BOTH happy AND fail paths;
#     `content-type: application/json; charset=utf-8`. If any of the
#     three mouths ever drift, the image NEVER builds — the script
#     exits non-zero with the stopped previous container intact)  →
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
#   test:stance-hotkey (v176 NEW — pure-function truth-table over {key}
#     × {modifier combos} for the `1` / `2` / `3` stance hotkey on the
#     StickyStanceBar; proves the digits fire, Cmd/Ctrl+{1,2,3} does
#     NOT (native browser tab-switch wins), Alt+{1,2,3} does NOT
#     (platform chords win), Shift-produced !/@/# does NOT, keyToStance
#     maps in button-render order, and the predicate is DISJOINT from
#     keep-hotkey + revive-hotkey so all four keyboard mouths coexist
#     without any listener racing another on a single keystroke)  →
#   test:keep-legend → test:chip-lit → test:arrival →
#   test:citation-golden →
#   test:parity-proof (v178 NEW — joined the prebuild chain this sprint,
#     right after `test:citation-golden`. Unit + integration suite for
#     src/lib/parity-proof.ts: byteDrift UTF-8 semantics (multibyte "×"
#     vs "x" drifts even though code-unit length matches), default-cell
#     wiring (typography × fresh, SENTINEL_ORIGIN), full 35-cell sweep
#     with `driftBytes === 0`, VALID_REF_FIXTURES sweep asserting
#     pointer leg equals `cellCitationPayload(…)` byte-for-byte,
#     `proofSweep()` row count equals STAGE_AXES × DECAY_STAGES, and
#     `diffSentence()` narrator phrasing at rest vs under drift)  →
#   test:journey-golden →
#   test:api-stamp-golden (v170 — proves jsonStamped's six napkin
#     acceptance properties: shape, pin identity within scope, nested-
#     scope isolation, body preservation, seam-overrides-caller, cross-
#     handler parity)  →
#   test:keep-golden (v176 PR-E NEW — joined to the prebuild chain this
#     sprint. Three-mouth byte-identical golden proving (1) direct
#     `keepPact(input, facts, deps)`, (2) `keepWithLedger()` with an
#     in-memory ledger, and (3) `POST /api/keep` dispatched in-process
#     all produce the SAME receipt under a pinned clock + fixed nonce.
#     Also asserts: bare GET → 405 (Allow: POST), missing x-session-id
#     → 400, malformed JSON → 400, unknown slug → 400, and idempotency
#     (second POST with same {sessionId, slug} returns `kept:false`).
#     Requires BOTH `COMMUNITY_DB_PATH=:memory:` AND `REVIVALS_DB_PATH=
#     :memory:` (hermetic — without the second, the route's
#     `incrementRevival` inherits stale `kept` state from a persistent
#     dev DB and the deepEqual against the direct call breaks))  →
#   test:collective-memory-clock (v172 — nine-section golden locking the
#     collectiveMemory.ts wedge against a :memory: DB; hermetic)  →
#   test:ledger-clock (v173 ledger wedge NEW — joined the prebuild chain
#     this sprint, right after `test:collective-memory-clock`. Three
#     sections: (1) §E byte-identity at the ledger floor — three
#     SQLite ledgers (cell-event, conviction, stance) all stamp at
#     FROZEN_MS under one `withClock(iso, …)`, plus a Promise.all
#     scope-isolation assertion on two distinct ISOs; (2) Mike PoI-2
#     — `clampTimestamp(ts)` in cell-event-ledger re-evaluates the
#     seam at call time (in-window passes through, far-past clamps
#     to pinned-now − 1h, far-future clamps to pinned-now + 1h);
#     (3) `clock.logJson` — ts pinned to nowISO() under scope, two
#     lines in same scope are byte-identical on `ts`, ts shape
#     matches outside any scope. Hermetic via three `:memory:` DBs
#     swapped through each ledger's NEW `__setDbForTests` hatch —
#     never touches data/revivals.db. Requires `REVIVALS_DB_PATH=
#     :memory:` so the conviction-ledger module's lazy-singleton
#     init never opens the persistent dev DB)  →
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

# ── 8f. Parity Seal warm-up (v175 → v176 PR-E) — page band + cite JSON ────
# v175 PR-A/B introduced `src/lib/parity-seal.ts` — the ONE shared
# abstraction the /api/docs page, the /api/docs/cite JSON branch, AND
# the prebuild guard all consume. v175 PR-C wired the R chord (crossed
# the readyToPromote threshold). v176 PR-D wired the 1/2/3 chord. This
# sprint (v176 PR-E) flips the last row AND hoists the inline pip +
# sentence into a site-wide `<ParityPip />` partial. Five wire-level
# consequences this probe now locks:
#
#   (a) /api/docs SSR — six markers this sprint:
#         · `api-docs__parity-grid` (row-container class) — proves the
#           `parityBandRows()` map-render executed.
#         · `Every verb, three channels.` — h2 copy. v176 PR-E rename
#           ("mouth"/"pip" retired from user-visible strings; "channel"
#           is the plain word for pointer/keyboard/curl). Presence
#           proves the new copy shipped — the OLD "three mouths" string
#           is NOT on the wire any more.
#         · `id="parity"` — the section anchor. The new ParityPip
#           partial links to `/api/docs#parity`; without this id the
#           site-wide footer pip's click target dead-ends at the page
#           top instead of scrolling to the band.
#         · `build-enforced parity.` — operator-language sentence suffix.
#           Was `null` through PR-A/B (fail-closed), non-null since
#           PR-C (readyToPromote() == true). Now emitted by
#           `.parity-pip__copy` inside the inline partial (was the
#           retired `.api-docs__parity-seal` before PR-E).
#         · `api-docs__parity-row` — proves at least one row mapped
#           through `toRow()` onto the wire.
#         · `parity-pip__dot` + `data-parity-state="lit"` — the inline
#           `<ParityPip variant="inline" />` rendered AND parity-gold
#           is earned (state="lit", not "pending"/"dark"). Together
#           they prove both halves of the PR-E hoist landed.
#
#   (b) /api/docs/cite JSON branch — four fields this PR:
#         · `"parity"`    — witness object present (curl-parity mouth).
#         · `"rows"`      — count included.
#         · `"mouths"`    — count included (always 3). Note: the JSON
#           shape still uses `mouths` as the field NAME (frozen wire
#           shape; Mike napkin §2 byte-identical). Only the UI copy
#           renamed channels — the external consumer contract is
#           stable.
#         · `"enforced"`  — the truth bit. Must be literally
#           `"enforced":true` (readyToPromote() true since PR-C).
#       Text/plain branch is deliberately NOT re-probed — 8a already
#       asserts 200+body and v175 guarantees byte-identical output
#       (Mike napkin §2) so the v174 probe is sufficient.
#
# Both surfaces are publicly reachable (no auth gate); bare GETs suffice.
echo "==> [deploy] Warming up /api/docs parity band (v176 PR-E — inline ParityPip + channels rename)…"
PARITY_BODY_FILE="$(mktemp)"
PARITY_STATUS=$(curl --silent --show-error --output "${PARITY_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
PARITY_BODY_LEN=$(wc -c < "${PARITY_BODY_FILE}" | tr -d ' ')
PARITY_HAS_GRID=$(grep -c 'api-docs__parity-grid' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_HEADING=$(grep -c 'Every verb, three channels\.' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_ANCHOR=$(grep -c 'id="parity"' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_ROW=$(grep -c 'api-docs__parity-row' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_SEAL=$(grep -c 'build-enforced parity\.' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_PIP_DOT=$(grep -c 'parity-pip__dot' "${PARITY_BODY_FILE}" || true)
PARITY_HAS_STATE_LIT=$(grep -c 'data-parity-state="lit"' "${PARITY_BODY_FILE}" || true)
# Guard against regressions: make sure the OLD h2 copy isn't still on the wire.
PARITY_HAS_OLD_HEADING=$(grep -c 'Every verb, three mouths\.' "${PARITY_BODY_FILE}" || true)
rm -f "${PARITY_BODY_FILE}"
echo "==> [deploy] /api/docs parity band: HTTP ${PARITY_STATUS} · body=${PARITY_BODY_LEN}B · grid=${PARITY_HAS_GRID} · heading=${PARITY_HAS_HEADING} · anchor=${PARITY_HAS_ANCHOR} · row=${PARITY_HAS_ROW} · seal=${PARITY_HAS_SEAL} · pip-dot=${PARITY_HAS_PIP_DOT} · state-lit=${PARITY_HAS_STATE_LIT} · old-heading=${PARITY_HAS_OLD_HEADING}"
if [ "${PARITY_STATUS}" != "200" ] || [ "${PARITY_HAS_GRID}" -lt 1 ] || [ "${PARITY_HAS_HEADING}" -lt 1 ] || [ "${PARITY_HAS_ANCHOR}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v176 PR-E parity-band markers (grid / new 'three channels' heading / id=\"parity\" anchor) — investigate (container still up)." >&2
fi
if [ "${PARITY_HAS_SEAL}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing seal sentence ('build-enforced parity.') — parityCopy() returned null; readyToPromote() may have regressed; investigate." >&2
fi
if [ "${PARITY_HAS_PIP_DOT}" -lt 1 ] || [ "${PARITY_HAS_STATE_LIT}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v176 PR-E ParityPip markers (parity-pip__dot and/or data-parity-state=\"lit\") — partial didn't render OR parityGoldEarned() is false; investigate." >&2
fi
if [ "${PARITY_HAS_OLD_HEADING}" -gt 0 ]; then
  echo "==> [deploy] ⚠ /api/docs still carries old 'Every verb, three mouths.' heading — PR-E rename didn't ship; investigate." >&2
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

# ── 8h. 1/2/3-stance warm-up (v176 PR-D) — StickyStanceBar keyboard mouth ──
# v176 PR-D wires the `1` / `2` / `3` keyboard mouth on StickyStanceBar
# (fourth sibling to keep-hotkey / submit-hotkey / revive-hotkey). The
# prebuild golden (`src/lib/client/stance-hotkey.test.ts`, newly joined
# to the prebuild chain this PR) already proves the predicate truth
# table at image-build time. This runtime probe SSR-renders the same
# blog post page as 8g (StickyStanceBar is rendered on every post via
# src/pages/blog/[slug].astro) and greps for four markers that prove
# the wedge actually shipped to the wire:
#
#   (a) Three `aria-keyshortcuts="1"` / `"2"` / `"3"` attrs — canonical
#       AT teach, one per vote button (Mike napkin v176 §6.7); presence
#       of all three proves the StickyStanceBar.astro template change
#       is live and the digit→stance binding reached the HTML wire.
#   (b) `ssb-vote-kbd` — the sighted teach chip class. Presence proves
#       (i) the nested <kbd class="ds-kbd ssb-vote-kbd"> markup shipped,
#       (ii) the stance row joins the ds-kbd family as the fourth
#       consumer (so ds-kbd-lit.ts::lightForKey resolves on keypress),
#       (iii) the page-chunk import of `stance-hotkey.ts` did NOT
#       silently break the page (a runtime module-resolution error
#       would 500 the SSR render before any HTML reached the wire).
#
# The page is publicly reachable (no auth gate, no PoW); bare GET
# suffices. Slug reused from 8g so we keep the probe footprint tight.
echo "==> [deploy] Warming up /blog/${REVIVE_SLUG} stance keyboard (v176 PR-D 1/2/3 wedge)…"
STANCE_BODY_FILE="$(mktemp)"
STANCE_STATUS=$(curl --silent --show-error --output "${STANCE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/blog/${REVIVE_SLUG}" \
  || echo '000')
STANCE_BODY_LEN=$(wc -c < "${STANCE_BODY_FILE}" | tr -d ' ')
STANCE_HAS_ARIA_1=$(grep -c 'aria-keyshortcuts="1"' "${STANCE_BODY_FILE}" || true)
STANCE_HAS_ARIA_2=$(grep -c 'aria-keyshortcuts="2"' "${STANCE_BODY_FILE}" || true)
STANCE_HAS_ARIA_3=$(grep -c 'aria-keyshortcuts="3"' "${STANCE_BODY_FILE}" || true)
STANCE_HAS_CHIP=$(grep -c 'ssb-vote-kbd' "${STANCE_BODY_FILE}" || true)
rm -f "${STANCE_BODY_FILE}"
echo "==> [deploy] /blog/${REVIVE_SLUG} stance: HTTP ${STANCE_STATUS} · body=${STANCE_BODY_LEN}B · aria-1-hits=${STANCE_HAS_ARIA_1} · aria-2-hits=${STANCE_HAS_ARIA_2} · aria-3-hits=${STANCE_HAS_ARIA_3} · ssb-vote-kbd-hits=${STANCE_HAS_CHIP}"
if [ "${STANCE_STATUS}" != "200" ] \
   || [ "${STANCE_HAS_ARIA_1}" -lt 1 ] || [ "${STANCE_HAS_ARIA_2}" -lt 1 ] \
   || [ "${STANCE_HAS_ARIA_3}" -lt 1 ] || [ "${STANCE_HAS_CHIP}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /blog/${REVIVE_SLUG} missing v176 PR-D stance keyboard markers (aria-keyshortcuts=1|2|3 and/or ssb-vote-kbd chip) — investigate (container still up)." >&2
fi

# ── 8i. v176 PR-E keep-post curl-peer warm-up (POST /api/keep) ─────────────
# With PR-E flipped, the `keep-post` row is now `wired` and its curl
# field is `POST /api/keep` (the route imports `keepPact` from
# `../../lib/keep-pact`). Three NON-MUTATING probes — none of them
# bumps the revival count — so the warm-up is safe to run on every
# redeploy. Together they prove the route is mounted, the module-scope
# import of the producer resolved (a broken import would 500 GET too),
# the JSON guards fire, and the slug-resolution helper (dynamic
# `astro:content` import) loads without throwing. Any of these
# regressing would ALSO fail the prebuild check-tri-mouth --error
# guard at image-build time, but we re-assert on the live container
# so Caddy never proxies a cold-broken surface to a real visitor.
#
#   (a) GET /api/keep        → expect 405 with `Allow: POST`. Proves
#                              the module loaded (a broken import
#                              would 500 here) AND the shared
#                              `rejectNonPost` helper is bound to
#                              the non-POST verbs.
#   (b) POST malformed body  → expect 400 ("Invalid JSON"). Proves
#                              `parseBody()` reaches the `badRequest`
#                              branch on a real worker thread.
#   (c) POST + unknown slug  → expect 400 ("Unknown slug"). The slug
#                              guard fires AFTER `slugExists()`, which
#                              dynamically imports `astro:content`
#                              under the hood. A cold failure inside
#                              that loader would 500 every real keep
#                              — better to surface it at deploy-time.
#
# The synthetic `x-session-id` is a fixed sentinel ("deploy-warmup")
# so even if a future refactor accidentally lets the count bump on
# an unknown slug, the session is the same on every redeploy and the
# blast radius is one row, not N. No `why` field is sent.
KEEP_SENTINEL_SESSION="deploy-warmup-keep-curl"

echo "==> [deploy] Warming up GET /api/keep (v176 PR-E rejector + keep-pact import resolution)…"
KEEP_GET_STATUS=$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --max-time 10 \
  --request GET \
  "http://localhost:${HOST_PORT}/api/keep" \
  || echo '000')
echo "==> [deploy] GET /api/keep: HTTP ${KEEP_GET_STATUS} (expect 405)"
if [ "${KEEP_GET_STATUS}" != "405" ]; then
  echo "==> [deploy] ⚠ GET /api/keep did not respond 405 — route may be unmounted or keep-pact import broken (container still up)." >&2
fi

echo "==> [deploy] Warming up POST /api/keep with malformed body (v176 PR-E parseBody guard)…"
KEEP_BAD_JSON_STATUS=$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --max-time 10 \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-session-id: ${KEEP_SENTINEL_SESSION}" \
  --data 'not-json-{{{' \
  "http://localhost:${HOST_PORT}/api/keep" \
  || echo '000')
echo "==> [deploy] POST /api/keep (bad JSON): HTTP ${KEEP_BAD_JSON_STATUS} (expect 400)"
if [ "${KEEP_BAD_JSON_STATUS}" != "400" ]; then
  echo "==> [deploy] ⚠ POST /api/keep with malformed body did not respond 400 — JSON guard regression (container still up)." >&2
fi

echo "==> [deploy] Warming up POST /api/keep with unknown slug (v176 PR-E slug-resolver + astro:content dynamic import)…"
KEEP_UNKNOWN_BODY_FILE="$(mktemp)"
KEEP_UNKNOWN_STATUS=$(curl --silent --show-error --output "${KEEP_UNKNOWN_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-session-id: ${KEEP_SENTINEL_SESSION}" \
  --data '{"slug":"deploy-warmup-no-such-slug"}' \
  "http://localhost:${HOST_PORT}/api/keep" \
  || echo '000')
KEEP_UNKNOWN_BODY_PREVIEW=$(head -c 200 "${KEEP_UNKNOWN_BODY_FILE}" | tr '\n' ' ')
rm -f "${KEEP_UNKNOWN_BODY_FILE}"
echo "==> [deploy] POST /api/keep (unknown slug): HTTP ${KEEP_UNKNOWN_STATUS} · preview=\"${KEEP_UNKNOWN_BODY_PREVIEW}\" (expect 400 'Unknown slug')"
if [ "${KEEP_UNKNOWN_STATUS}" != "400" ]; then
  echo "==> [deploy] ⚠ POST /api/keep with unknown slug did not respond 400 — slug-resolver or astro:content loader regression (container still up)." >&2
fi

# ── 8j. v176 PR-E site-wide ParityPip footer warm-up ──────────────────────
# PR-E's "seal wave" hoists the parity status OUT of /api/docs-only
# markup and into a site-wide partial (`src/components/ParityPip.astro`)
# mounted via `BaseLayout.astro`'s <footer>. Every page now carries the
# pip — the louder sibling of the footer nav links. Probe 8f covers the
# INLINE variant on /api/docs; this probe covers the FOOTER variant on
# a non-docs page (the home `/`, which uses BaseLayout like every
# public page).
#
# Four wire-level markers here:
#   (a) `parity-pip--footer` — the aside variant class. Presence proves
#       `<ParityPip variant="footer" />` executed (default variant).
#   (b) `parity-pip__dot`    — the 8px lit-dot span. Presence proves
#       (i) the component rendered fully (a render throw would 500 the
#       page), and (ii) the CSS surface is on the wire so the site-wide
#       band is actually visible to readers.
#   (c) `data-parity-state="lit"` — the truth bit. parityGoldEarned()
#       must be TRUE in SSR for the state token to read `lit`; a debt
#       row would render `pending` and a not-enforced board would
#       render `dark`. Presence proves the 5/5-wired + cap=0 +
#       --error-mode trifecta actually reached the inventory at
#       runtime, not just at image-build time.
#   (d) `href="/api/docs#parity"` — the click target. Its landing
#       anchor (`id="parity"`) is already asserted in probe 8f; this
#       side of the link asserts the origin.
#
# Home `/` is chosen because it is the most-hit entry surface and has
# ZERO page-specific logic that could mask a BaseLayout regression.
echo "==> [deploy] Warming up / home page (v176 PR-E site-wide ParityPip footer band)…"
HOME_BODY_FILE="$(mktemp)"
HOME_STATUS=$(curl --silent --show-error --output "${HOME_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/" \
  || echo '000')
HOME_BODY_LEN=$(wc -c < "${HOME_BODY_FILE}" | tr -d ' ')
HOME_HAS_PIP_FOOTER=$(grep -c 'parity-pip--footer' "${HOME_BODY_FILE}" || true)
HOME_HAS_PIP_DOT=$(grep -c 'parity-pip__dot' "${HOME_BODY_FILE}" || true)
HOME_HAS_STATE_LIT=$(grep -c 'data-parity-state="lit"' "${HOME_BODY_FILE}" || true)
HOME_HAS_PARITY_HREF=$(grep -c 'href="/api/docs#parity"' "${HOME_BODY_FILE}" || true)
rm -f "${HOME_BODY_FILE}"
echo "==> [deploy] / home: HTTP ${HOME_STATUS} · body=${HOME_BODY_LEN}B · pip-footer=${HOME_HAS_PIP_FOOTER} · pip-dot=${HOME_HAS_PIP_DOT} · state-lit=${HOME_HAS_STATE_LIT} · parity-href=${HOME_HAS_PARITY_HREF}"
if [ "${HOME_STATUS}" != "200" ] || [ "${HOME_HAS_PIP_FOOTER}" -lt 1 ] || [ "${HOME_HAS_PIP_DOT}" -lt 1 ]; then
  echo "==> [deploy] ⚠ / home missing v176 PR-E site-wide ParityPip markers (parity-pip--footer / parity-pip__dot) — BaseLayout mount may have regressed (container still up)." >&2
fi
if [ "${HOME_HAS_STATE_LIT}" -lt 1 ]; then
  echo "==> [deploy] ⚠ / home ParityPip is NOT in 'lit' state — parityGoldEarned() returned false in SSR; inventory or cap ledger may have regressed (container still up)." >&2
fi
if [ "${HOME_HAS_PARITY_HREF}" -lt 1 ]; then
  echo "==> [deploy] ⚠ / home ParityPip missing '/api/docs#parity' click target — link target regression (container still up)." >&2
fi

# ── 8k. v177 "Arrival Receipt" warm-up — third mouth + panel shell ─────────
# v177 adds the copy→arrive→verify handshake. Three mouths for ONE producer
# (src/lib/arrival-receipt.ts::buildArrivalReceipt):
#   · SSR HTML     — <ArrivalReceipt /> panel shell on /api/docs
#                    (always rendered; hidden until client paints it).
#   · curl         — GET /api/docs/arrival?axis=…&stage=…&r=<nonce>
#                    (third mouth — new this sprint, sibling of ./cite.ts).
#   · DOM          — src/lib/client/arrival-acknowledge.ts
#                    (conditionally bundled when `?r=` is at SSR time;
#                    zero bytes for non-arrival visitors).
#
# All three probe families below are NON-MUTATING: no DB write, no ledger
# bump, no rate-limit touch. The curl mouth is explicitly stateless (the
# module docs call out "No DB import, no ledger write, no rate-limit
# touch") so running on every redeploy is safe and deterministic.
#
# The canonical sample cell — `(axis=typography, stage=fresh)` — is the
# same pair used by the arrival-receipt golden test (REF below is the
# same UUID the test pins). Keeping the pair in sync with the golden
# keeps the "deploy-time wire = build-time test" property Paul §7 wants.
ARRIVAL_SAMPLE_REF="550e8400-e29b-41d4-a716-446655440000"
ARRIVAL_SAMPLE_AXIS="typography"
ARRIVAL_SAMPLE_STAGE="fresh"

# ── 8k.a — /api/docs SSR carries the panel shell (no ?r= needed) ───────────
# The `<ArrivalReceipt />` partial is always rendered in the SSR HTML
# (the `hidden` attribute keeps it visually absent). A non-arrival
# visitor must still see `data-arrival-panel` on the wire because the
# client acknowledge module queries for that exact attribute when a
# real arrival lands later. A regression that forgets to mount the
# component would silently break the handshake on every subsequent
# `?r=` visit — the warm-up catches it at deploy time.
echo "==> [deploy] Warming up /api/docs (v177 ArrivalReceipt panel shell, always rendered)…"
ARRIVAL_PANEL_BODY_FILE="$(mktemp)"
ARRIVAL_PANEL_STATUS=$(curl --silent --show-error --output "${ARRIVAL_PANEL_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
ARRIVAL_PANEL_BODY_LEN=$(wc -c < "${ARRIVAL_PANEL_BODY_FILE}" | tr -d ' ')
ARRIVAL_PANEL_HAS_HANDLE=$(grep -c 'data-arrival-panel' "${ARRIVAL_PANEL_BODY_FILE}" || true)
ARRIVAL_PANEL_HAS_REF_ATTR=$(grep -c 'data-arrival-ref' "${ARRIVAL_PANEL_BODY_FILE}" || true)
ARRIVAL_PANEL_HAS_CELL_ATTR=$(grep -c 'data-arrival-cell' "${ARRIVAL_PANEL_BODY_FILE}" || true)
rm -f "${ARRIVAL_PANEL_BODY_FILE}"
echo "==> [deploy] /api/docs: HTTP ${ARRIVAL_PANEL_STATUS} · body=${ARRIVAL_PANEL_BODY_LEN}B · panel=${ARRIVAL_PANEL_HAS_HANDLE} · ref-slot=${ARRIVAL_PANEL_HAS_REF_ATTR} · cell-slot=${ARRIVAL_PANEL_HAS_CELL_ATTR}"
if [ "${ARRIVAL_PANEL_STATUS}" != "200" ] || [ "${ARRIVAL_PANEL_HAS_HANDLE}" -lt 1 ] \
   || [ "${ARRIVAL_PANEL_HAS_REF_ATTR}" -lt 1 ] || [ "${ARRIVAL_PANEL_HAS_CELL_ATTR}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v177 ArrivalReceipt panel markers (data-arrival-panel/ref/cell) — component mount regressed (container still up)." >&2
fi

# ── 8k.b — /api/docs?r=<nonce> conditionally imports arrival-acknowledge ──
# The client module is gated by `hasArrivalRef` at SSR time: when `?r=`
# is present, the Astro page emits an `import '…/arrival-acknowledge'`
# script, which Vite/Astro compiles to a `<script type="module" src="…">`
# tag pointing at a bundled chunk whose filename embeds the module's
# name (`arrival-acknowledge` — the publicId Vite preserves by default).
# A bare `grep` for the string proves both (i) the conditional branch
# in docs.astro fired and (ii) the bundler emitted a reachable chunk.
# When `?r=` is ABSENT (probe 8k.a above) this string MUST be absent —
# that's the zero-bytes-for-non-arrivals property Mike §5.6 requires.
echo "==> [deploy] Warming up /api/docs?r=<nonce> (v177 arrival-acknowledge conditional chunk)…"
ARRIVAL_GATE_BODY_FILE="$(mktemp)"
ARRIVAL_GATE_STATUS=$(curl --silent --show-error --output "${ARRIVAL_GATE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs?r=${ARRIVAL_SAMPLE_REF}" \
  || echo '000')
ARRIVAL_GATE_BODY_LEN=$(wc -c < "${ARRIVAL_GATE_BODY_FILE}" | tr -d ' ')
ARRIVAL_GATE_HAS_MODULE=$(grep -c 'arrival-acknowledge' "${ARRIVAL_GATE_BODY_FILE}" || true)
ARRIVAL_GATE_HAS_PANEL=$(grep -c 'data-arrival-panel' "${ARRIVAL_GATE_BODY_FILE}" || true)
rm -f "${ARRIVAL_GATE_BODY_FILE}"
echo "==> [deploy] /api/docs?r=…: HTTP ${ARRIVAL_GATE_STATUS} · body=${ARRIVAL_GATE_BODY_LEN}B · acknowledge-module=${ARRIVAL_GATE_HAS_MODULE} · panel=${ARRIVAL_GATE_HAS_PANEL}"
if [ "${ARRIVAL_GATE_STATUS}" != "200" ] || [ "${ARRIVAL_GATE_HAS_PANEL}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs?r=<nonce> did not render the ArrivalReceipt panel — gate regression (container still up)." >&2
fi
if [ "${ARRIVAL_GATE_HAS_MODULE}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs?r=<nonce> missing 'arrival-acknowledge' chunk reference — conditional client import did not bundle (container still up)." >&2
fi

# ── 8k.c — GET /api/docs/arrival happy path (200 application/json) ─────────
# Valid (axis, stage, ref) returns a receipt: `{ok:true, cell:{axis,stage,
# anchor}, label, ref, pinnedAt, parity}`. We grep for four bytes:
#   · `"ok":true`        — the happy-path discriminant.
#   · `"pinnedAt":"`     — ISO string prefix (clock pin reached the route).
#   · `"anchor":"axis-typography-stage-fresh"` — cellAnchorId() output for
#                          the sample pair; proves stage-axes delegation.
#   · `"parity":`        — the parity witness field (same one cite emits).
echo "==> [deploy] Warming up GET /api/docs/arrival happy path (v177 third mouth)…"
ARRIVAL_OK_BODY_FILE="$(mktemp)"
ARRIVAL_OK_STATUS=$(curl --silent --show-error --output "${ARRIVAL_OK_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/docs/arrival?axis=${ARRIVAL_SAMPLE_AXIS}&stage=${ARRIVAL_SAMPLE_STAGE}&r=${ARRIVAL_SAMPLE_REF}" \
  || echo '000')
ARRIVAL_OK_BODY_LEN=$(wc -c < "${ARRIVAL_OK_BODY_FILE}" | tr -d ' ')
ARRIVAL_OK_BODY_PREVIEW=$(head -c 240 "${ARRIVAL_OK_BODY_FILE}" | tr '\n' ' ')
ARRIVAL_OK_HAS_OK=$(grep -c '"ok":true' "${ARRIVAL_OK_BODY_FILE}" || true)
ARRIVAL_OK_HAS_PINNED=$(grep -c '"pinnedAt":"' "${ARRIVAL_OK_BODY_FILE}" || true)
ARRIVAL_OK_HAS_ANCHOR=$(grep -c '"anchor":"axis-typography-stage-fresh"' "${ARRIVAL_OK_BODY_FILE}" || true)
ARRIVAL_OK_HAS_PARITY=$(grep -c '"parity":' "${ARRIVAL_OK_BODY_FILE}" || true)
rm -f "${ARRIVAL_OK_BODY_FILE}"
echo "==> [deploy] GET /api/docs/arrival (happy): HTTP ${ARRIVAL_OK_STATUS} · body=${ARRIVAL_OK_BODY_LEN}B · ok=${ARRIVAL_OK_HAS_OK} · pinnedAt=${ARRIVAL_OK_HAS_PINNED} · anchor=${ARRIVAL_OK_HAS_ANCHOR} · parity=${ARRIVAL_OK_HAS_PARITY}"
echo "==> [deploy]     preview=\"${ARRIVAL_OK_BODY_PREVIEW}\""
if [ "${ARRIVAL_OK_STATUS}" != "200" ] || [ "${ARRIVAL_OK_HAS_OK}" -lt 1 ] \
   || [ "${ARRIVAL_OK_HAS_PINNED}" -lt 1 ] || [ "${ARRIVAL_OK_HAS_ANCHOR}" -lt 1 ] \
   || [ "${ARRIVAL_OK_HAS_PARITY}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs/arrival happy path regression — expected 200 with {ok:true, anchor, pinnedAt, parity} (container still up)." >&2
fi

# ── 8k.d — GET /api/docs/arrival malformed ref → 400 ───────────────────────
# `bad` fails isValidRef() (length < 8). Closed reason vocabulary means
# the body is exactly `{"ok":false,"reason":"malformed"}` — two fields,
# ordered. statusForReason('malformed') === 400.
echo "==> [deploy] Warming up GET /api/docs/arrival malformed ref (v177 validation → 400)…"
ARRIVAL_BAD_BODY_FILE="$(mktemp)"
ARRIVAL_BAD_STATUS=$(curl --silent --show-error --output "${ARRIVAL_BAD_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/docs/arrival?axis=${ARRIVAL_SAMPLE_AXIS}&stage=${ARRIVAL_SAMPLE_STAGE}&r=bad" \
  || echo '000')
ARRIVAL_BAD_HAS_REASON=$(grep -c '"reason":"malformed"' "${ARRIVAL_BAD_BODY_FILE}" || true)
ARRIVAL_BAD_BODY_PREVIEW=$(head -c 120 "${ARRIVAL_BAD_BODY_FILE}" | tr '\n' ' ')
rm -f "${ARRIVAL_BAD_BODY_FILE}"
echo "==> [deploy] GET /api/docs/arrival (malformed): HTTP ${ARRIVAL_BAD_STATUS} · reason-malformed=${ARRIVAL_BAD_HAS_REASON} · preview=\"${ARRIVAL_BAD_BODY_PREVIEW}\" (expect 400)"
if [ "${ARRIVAL_BAD_STATUS}" != "400" ] || [ "${ARRIVAL_BAD_HAS_REASON}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs/arrival malformed ref did not respond 400 with reason:malformed — closed-reason regression (container still up)." >&2
fi

# ── 8k.e — GET /api/docs/arrival unknown cell → 404 ────────────────────────
# Off-catalog axis (`bogus-axis` is NOT in STAGE_AXES) with a well-formed
# ref must fail AT the unknown-cell check, not the malformed check — the
# validation order in buildArrivalReceipt() is `malformed first, then
# unknown-cell`. statusForReason('unknown-cell') === 404.
echo "==> [deploy] Warming up GET /api/docs/arrival unknown cell (v177 validation → 404)…"
ARRIVAL_UC_BODY_FILE="$(mktemp)"
ARRIVAL_UC_STATUS=$(curl --silent --show-error --output "${ARRIVAL_UC_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/docs/arrival?axis=bogus-axis&stage=${ARRIVAL_SAMPLE_STAGE}&r=${ARRIVAL_SAMPLE_REF}" \
  || echo '000')
ARRIVAL_UC_HAS_REASON=$(grep -c '"reason":"unknown-cell"' "${ARRIVAL_UC_BODY_FILE}" || true)
ARRIVAL_UC_BODY_PREVIEW=$(head -c 120 "${ARRIVAL_UC_BODY_FILE}" | tr '\n' ' ')
rm -f "${ARRIVAL_UC_BODY_FILE}"
echo "==> [deploy] GET /api/docs/arrival (unknown): HTTP ${ARRIVAL_UC_STATUS} · reason-unknown-cell=${ARRIVAL_UC_HAS_REASON} · preview=\"${ARRIVAL_UC_BODY_PREVIEW}\" (expect 404)"
if [ "${ARRIVAL_UC_STATUS}" != "404" ] || [ "${ARRIVAL_UC_HAS_REASON}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs/arrival unknown cell did not respond 404 with reason:unknown-cell — validation order regression (container still up)." >&2
fi

# ── 8k.f — POST /api/docs/arrival → 405 (Allow: GET) ───────────────────────
# The shared `rejectNonGet` helper is bound to POST/PUT/DELETE/PATCH/
# OPTIONS. A successful 405 here proves the route module loaded (a
# broken `buildArrivalReceipt` import would 500 every verb, not just
# GET). The `Allow: GET` header is the contract hook external clients
# key off of.
echo "==> [deploy] Warming up POST /api/docs/arrival (v177 rejectNonGet shared helper)…"
ARRIVAL_POST_HEADERS_FILE="$(mktemp)"
ARRIVAL_POST_STATUS=$(curl --silent --show-error --output /dev/null \
  --dump-header "${ARRIVAL_POST_HEADERS_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --request POST \
  "http://localhost:${HOST_PORT}/api/docs/arrival?axis=${ARRIVAL_SAMPLE_AXIS}&stage=${ARRIVAL_SAMPLE_STAGE}&r=${ARRIVAL_SAMPLE_REF}" \
  || echo '000')
ARRIVAL_POST_HAS_ALLOW=$(grep -ci '^Allow: *GET' "${ARRIVAL_POST_HEADERS_FILE}" || true)
rm -f "${ARRIVAL_POST_HEADERS_FILE}"
echo "==> [deploy] POST /api/docs/arrival: HTTP ${ARRIVAL_POST_STATUS} · Allow:GET-hits=${ARRIVAL_POST_HAS_ALLOW} (expect 405)"
if [ "${ARRIVAL_POST_STATUS}" != "405" ] || [ "${ARRIVAL_POST_HAS_ALLOW}" -lt 1 ]; then
  echo "==> [deploy] ⚠ POST /api/docs/arrival did not respond 405 with 'Allow: GET' — rejectNonGet regression or route unmounted (container still up)." >&2
fi

# ── 8k.g — v177.1 §E cross-mouth byte-parity runtime witness ───────────────
# The §E golden runs at BUILD time inside `npm run build` and locks the
# producer / route / painter bytes byte-identical on 4 vectors. This
# runtime probe is the "deploy-time witness" for the live container:
# a SECOND happy vector (distinct axis+stage pair from 8k.c) must
# return 200 with the expected anchor AND both the happy and failure
# responses must carry `Cache-Control: no-store` and `Content-Type:
# application/json; charset=utf-8`. Together they prove (i) the route
# module still resolves after the §E refactor, (ii) the middleware
# clock-pin still reaches the handler (`pinnedAt` shape asserted), and
# (iii) a reverse proxy between Caddy and the container cannot ever
# pin a stale `pinnedAt` (no-store on BOTH paths — same guarantee
# §E's last two tests assert at build time).
ARRIVAL_PARITY_AXIS="tempo"
ARRIVAL_PARITY_STAGE="endangered"
ARRIVAL_PARITY_REF="ab12-cd34-ef56-7890-abcdef012345"
ARRIVAL_PARITY_EXPECTED_ANCHOR='"anchor":"axis-tempo-stage-endangered"'

echo "==> [deploy] Warming up GET /api/docs/arrival second happy vector (v177.1 §E byte-parity witness)…"
ARRIVAL_PARITY_BODY_FILE="$(mktemp)"
ARRIVAL_PARITY_HEADERS_FILE="$(mktemp)"
ARRIVAL_PARITY_STATUS=$(curl --silent --show-error --output "${ARRIVAL_PARITY_BODY_FILE}" \
  --dump-header "${ARRIVAL_PARITY_HEADERS_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/docs/arrival?axis=${ARRIVAL_PARITY_AXIS}&stage=${ARRIVAL_PARITY_STAGE}&r=${ARRIVAL_PARITY_REF}" \
  || echo '000')
ARRIVAL_PARITY_BODY_LEN=$(wc -c < "${ARRIVAL_PARITY_BODY_FILE}" | tr -d ' ')
ARRIVAL_PARITY_HAS_OK=$(grep -c '"ok":true' "${ARRIVAL_PARITY_BODY_FILE}" || true)
ARRIVAL_PARITY_HAS_ANCHOR=$(grep -cF "${ARRIVAL_PARITY_EXPECTED_ANCHOR}" "${ARRIVAL_PARITY_BODY_FILE}" || true)
ARRIVAL_PARITY_HAS_PINNED=$(grep -c '"pinnedAt":"' "${ARRIVAL_PARITY_BODY_FILE}" || true)
ARRIVAL_PARITY_HAPPY_NO_STORE=$(grep -ci '^cache-control: *no-store' "${ARRIVAL_PARITY_HEADERS_FILE}" || true)
ARRIVAL_PARITY_HAPPY_CTYPE=$(grep -ci '^content-type: *application/json; *charset=utf-8' "${ARRIVAL_PARITY_HEADERS_FILE}" || true)
# Body must be one line — §E asserts no '\n' / '\r' in the bytes.
ARRIVAL_PARITY_LINE_COUNT=$(wc -l < "${ARRIVAL_PARITY_BODY_FILE}" | tr -d ' ')
rm -f "${ARRIVAL_PARITY_BODY_FILE}" "${ARRIVAL_PARITY_HEADERS_FILE}"
echo "==> [deploy] GET /api/docs/arrival (parity vector): HTTP ${ARRIVAL_PARITY_STATUS} · body=${ARRIVAL_PARITY_BODY_LEN}B · ok=${ARRIVAL_PARITY_HAS_OK} · anchor=${ARRIVAL_PARITY_HAS_ANCHOR} · pinnedAt=${ARRIVAL_PARITY_HAS_PINNED} · no-store=${ARRIVAL_PARITY_HAPPY_NO_STORE} · ctype=${ARRIVAL_PARITY_HAPPY_CTYPE} · body-lines=${ARRIVAL_PARITY_LINE_COUNT}"
if [ "${ARRIVAL_PARITY_STATUS}" != "200" ] || [ "${ARRIVAL_PARITY_HAS_OK}" -lt 1 ] \
   || [ "${ARRIVAL_PARITY_HAS_ANCHOR}" -lt 1 ] || [ "${ARRIVAL_PARITY_HAS_PINNED}" -lt 1 ]; then
  echo "==> [deploy] ⚠ v177.1 §E byte-parity witness failed (second happy vector regressed — ok/anchor/pinnedAt) — investigate (container still up)." >&2
fi
if [ "${ARRIVAL_PARITY_HAPPY_NO_STORE}" -lt 1 ]; then
  echo "==> [deploy] ⚠ v177.1 happy vector missing 'Cache-Control: no-store' — stale-pin regression risk (container still up)." >&2
fi
if [ "${ARRIVAL_PARITY_HAPPY_CTYPE}" -lt 1 ]; then
  echo "==> [deploy] ⚠ v177.1 happy vector missing 'Content-Type: application/json; charset=utf-8' — wire shape regression (container still up)." >&2
fi
# `wc -l` counts newline TERMINATORS; a one-line body with no trailing
# newline should count 0 (§E asserts: body has no '\n'/'\r' at all).
if [ "${ARRIVAL_PARITY_LINE_COUNT}" -gt 0 ]; then
  echo "==> [deploy] ⚠ v177.1 happy vector body is multi-line or has trailing newline — §E single-line invariant regressed on the wire (container still up)." >&2
fi

# Failure path parallel: `Cache-Control: no-store` MUST still be
# pinned when the route returns a closed reason — the §E test asserts
# the same on a 404. A reverse proxy that caches the fail response
# could later serve a stale `pinnedAt` on a happy hit.
echo "==> [deploy] Warming up GET /api/docs/arrival failure vector headers (v177.1 §E no-store on fail)…"
ARRIVAL_FAIL_HEADERS_FILE="$(mktemp)"
ARRIVAL_FAIL_STATUS=$(curl --silent --show-error --output /dev/null \
  --dump-header "${ARRIVAL_FAIL_HEADERS_FILE}" \
  --write-out '%{http_code}' --max-time 10 \
  --header "Accept: application/json" \
  "http://localhost:${HOST_PORT}/api/docs/arrival?axis=not-an-axis&stage=${ARRIVAL_SAMPLE_STAGE}&r=${ARRIVAL_SAMPLE_REF}" \
  || echo '000')
ARRIVAL_FAIL_NO_STORE=$(grep -ci '^cache-control: *no-store' "${ARRIVAL_FAIL_HEADERS_FILE}" || true)
rm -f "${ARRIVAL_FAIL_HEADERS_FILE}"
echo "==> [deploy] GET /api/docs/arrival (fail headers): HTTP ${ARRIVAL_FAIL_STATUS} · no-store-on-fail=${ARRIVAL_FAIL_NO_STORE} (expect 404 + no-store)"
if [ "${ARRIVAL_FAIL_STATUS}" != "404" ] || [ "${ARRIVAL_FAIL_NO_STORE}" -lt 1 ]; then
  echo "==> [deploy] ⚠ v177.1 fail vector missing 'Cache-Control: no-store' on 404 — stale-pin regression guard tripped (container still up)." >&2
fi

# ── 8l. v173 ledger+jobs wedge — cron-runner stderr witness ────────────────
# Read the container's stderr via `docker logs` and grep for the cron-
# runner boot line. This is the "wire receipt" for the wedge: the local
# 3-line `logJson` helper inside cron-runner.ts has been retired and
# replaced with a 1-line curry over the SHARED `clock.logJson` seam. The
# JSON shape is intentionally unchanged (`{ts, job, event, data}`) so a
# downstream log driver / Loki query keyed on `job=cron-runner` keeps
# working byte-for-byte. The build-time golden (`test:ledger-clock`,
# inside `npm run build`) already proves the seam pins `ts`; this probe
# is the live witness that the consolidated producer reaches production
# stderr unchanged. Observational only — failure WARNs (the build-time
# gate is the teeth; this probe is the live sighting).
#
# v179 lazy-boot fix (Sid, this sprint): before v179 the cron-runner
# integration hook only fired under `astro dev` / `astro preview` via
# `astro:server:start` — the compiled standalone Node server
# (`dist/server/entry.mjs`) never ran the integration pipeline, so cron
# never booted in production and this probe's boot-lines count was
# always 0 (a known-false-negative, documented here). With v179's
# `bootFromEnv()` call inside src/middleware.ts, the boot line is
# emitted on the first request (probe 8a's GET /api/docs is enough to
# light it). Starting this deploy, `boot-lines=1` / `ts-iso-lines=1` is
# the expected happy-path observation; silence now means the middleware
# lazy-boot seam regressed (the middleware is bundled into dist/server —
# grep for `bootFromEnv` in dist to verify, or inspect docker logs).
echo "==> [deploy] Witnessing v173 cron-runner stderr boot line (shared clock.logJson seam)…"
CRON_BOOT_LOG_FILE="$(mktemp)"
docker logs "${CONTAINER_NAME}" 2>&1 > "${CRON_BOOT_LOG_FILE}" || true
# Count the boot lines that match the new shared-seam shape. We require:
#   - the literal `"job":"cron-runner"` substring
#   - the literal `"event":"boot"` substring
# both in the SAME line (boot lines are JSON one-liners).
CRON_BOOT_HITS=$(grep -c '"job":"cron-runner".*"event":"boot"\|"event":"boot".*"job":"cron-runner"' "${CRON_BOOT_LOG_FILE}" || true)
# Stamp witness — every line emitted by clock.logJson starts with `{"ts":"`.
# We grep the boot line (best-effort) for an ISO-shaped Z-terminated stamp.
CRON_BOOT_TS_HITS=$(grep -c '"ts":"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[^"]*Z"' "${CRON_BOOT_LOG_FILE}" || true)
# Sample one boot line for the log so a human can eyeball the JSON shape.
CRON_BOOT_PREVIEW=$(grep -m1 '"job":"cron-runner".*"event":"boot"' "${CRON_BOOT_LOG_FILE}" 2>/dev/null | head -c 240 | tr -d '\n' || true)
rm -f "${CRON_BOOT_LOG_FILE}"
echo "==> [deploy] cron-runner boot witness: boot-lines=${CRON_BOOT_HITS} · ts-iso-lines=${CRON_BOOT_TS_HITS} · preview=\"${CRON_BOOT_PREVIEW}\""
if [ "${CRON_BOOT_HITS}" -lt 1 ]; then
  echo "==> [deploy] ⚠ v173 cron-runner boot stderr line NOT seen in docker logs — shared clock.logJson seam may have dropped the line, or cron integration hook didn't fire. Build-time test:ledger-clock is the actual gate (container still up)." >&2
fi
if [ "${CRON_BOOT_TS_HITS}" -lt 1 ]; then
  echo "==> [deploy] ⚠ v173 cron-runner boot line missing ISO-8601 'ts' stamp — clock.logJson seam regressed on the wire (container still up)." >&2
fi

# ── 8m. v178 "Parity Console" warm-up — on-page tri-mouth proof section ──
# v178 mounts a new reading-column section on /api/docs that displays the
# three-mouth citation payload for the currently-focused cell + a diff
# line that reads `0 bytes · pointer ≡ keyboard ≡ curl` at rest. The
# prebuild guard (`check-parity-proof.ts`) is the actual gate — it sweeps
# 35 cells + every VALID_REF_FIXTURES nonce at image-build time and fails
# the image on ANY non-zero drift. This runtime probe is the deploy-time
# witness that the shipped container actually carries the section AND
# that the SSR helper `defaultProof()` dispatched through the citation
# oracle without throwing. We grep SEVEN markers against one /api/docs
# fetch (reusing the ongoing GET from 8k.a would conflate concerns):
#   (a) `data-parity-console`                     — section root
#                                                    attribute. Presence
#                                                    proves the component
#                                                    mounted (a render-
#                                                    throw inside
#                                                    `await defaultProof`
#                                                    would 500 the page).
#   (b) `Three mouths, one byte.`                 — the h2 copy. Plain-
#                                                    word title (Tanya
#                                                    §7); presence proves
#                                                    the shell header
#                                                    rendered.
#   (c) `data-pane-body="pointer"`                — pointer pane. One of
#   (d) `data-pane-body="keyboard"`                 three mouths; all
#   (e) `data-pane-body="curl"`                     three must be present
#                                                    for the panes map
#                                                    to have three entries
#                                                    at runtime (the
#                                                    client repainter
#                                                    fail-closes if
#                                                    panes.size !== 3).
#   (f) `0 bytes · pointer ≡ keyboard ≡ curl`    — the diff sentence at
#                                                    rest. emitted by
#                                                    `diffSentence(p)`
#                                                    iff driftBytes===0;
#                                                    its presence on the
#                                                    wire is the deploy-
#                                                    time witness that
#                                                    the SSR producer's
#                                                    three-mouth parity
#                                                    held for the default
#                                                    cell (typography ×
#                                                    fresh).
#   (g) `parity-console` chunk reference          — the bundled client
#                                                    module's public-id
#                                                    surfaces in the
#                                                    docs page's emitted
#                                                    <script type="module"
#                                                    src="…"> tag.
#                                                    Presence proves the
#                                                    page-chunk import
#                                                    (inside the docs
#                                                    <script> block)
#                                                    resolved and Vite
#                                                    bundled a reachable
#                                                    chunk — a bad import
#                                                    would 500 the page
#                                                    before any HTML
#                                                    reached the wire.
# Observational only — failure WARNs; the image-build guard is the teeth.
echo "==> [deploy] Warming up /api/docs parity console (v178 on-page tri-mouth demonstrator)…"
PCONSOLE_BODY_FILE="$(mktemp)"
PCONSOLE_STATUS=$(curl --silent --show-error --output "${PCONSOLE_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
PCONSOLE_BODY_LEN=$(wc -c < "${PCONSOLE_BODY_FILE}" | tr -d ' ')
PCONSOLE_HAS_ROOT=$(grep -c 'data-parity-console' "${PCONSOLE_BODY_FILE}" || true)
PCONSOLE_HAS_TITLE=$(grep -c 'Three mouths, one byte\.' "${PCONSOLE_BODY_FILE}" || true)
PCONSOLE_HAS_POINTER=$(grep -c 'data-pane-body="pointer"' "${PCONSOLE_BODY_FILE}" || true)
PCONSOLE_HAS_KEYBOARD=$(grep -c 'data-pane-body="keyboard"' "${PCONSOLE_BODY_FILE}" || true)
PCONSOLE_HAS_CURL=$(grep -c 'data-pane-body="curl"' "${PCONSOLE_BODY_FILE}" || true)
# The diff sentence contains a non-ASCII `≡` (U+2261). Use grep -F for a
# literal fixed-string match so the sentence is compared byte-for-byte.
PCONSOLE_HAS_DIFF=$(grep -cF '0 bytes · pointer ≡ keyboard ≡ curl' "${PCONSOLE_BODY_FILE}" || true)
PCONSOLE_HAS_DRIFT_ZERO=$(grep -c 'data-drift="zero"' "${PCONSOLE_BODY_FILE}" || true)
PCONSOLE_HAS_CHUNK=$(grep -c 'parity-console' "${PCONSOLE_BODY_FILE}" || true)
rm -f "${PCONSOLE_BODY_FILE}"
echo "==> [deploy] /api/docs parity console: HTTP ${PCONSOLE_STATUS} · body=${PCONSOLE_BODY_LEN}B · root=${PCONSOLE_HAS_ROOT} · title=${PCONSOLE_HAS_TITLE} · pointer=${PCONSOLE_HAS_POINTER} · keyboard=${PCONSOLE_HAS_KEYBOARD} · curl=${PCONSOLE_HAS_CURL} · diff=${PCONSOLE_HAS_DIFF} · drift-zero=${PCONSOLE_HAS_DRIFT_ZERO} · chunk=${PCONSOLE_HAS_CHUNK}"
if [ "${PCONSOLE_STATUS}" != "200" ] || [ "${PCONSOLE_HAS_ROOT}" -lt 1 ] \
   || [ "${PCONSOLE_HAS_TITLE}" -lt 1 ] || [ "${PCONSOLE_HAS_POINTER}" -lt 1 ] \
   || [ "${PCONSOLE_HAS_KEYBOARD}" -lt 1 ] || [ "${PCONSOLE_HAS_CURL}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v178 ParityConsole shell markers (root/title/pointer/keyboard/curl) — component mount regressed (container still up)." >&2
fi
if [ "${PCONSOLE_HAS_DIFF}" -lt 1 ] || [ "${PCONSOLE_HAS_DRIFT_ZERO}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs ParityConsole diff sentence / data-drift=\"zero\" missing — SSR helper saw drift OR diffSentence() regressed; build-time check-parity-proof is the actual gate (container still up)." >&2
fi
if [ "${PCONSOLE_HAS_CHUNK}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing 'parity-console' client chunk reference — page-chunk import may have been tree-shaken out (container still up)." >&2
fi

# ── 8n. v179 CiteFlash + ApiAlso warm-up — design-system primitives ────────
# v179 consolidates copy→arrive acknowledgement onto TWO reusable primitives:
#   · <CiteFlash /> — one 10px gold dot that rides inline next to a citable
#     region's title; the IIFE binds a document-level `copy` listener on
#     `[data-citable]` regions and plays `@keyframes cite-flash` on every
#     successful copy, then lights `@keyframes cite-flash-lit` once
#     `/api/docs/arrival?r=<nonce>` returns 200 (same third-mouth handler
#     the v177 ArrivalReceipt trilogy probes in 8k.a–8k.g).
#   · <ApiAlso endpoint=… params=… /> — a small chip that reveals a one-
#     line `curl "${origin}/api/docs/cite?axis=…&stage=…"` popover on
#     hover/focus. The IIFE swaps a server-rendered `__ORIGIN__` tag for
#     `window.location.origin` on boot so prerendered HTML stays host-
#     agnostic (same discipline cell-cite.ts uses — no baked-in hostnames).
# Both primitives mount on /api/docs this sprint: CiteFlash next to the
# matrix h2 ("The grammar, whole."), ApiAlso inside the endpoint docs dd
# for the /api/docs/cite row (the keyboard-first curl reveal, Paul MH-3).
#
# The build-time prebuild guard (`check-cite-flash-reuse.ts`, WARN mode
# this wedge) is where the consolidation teeth live — see the §4 guard
# block above. This runtime probe is the deploy-time witness that the
# SSR page actually carries the primitives on the wire AND that their
# inline <script> IIFEs did not crash the page at module-resolution time.
#
# Four markers asserted in one GET /api/docs fetch (reusing an existing
# probe's body would conflate concerns; this is a fresh curl):
#   (a) `data-cite-flash-root`   — the CiteFlash span's stable DOM handle.
#                                   Presence proves the component mounted
#                                   (a render-throw inside the frontmatter
#                                   would 500 the page) AND the client
#                                   IIFE's `queryRoot()` has a target.
#   (b) `data-citable`           — at least one ancestor region carries
#                                   the attr. Without it the copy listener
#                                   never fires; with it the matrix
#                                   participates in the flash ceremony.
#                                   v179 adds `data-citable` to
#                                   `.api-docs__matrix`.
#   (c) `data-api-also-root`     — the ApiAlso span's stable DOM handle.
#                                   Presence proves the chip rendered and
#                                   its origin-rebinding IIFE has a target
#                                   to rewrite on boot.
#   (d) `__ORIGIN__`             — the placeholder string IS expected to
#                                   be on the wire (server doesn't know
#                                   the caller origin; the browser IIFE
#                                   swaps it at boot). Its presence proves
#                                   the curl literal was assembled at SSR.
#
# Observational only — failure WARNs; the build-time guard is the teeth.
echo "==> [deploy] Warming up /api/docs CiteFlash + ApiAlso primitives (v179 design-system consolidation)…"
CITEFLASH_BODY_FILE="$(mktemp)"
CITEFLASH_STATUS=$(curl --silent --show-error --output "${CITEFLASH_BODY_FILE}" \
  --write-out '%{http_code}' --max-time 15 \
  --header "Accept: text/html" \
  "http://localhost:${HOST_PORT}/api/docs" \
  || echo '000')
CITEFLASH_BODY_LEN=$(wc -c < "${CITEFLASH_BODY_FILE}" | tr -d ' ')
CITEFLASH_HAS_ROOT=$(grep -c 'data-cite-flash-root' "${CITEFLASH_BODY_FILE}" || true)
CITEFLASH_HAS_CITABLE=$(grep -c 'data-citable' "${CITEFLASH_BODY_FILE}" || true)
CITEFLASH_HAS_APIALSO=$(grep -c 'data-api-also-root' "${CITEFLASH_BODY_FILE}" || true)
CITEFLASH_HAS_ORIGIN_TAG=$(grep -c '__ORIGIN__' "${CITEFLASH_BODY_FILE}" || true)
CITEFLASH_HAS_CURL_PREFIX=$(grep -c 'curl -s ' "${CITEFLASH_BODY_FILE}" || true)
rm -f "${CITEFLASH_BODY_FILE}"
echo "==> [deploy] /api/docs CiteFlash+ApiAlso: HTTP ${CITEFLASH_STATUS} · body=${CITEFLASH_BODY_LEN}B · cite-flash-root=${CITEFLASH_HAS_ROOT} · data-citable=${CITEFLASH_HAS_CITABLE} · api-also-root=${CITEFLASH_HAS_APIALSO} · origin-tag=${CITEFLASH_HAS_ORIGIN_TAG} · curl-literal=${CITEFLASH_HAS_CURL_PREFIX}"
if [ "${CITEFLASH_STATUS}" != "200" ] || [ "${CITEFLASH_HAS_ROOT}" -lt 1 ] \
   || [ "${CITEFLASH_HAS_CITABLE}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v179 CiteFlash markers (data-cite-flash-root / data-citable) — component mount or [data-citable] host regressed (container still up)." >&2
fi
if [ "${CITEFLASH_HAS_APIALSO}" -lt 1 ] || [ "${CITEFLASH_HAS_ORIGIN_TAG}" -lt 1 ]; then
  echo "==> [deploy] ⚠ /api/docs missing v179 ApiAlso markers (data-api-also-root / __ORIGIN__ placeholder) — chip didn't render or curl literal assembly regressed (container still up)." >&2
fi

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

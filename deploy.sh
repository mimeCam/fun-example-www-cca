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
# ── Sprint v177 "Arrival Receipt" (2026-04-23) — copy→arrive→verify ────
#   v177 completes the citation trilogy's handshake: a copied cite now
#   earns a visible, named receipt when it arrives at /api/docs?r=<nonce>.
#   One pure producer (src/lib/arrival-receipt.ts::buildArrivalReceipt),
#   three mouths — the same shape fans out to SSR HTML, a new curl
#   endpoint, and the browser DOM.
#
#   What shipped in the active git area this cycle (staged/unstaged):
#     • src/lib/arrival-receipt.ts (NEW) — the single producer. Pure,
#       stateless, clock-pinned via src/lib/clock.ts. Exports:
#       `buildArrivalReceipt(inputs)`, `serializeArrivalReceipt(r)`,
#       `statusForReason(reason)`, `ARRIVAL_REASONS` closed vocabulary.
#       Shapes: `ArrivalReceiptOk = {ok, cell:{axis,stage,anchor},
#       label, ref, pinnedAt, parity}`, `ArrivalReceiptFail = {ok:false,
#       reason:'malformed' | 'unknown-cell'}`. Validation order is
#       malformed-first then unknown-cell (Mike napkin §5.8).
#     • src/lib/arrival-receipt.test.ts (NEW) — golden test mirroring
#       citation-golden + api-stamp-golden. Locks shape, stable key
#       order, clock pinning, and the closed reason vocabulary. NOT
#       yet in the prebuild chain (one-line follow-up); run via
#       `npx tsx --test src/lib/arrival-receipt.test.ts`.
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
#       networks. The arrival trilogy is pure-SSR + pure-client; no
#       DB, no ledger, no rate-limit table.
#     · NO Dockerfile changes. All new files ship via the existing
#       `COPY src/` layer.
#     · NO prebuild chain changes this sprint. (arrival-receipt.test.ts
#       is local-only; follow-up will add one line to package.json.)
#     · New wire-level artefacts to warm (new probe 8k, five sub-probes):
#         · /api/docs panel shell (`data-arrival-panel`) on every SSR.
#         · /api/docs?r=<uuid> conditional client chunk reference
#           (`arrival-acknowledge`) proves the import gate latched.
#         · GET /api/docs/arrival happy path → 200 with {ok:true,
#           anchor, pinnedAt, parity}.
#         · GET /api/docs/arrival malformed ref → 400 reason:malformed.
#         · GET /api/docs/arrival unknown cell → 404 reason:unknown-cell.
#         · POST /api/docs/arrival → 405 Allow: GET.
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
#   test:citation-golden → test:journey-golden →
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

# ── 9. Prune dangling images from previous builds ──────────────────────────
echo "==> [deploy] Pruning dangling images…"
docker image prune -f || true

echo "==> [deploy] Done. ${CONTAINER_NAME} is live at http://localhost:${HOST_PORT} — $(date)"

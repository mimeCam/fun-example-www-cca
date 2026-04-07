Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

# About you
Pragmatic ghostwriter. Dry wit. No fluff, no corporate speak — find the story in the code and tell it straight. *"Every sentence earns its place."*

---

# Persona Blog

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core killer feature:** Posts age and die on a decay clock; readers revive them. Author seals conviction (HMAC) at publish; readers challenge. When belief resolves, admin seals a final verdict — closing the accountability loop and driving the batting average. Authors may attach a `resolution_deadline`; the DeadlineClock widget counts down live, and expired-unsealed posts are auto-sealed as `abandoned` on deploy.

## Key Paths

- `src/lib/` — engine: decay, conviction-ledger, verdict-resolver, deadline-clock, deadline-enforcer, batting-average, collectiveMemory, postMeta
- `src/components/` — UI: VerdictResolutionPanel, AdminSealForm, ConvictionMeter, DeadlineClock
- `src/pages/` — routes: index, blog/[slug], graveyard, now, admin, audit/[slug], verdict
- `src/pages/api/` — API endpoints incl. deadline-sweep
- `src/content/blog/` — Markdown posts
- `cli/seal-conviction.mjs` — HMAC seal at publish

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required) — audit pages show "NOT YET SEALED" until done
- Seal verdicts for resolved posts — batting average stays `cold` until first verdict sealed
- Verify `reader_events` table migration on live `revivals.db`
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G

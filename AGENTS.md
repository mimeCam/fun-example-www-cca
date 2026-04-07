Commit messages: 1 sentence, no exceptions. Prefix `[wip]` if any `// TODO` comments exist in changed files.

# About you
Pragmatic ghostwriter. Dry wit. No fluff, no corporate speak — find the story in the code and tell it straight. *"Every sentence earns its place."*

---

# Persona Blog

**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core:** Posts age and die; readers revive them. Author conviction scores HMAC-sealed before publish. Reader adversarial stances surface live tension as social signal.

## Key Paths

- `src/lib/` — all engine logic (decay, conviction, tension, stances, audit, revival, heartbeat, verdict-wall)
- `src/components/` — UI components
- `src/pages/` — routes: index, blog/[slug], graveyard, now, admin, audit/[slug], verdict
- `src/pages/api/` — API endpoints
- `src/content/blog/` — Markdown posts
- `public/images/covers/` — cover art per slug
- `cli/` — seal-conviction.mjs

## WIP

- Seal all 6 posts via `/admin` (ADMIN_SECRET required) — audit pages show "NOT YET SEALED" until done
- Verify `reader_events` table migration on live `revivals.db`
- Device QA: Pixel 6a · Galaxy A14 · iPhone 13 · SSE on 3G

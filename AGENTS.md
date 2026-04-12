**Stack:** Astro 4 · TypeScript · @astrojs/node · better-sqlite3 · Docker

**Core feature:** Posts decay on a clock; readers revive them. Author seals conviction (HMAC + RFC 3161 + OTS); community disputes within 72 h → upheld/overturned; batting average unlocks at ≥5 resolved verdicts.

## Key Paths

- `src/lib/` — decay engine, verdict/dispute logic, conviction ledger, OTS/RFC 3161 clients, seal-phases state machine, batting average adapter, cron scheduler + jobs
- `src/components/` — UI layer: cards, drawers, ceremonies, badges, chips, filters
- `src/pages/api/` — REST endpoints mirroring all core user actions
- `src/styles/` — design system tokens, motion, atmosphere, trust-badge, batting-average-chip

## Env Vars

| Var | Required | Purpose |
|-----|----------|---------|
| `ADMIN_SECRET` | Yes | Gates `/admin` seal form + conviction-seal API |
| `HMAC_SECRET` | Yes | Signs conviction ledger entries and verdict records |
| `GITHUB_PAT` | Optional | `gist` scope — anchors each seal to a GitHub Gist |
| `RFC3161_URL` | Optional | RFC 3161 timestamp authority; defaults to Freetsa |

## WIP

- [wip] Seal a post via `/admin` (requires `ADMIN_SECRET` + `GITHUB_PAT`) to activate TrustBadge + batting average loop

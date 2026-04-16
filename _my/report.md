# Commit Report — 2026-04-16

## What landed

Layer cleanup sprint: six heavyweight overlay components deleted, nav condensed,
homepage opens directly with the river feed. Build verified clean via deploy.sh.

### Deleted surface area
- `src/components/LandingHero.astro` + `src/styles/landing-hero.css` + `src/lib/client/landing-hero.ts`
- `src/components/OnboardingOverlay.astro` + `src/lib/client/onboarding.ts` + `src/pages/api/onboarding-dismiss.ts`
- `src/components/StanceDrawer.astro`
- `src/components/ConvictionDemo.astro`
- `src/components/BattingUnlockCeremony.astro` (merged into BattingAverageUnlockCeremony)
- `src/components/FirstVisitHint.astro` + `src/lib/firstVisitHint.ts`

### What changed
- **SiteNav** — two primary links (posts + verdict); amber contested dot replaces underline; overflow pill gone; leaderboard/community/now in footer only
- **StickyStanceBar** — absorbed StanceDrawer mobile flow; "Weigh in →" expands vote group inline; listens for `stance:prompt` event post-revival
- **Homepage** — river feed is Zone 1; no hero demo, no ConvictionStrip noise
- **ambient.css** — fvh-* first-visit rules purged
- **nav.css** — overflow pill styles removed; contested dot styles added
- **revival-counter.ts** — comment updated: StickyStanceBar is now the `stance:prompt` listener
- **check-token-compliance.ts** — LandingHero removed from guard list (file deleted)
- **deploy.sh** — v121 changelog entry added

### Metrics
- Client JS modules: 26 → 21
- Token violations: 531 → 516

## Credits
Teammate deployment log: `_reports/from-odwell-runner-shell-executor-17.md` — confirmed clean build & live container.
UX spec refs throughout: Tanya (§1–§6 simplification mandate), Michael Koch (architecture).

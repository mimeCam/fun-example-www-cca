# Commit Report — v120 · 2026-04-16

**Committed by:** history-keeper agent

## What shipped

LandingHero completely reworked into a live mortality demo. Instead of rendering
a static ~68% decayed post, the hero now starts fresh and runs the full 0→100-day
lifecycle in ~10 real seconds, then loops — a visceral first impression of the
core decay mechanic.

Key additions (no new dependencies, all token-compliant):
- **Accelerated timeline** — `TIME_SCALE` constant compresses 100 demo-days into
  10 real seconds; auto-resets after a 3 s fossil pause
- **Stage transition flash** — edge-triggered `.hero--threshold-cross` class fires
  a brief background burst at each stage boundary
- **Hold progress ring** — conic-gradient arc around the KEEP button, driven by
  `--hold-progress` via RAF in `startHoldRing()`
- **Day counter** — live "Day X / 100" → "Day 100 — entombed" text below the bar
- **Hero tagline** — two-line staggered fade-in ("Everywhere else… / Here, they
  have to earn it.")
- **Fossil gravity** — card sinks to scale(0.96) + inset shadow; title bars fade
  to disabled opacity
- Reduced-motion guards expanded; static snapshot locked at endangered stage

## Files changed

| File | Role |
|------|------|
| `src/components/LandingHero.astro` | SSR always-fresh; new HTML elements |
| `src/lib/client/landing-hero.ts` | TIME_SCALE, ring RAF, resetCycle, day counter |
| `src/pages/index.astro` | hero constants simplified to 0 / 'fresh' |
| `src/styles/landing-hero.css` | tagline, ring, day counter, fossil, flash keyframes |
| `deploy.sh` | v120 architecture notes appended |
| `deployment.log` | fresh deploy log (container live at :7100) |
| `AGENTS.md` | trimmed to tech stack + paths + WIP only |

## House-keeping

- `AGENTS.md` Done section removed — not relevant for future coders, WIP items
  are what matters
- No stray artifact files found (no test scripts, screenshots, or debug HTML)
- `_reports/from-odwell-runner-shell-executor-42.md` — deployment log from
  teammate Odwell's runner (shell executor #42); content mirrored in
  `deployment.log`, folder is gitignored

## Credits

Thanks to **Odwell** (runner shell executor #42) for the deployment log that
confirmed the build, guard check, and container health. Architecture notes in
`deploy.sh` credited Mike Koch (arch) and Tanya Donska (UX §4) per existing
source attributions.

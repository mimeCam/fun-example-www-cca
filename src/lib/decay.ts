// src/lib/decay.ts
// Unified decay computation for blog posts.
// Continuous function: fresh (0) → ancient (1). No discrete buckets for visuals.
// Labels exist for accessibility/screen readers only.
//
// Reuses daysSince() from temporal.ts — no duplication.
// Pure functions. Stateless. Testable.
//
// TODO: tune maxDays default once post volume grows beyond ~20

import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Core decay
// ---------------------------------------------------------------------------

/** Revival bonus: logarithmic, capped at 0.3. First revivals matter most. */
export function revivalBonus(revivalCount: number): number {
  return Math.min(0.3, Math.log(revivalCount + 1) * 0.05);
}

/** Continuous decay factor: 0.0 (just published) → 1.0 (ancient). */
export function decayFactor(
  pubDate: string,
  maxDays = 365,
  now = new Date(),
  revivalCount = 0,
): number {
  const raw = Math.min(1, daysSince(pubDate, now) / maxDays);
  return Math.max(0, raw - revivalBonus(revivalCount));
}

// ---------------------------------------------------------------------------
// Visual mappings (continuous, not bucketed)
// ---------------------------------------------------------------------------

/** Opacity: 1.0 (fresh) → 0.35 (ancient). Never invisible. */
export function opacityFromDecay(factor: number): number {
  return Math.max(0.35, 1 - factor * 0.65);
}

/** Blur in px: 0 (fresh) → 1.5 (ancient). Subtle, not aggressive. */
export function blurFromDecay(factor: number): number {
  return +(factor * 1.5).toFixed(2);
}

/** Saturation multiplier: 1.0 (fresh) → 0.6 (ancient). */
export function saturationFromDecay(factor: number): number {
  return +(1 - factor * 0.4).toFixed(2);
}

/** Shadow spread in px: 32 (fresh) → 0 (ancient). Decay eats the shadow. */
export function shadowSpreadFromDecay(factor: number): number {
  return +((1 - factor) * 32).toFixed(1);
}

/** Shadow opacity: 0.18 (fresh) → 0 (ancient). */
export function shadowAlphaFromDecay(factor: number): number {
  return +((1 - factor) * 0.18).toFixed(3);
}

/** Y-offset for shadow: 8 (fresh) → 0 (ancient). */
export function shadowYFromDecay(factor: number): number {
  return +((1 - factor) * 8).toFixed(1);
}

// ---------------------------------------------------------------------------
// Time band classification (for homepage grouping + time-travel re-sorting)
// ---------------------------------------------------------------------------

export type TimeBandName = 'now' | 'recent' | 'archive';

/** Classify a day-offset into a time band. */
export function timeBand(daysSincePublished: number): TimeBandName {
  if (daysSincePublished <= 30) return 'now';
  if (daysSincePublished <= 180) return 'recent';
  return 'archive';
}

// ---------------------------------------------------------------------------
// Accessibility label (screen readers only)
// ---------------------------------------------------------------------------

export type FreshnessTag =
  | 'just published'
  | 'recent'
  | 'settling'
  | 'aged'
  | 'fossil';

/** Human-readable freshness tag from decay factor. */
export function freshnessTag(factor: number): FreshnessTag {
  if (factor < 0.05) return 'just published';
  if (factor < 0.2) return 'recent';
  if (factor < 0.5) return 'settling';
  if (factor < 0.8) return 'aged';
  return 'fossil';
}

// ---------------------------------------------------------------------------
// CSS custom properties bundle
// ---------------------------------------------------------------------------

export interface DecayCSSVars {
  '--decay-opacity': string;
  '--decay-blur': string;
  '--decay-saturation': string;
  '--decay-shadow-y': string;
  '--decay-shadow-spread': string;
  '--decay-shadow-alpha': string;
}

/** Returns CSS custom properties for inline style binding. */
export function decayCSSVars(factor: number): DecayCSSVars {
  return {
    '--decay-opacity': String(opacityFromDecay(factor)),
    '--decay-blur': `${blurFromDecay(factor)}px`,
    '--decay-saturation': String(saturationFromDecay(factor)),
    '--decay-shadow-y': `${shadowYFromDecay(factor)}px`,
    '--decay-shadow-spread': `${shadowSpreadFromDecay(factor)}px`,
    '--decay-shadow-alpha': String(shadowAlphaFromDecay(factor)),
  };
}

/** Converts DecayCSSVars to an inline style string. */
export function decayStyleString(factor: number): string {
  const vars = decayCSSVars(factor);
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testDecayLib(): void {
  const f0 = decayFactor('2026-04-05', 365, new Date('2026-04-05'));
  console.assert(f0 === 0, `same-day factor: expected 0, got ${f0}`);

  const f1 = decayFactor('2025-04-05', 365, new Date('2026-04-05'));
  console.assert(f1 === 1, `1-year factor: expected 1, got ${f1}`);

  const mid = decayFactor('2026-01-05', 365, new Date('2026-04-05'));
  console.assert(mid > 0 && mid < 1, `mid factor out of range: ${mid}`);

  console.assert(opacityFromDecay(0) === 1, 'fresh opacity must be 1');
  console.assert(opacityFromDecay(1) === 0.35, 'ancient opacity must be 0.35');

  console.assert(blurFromDecay(0) === 0, 'fresh blur must be 0');
  console.assert(blurFromDecay(1) === 1.5, 'ancient blur must be 1.5');

  console.assert(saturationFromDecay(0) === 1, 'fresh sat must be 1');
  console.assert(saturationFromDecay(1) === 0.6, 'ancient sat must be 0.6');

  console.assert(freshnessTag(0) === 'just published', 'tag at 0');
  console.assert(freshnessTag(0.1) === 'recent', 'tag at 0.1');
  console.assert(freshnessTag(0.3) === 'settling', 'tag at 0.3');
  console.assert(freshnessTag(0.6) === 'aged', 'tag at 0.6');
  console.assert(freshnessTag(0.9) === 'fossil', 'tag at 0.9');

  console.assert(shadowSpreadFromDecay(0) === 32, 'fresh shadow spread');
  console.assert(shadowSpreadFromDecay(1) === 0, 'fossil shadow spread');
  console.assert(shadowAlphaFromDecay(0) === 0.18, 'fresh shadow alpha');
  console.assert(shadowAlphaFromDecay(1) === 0, 'fossil shadow alpha');
  console.assert(shadowYFromDecay(0) === 8, 'fresh shadow y-offset');
  console.assert(shadowYFromDecay(1) === 0, 'fossil shadow y-offset');

  const css = decayCSSVars(0.5);
  console.assert(css['--decay-opacity'] === String(opacityFromDecay(0.5)));
  console.assert(css['--decay-blur'] === `${blurFromDecay(0.5)}px`);
  console.assert(css['--decay-shadow-spread'] === `${shadowSpreadFromDecay(0.5)}px`);

  const style = decayStyleString(0);
  console.assert(style.includes('--decay-opacity:1'), 'style string');
  console.assert(style.includes('--decay-shadow-alpha:0.18'), 'shadow in style');

  // Revival bonus checks
  console.assert(revivalBonus(0) === 0, 'zero revivals = zero bonus');
  const rb7 = revivalBonus(7);
  console.assert(rb7 > 0.09 && rb7 < 0.12, `7 revivals bonus: ${rb7}`);
  console.assert(revivalBonus(9999) === 0.3, 'bonus capped at 0.3');

  // Revival slows decay
  const withRev = decayFactor('2025-04-05', 365, new Date('2026-04-05'), 50);
  console.assert(withRev < 1, `revived fossil should be < 1, got ${withRev}`);

  // Time band checks
  console.assert(timeBand(0) === 'now', 'day 0 = now');
  console.assert(timeBand(30) === 'now', 'day 30 = now');
  console.assert(timeBand(31) === 'recent', 'day 31 = recent');
  console.assert(timeBand(180) === 'recent', 'day 180 = recent');
  console.assert(timeBand(181) === 'archive', 'day 181 = archive');

  console.log('[decay] lib OK — factor, visuals, shadow, tags, CSS vars, revival, timeBand verified');
}

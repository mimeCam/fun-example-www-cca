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

/** Continuous decay factor: 0.0 (just published) → 1.0 (ancient). */
export function decayFactor(
  pubDate: string,
  maxDays = 365,
  now = new Date(),
): number {
  return Math.min(1, daysSince(pubDate, now) / maxDays);
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
}

/** Returns CSS custom properties for inline style binding. */
export function decayCSSVars(factor: number): DecayCSSVars {
  return {
    '--decay-opacity': String(opacityFromDecay(factor)),
    '--decay-blur': `${blurFromDecay(factor)}px`,
    '--decay-saturation': String(saturationFromDecay(factor)),
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

  const css = decayCSSVars(0.5);
  console.assert(css['--decay-opacity'] === String(opacityFromDecay(0.5)));
  console.assert(css['--decay-blur'] === `${blurFromDecay(0.5)}px`);

  const style = decayStyleString(0);
  console.assert(style.includes('--decay-opacity:1'), 'style string');

  console.log('[decay] lib OK — factor, visuals, tags, CSS vars verified');
}

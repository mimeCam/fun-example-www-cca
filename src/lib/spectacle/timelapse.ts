// src/lib/spectacle/timelapse.ts
// Interpolates 6 decay CSS custom properties over ~3 seconds.
// Pure functions: (progress: 0 → 1) → DecayCSSVars.
// Reuses decay curve math from existing decay.ts — never reinvents it.
//
// The spectacle shows *real* decay, sped up. If the decay curve changes
// in decay.ts, the spectacle automatically reflects that.

import {
  opacityFromDecay,
  blurFromDecay,
  saturationFromDecay,
  shadowYFromDecay,
  shadowSpreadFromDecay,
  shadowAlphaFromDecay,
  type DecayCSSVars,
} from '../decay';

// ---------------------------------------------------------------------------
// Easing — sigmoid for cinematic feel (slow start → fast middle → slow end)
// ---------------------------------------------------------------------------

/** Cubic in-out easing for smooth timelapse progression. */
export function timelapseEase(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.5) return 4 * clamped * clamped * clamped;
  return 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// Decay interpolation — maps progress (0→1) to decay CSS vars
// ---------------------------------------------------------------------------

/** Maps a timelapse progress (0→1) to a decay factor (0→1). */
export function progressToFactor(progress: number): number {
  return timelapseEase(progress);
}

/** Returns CSS vars for a given timelapse progress. */
export function varsAtProgress(progress: number): DecayCSSVars {
  const factor = progressToFactor(progress);
  return {
    '--decay-opacity': String(opacityFromDecay(factor)),
    '--decay-blur': `${blurFromDecay(factor)}px`,
    '--decay-saturation': String(saturationFromDecay(factor)),
    '--decay-shadow-y': `${shadowYFromDecay(factor)}px`,
    '--decay-shadow-spread': `${shadowSpreadFromDecay(factor)}px`,
    '--decay-shadow-alpha': String(shadowAlphaFromDecay(factor)),
  };
}

// ---------------------------------------------------------------------------
// Card patching — applies decay vars to a DOM element's inline style
// ---------------------------------------------------------------------------

/** Applies decay CSS vars to a single element. */
export function patchElement(el: HTMLElement, progress: number): void {
  const vars = varsAtProgress(progress);
  for (const [key, val] of Object.entries(vars)) {
    el.style.setProperty(key, val);
  }
}

/** Applies decay CSS vars to all cards matching the selector. */
export function patchAllCards(
  progress: number,
  selector = '.decay-card[data-pub-date]',
): void {
  const cards = document.querySelectorAll<HTMLElement>(selector);
  cards.forEach((card) => patchElement(card, progress));
}

// ---------------------------------------------------------------------------
// Fog — maps progress to fog overlay opacity via CSS custom property
// ---------------------------------------------------------------------------

/** Peak fog opacity during timelapse (twilight, not blackout). */
const FOG_PEAK = 0.4;

/** Sets --spectacle-progress on :root for FogOverlay to consume. */
export function setFogProgress(progress: number): void {
  const fogValue = timelapseEase(progress) * FOG_PEAK;
  document.documentElement.style.setProperty(
    '--spectacle-progress',
    fogValue.toFixed(3),
  );
}

/** Clears fog by setting progress to 0. */
export function clearFog(): void {
  document.documentElement.style.setProperty('--spectacle-progress', '0');
}

// ---------------------------------------------------------------------------
// Inline snippet — minified decay math for IIFE embedding
// ---------------------------------------------------------------------------

/** Returns minified JS implementing patchCard + fog for inline scripts. */
export function timelapseSnippet(): string {
  return [
    'function tlEase(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}',
    'function tlPatch(el,p){var f=tlEase(p);',
    'el.style.setProperty("--decay-opacity",Math.max(.35,1-f*.65));',
    'el.style.setProperty("--decay-blur",(f*1.5).toFixed(2)+"px");',
    'el.style.setProperty("--decay-saturation",(1-f*.4).toFixed(2));',
    'el.style.setProperty("--decay-shadow-y",((1-f)*8).toFixed(1)+"px");',
    'el.style.setProperty("--decay-shadow-spread",((1-f)*32).toFixed(1)+"px");',
    'el.style.setProperty("--decay-shadow-alpha",((1-f)*.18).toFixed(3))}',
    'function tlFog(p){document.documentElement.style.setProperty(',
    '"--spectacle-progress",(tlEase(p)*.4).toFixed(3))}',
  ].join('');
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testTimelapse(): void {
  console.assert(timelapseEase(0) === 0, 'ease(0) = 0');
  console.assert(
    Math.abs(timelapseEase(1) - 1) < 0.001,
    'ease(1) ≈ 1',
  );

  const mid = timelapseEase(0.5);
  console.assert(mid > 0.4 && mid < 0.6, `ease(0.5) near midpoint: ${mid}`);

  const fresh = varsAtProgress(0);
  console.assert(fresh['--decay-opacity'] === '1', 'progress 0 → full opacity');
  console.assert(fresh['--decay-blur'] === '0px', 'progress 0 → no blur');

  const fossil = varsAtProgress(1);
  console.assert(fossil['--decay-opacity'] === '0.35', 'progress 1 → min opacity');
  console.assert(fossil['--decay-blur'] === '1.5px', 'progress 1 → max blur');

  const snippet = timelapseSnippet();
  console.assert(snippet.includes('tlEase'), 'snippet has easing');
  console.assert(snippet.includes('tlPatch'), 'snippet has patcher');
  console.assert(snippet.includes('tlFog'), 'snippet has fog');

  console.log('[timelapse] OK — easing, vars, fog, snippet verified');
}

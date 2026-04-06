// src/lib/decay-engine.ts
// Unified Decay Engine — single source of truth for all decay computation.
//
// Consolidates: decay.ts, live-decay.ts, decayChoreography.ts, entomb.ts,
// and the visual-mapping + CSS-vars logic that was scattered across files.
//
// Server-side: pure functions for SSR (decayFactor, decayCSSVars, isEntombed).
// Client-side: liveDecayScript() → inline IIFE that recomputes vars + choreography.
//
// One number drives everything: decayFactor 0 (fresh) → 1 (ancient).
// CSS custom properties derived from that single float.
//
// Credits: Mike (architecture), Elon (cold-start diagnosis)

import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DAYS_DEFAULT = 365;
const MS_PER_DAY = 86_400_000;
const ENTOMB_THRESHOLD = 0.95;
const DORMANCY_DAYS = 30;
const RISEN_VISIBLE_DAYS = 7;

export { ENTOMB_THRESHOLD, DORMANCY_DAYS };

// ---------------------------------------------------------------------------
// Core decay — pure math, zero state
// ---------------------------------------------------------------------------

/** Revival bonus: logarithmic, capped at 0.3. First revivals matter most. */
export function revivalBonus(count: number): number {
  return Math.min(0.3, Math.log(count + 1) * 0.05);
}

/**
 * Reading bonus: logarithmic, capped at 0.08.
 * Weaker than revival (0.30) — rewards presence, not gaming.
 * Every ~30s of reading is one unit. Curve saturates around 4 minutes.
 * Credits: Mike (architecture spec)
 */
export function readingBonus(readingSeconds: number): number {
  return Math.min(0.08, Math.log(readingSeconds / 30 + 1) * 0.04);
}

/** Continuous decay: 0.0 (just published) → 1.0 (ancient). */
export function decayFactor(
  pubDate: string,
  maxDays = MAX_DAYS_DEFAULT,
  now = new Date(),
  revivalCount = 0,
  readingSeconds = 0,
): number {
  const raw = Math.min(1, daysSince(pubDate, now) / maxDays);
  return Math.max(0, raw - revivalBonus(revivalCount) - readingBonus(readingSeconds));
}

/** Compute decay with a known revival count (for post-revival API calls). */
export function decayFactorWithCount(
  pubDate: string,
  revivalCount: number,
  maxDays = MAX_DAYS_DEFAULT,
  now = new Date(),
  readingSeconds = 0,
): number {
  return decayFactor(pubDate, maxDays, now, revivalCount, readingSeconds);
}

// ---------------------------------------------------------------------------
// Visual mappings — continuous, not bucketed
// ---------------------------------------------------------------------------

/** Opacity: 1.0 (fresh) → 0.35 (ancient). Never invisible. */
export function opacityFromDecay(f: number): number {
  return Math.max(0.35, 1 - f * 0.65);
}

/** Blur in px: 0 (fresh) → 1.5 (ancient). */
export function blurFromDecay(f: number): number {
  return +(f * 1.5).toFixed(2);
}

/** Saturation multiplier: 1.0 (fresh) → 0.6 (ancient). */
export function saturationFromDecay(f: number): number {
  return +(1 - f * 0.4).toFixed(2);
}

/** Shadow Y-offset: 8px (fresh) → 0 (ancient). */
export function shadowYFromDecay(f: number): number {
  return +((1 - f) * 8).toFixed(1);
}

/** Shadow spread: 32px (fresh) → 0 (ancient). */
export function shadowSpreadFromDecay(f: number): number {
  return +((1 - f) * 32).toFixed(1);
}

/** Shadow opacity: 0.18 (fresh) → 0 (ancient). */
export function shadowAlphaFromDecay(f: number): number {
  return +((1 - f) * 0.18).toFixed(3);
}

// ---------------------------------------------------------------------------
// Time bands — homepage grouping
// ---------------------------------------------------------------------------

export type TimeBandName = 'now' | 'recent' | 'archive';

/** Classify age in days into a time band. */
export function timeBand(daysSincePublished: number): TimeBandName {
  if (daysSincePublished <= 30) return 'now';
  if (daysSincePublished <= 180) return 'recent';
  return 'archive';
}

// ---------------------------------------------------------------------------
// Accessibility — screen reader labels
// ---------------------------------------------------------------------------

export type FreshnessTag =
  | 'just published'
  | 'recent'
  | 'settling'
  | 'aged'
  | 'fossil';

/** Human-readable freshness from decay factor. */
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

/** CSS vars at maximum decay. */
export function maxDecayVars(): DecayCSSVars {
  return decayCSSVars(1);
}

/** Converts DecayCSSVars to an inline style string. */
export function decayStyleString(factor: number): string {
  const vars = decayCSSVars(factor);
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// ---------------------------------------------------------------------------
// Entombment — graveyard eligibility
// ---------------------------------------------------------------------------

/** True when a post should rest in the graveyard. */
export function isEntombed(
  factor: number,
  lastRevivalDaysAgo: number,
  dormancy = DORMANCY_DAYS,
): boolean {
  return factor >= ENTOMB_THRESHOLD && lastRevivalDaysAgo > dormancy;
}

/** Days since entombment threshold was crossed. */
export function entombmentAge(
  pubDateISO: string,
  maxDays: number,
  now = new Date(),
): number {
  const age = daysSince(pubDateISO, now);
  const thresholdDay = Math.ceil(maxDays * ENTOMB_THRESHOLD);
  return Math.max(0, age - thresholdDay);
}

/** True when risen badge should still be visible (7 days). */
export function isRecentlyRisen(
  risenAt: Date | null,
  now = new Date(),
): boolean {
  if (!risenAt) return false;
  const ms = now.getTime() - risenAt.getTime();
  return ms < RISEN_VISIBLE_DAYS * MS_PER_DAY;
}

/** Resurrection weight (heavier than a regular revival). */
export const RESURRECT_BONUS = 3;

// ---------------------------------------------------------------------------
// Client script — live-decay recomputation + first-visit choreography
// Combined IIFE replacing live-decay.ts + decayChoreography.ts
// ---------------------------------------------------------------------------

export function decayEngineClientScript(): string {
  return `(function(){
  var DAY=${MS_PER_DAY},TICK=60000,FBMS=3000;
  var mm=document.querySelector('meta[name="decay-max-days"]');
  var M=mm?+mm.content||${MAX_DAYS_DEFAULT}:${MAX_DAYS_DEFAULT};
  var paused=false,lastTick=0;

  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function rdg(s){return Math.min(.08,Math.log(s/30+1)*.04)}
  function df(p,n,r,s){return Math.max(0,Math.min(1,(n-p)/DAY/M)-rb(r)-rdg(s))}
  function patch(el,n){
    if(el.hasAttribute('data-bloom-lock'))return;
    var r=+(el.dataset.revivalCount||'0');
    var s=+(el.dataset.readingSeconds||'0');
    var f=df(new Date(el.dataset.pubDate).getTime(),n,r,s);
    el.style.setProperty('--decay-opacity',Math.max(.35,1-f*.65));
    el.style.setProperty('--decay-blur',(f*1.5).toFixed(2)+'px');
    el.style.setProperty('--decay-saturation',(1-f*.4).toFixed(2));
    el.style.setProperty('--decay-shadow-y',((1-f)*8).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-spread',((1-f)*32).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-alpha',((1-f)*.18).toFixed(3));
  }
  function tick(){
    if(!paused){var n=Date.now();if(n-lastTick>=TICK){lastTick=n;
      document.querySelectorAll('.decay-card.choreo-done[data-pub-date]')
        .forEach(function(c){patch(c,n)})}}
    requestAnimationFrame(tick);
  }
  document.addEventListener('timetravel:seek',function(){paused=true});
  document.addEventListener('timetravel:exit',function(){paused=false;lastTick=0});

  /* --- First-visit choreography --- */
  var CK='decay-choreo-seen',STAG=120,HOLD=400,SETTLE=800;
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen=false;try{seen=sessionStorage.getItem(CK)==='1'}catch(e){}

  function skipAll(){
    document.querySelectorAll('.choreo-pending').forEach(function(c){
      c.classList.remove('choreo-pending');c.classList.add('choreo-done')});
  }
  function reveal(card,delay){
    setTimeout(function(){
      card.classList.remove('choreo-pending');
      card.classList.add('choreo-reveal');
      setTimeout(function(){
        card.classList.remove('choreo-reveal');
        card.classList.add('choreo-settle');
        setTimeout(function(){
          card.classList.remove('choreo-settle');
          card.classList.add('choreo-done');
        },SETTLE);
      },HOLD);
    },delay);
  }
  function initChoreo(){
    if(rm||seen){skipAll();return}
    try{sessionStorage.setItem(CK,'1')}catch(e){}
    var cards=document.querySelectorAll('.choreo-pending');
    if(!cards.length)return;
    if(!window.IntersectionObserver){skipAll();return}
    var io=new IntersectionObserver(function(entries){
      var vis=[];
      entries.forEach(function(e){if(e.isIntersecting){vis.push(e.target);io.unobserve(e.target)}});
      vis.sort(function(a,b){return a.getBoundingClientRect().top-b.getBoundingClientRect().top});
      vis.forEach(function(c,i){reveal(c,i*STAG)});
    },{threshold:0.1});
    cards.forEach(function(c){io.observe(c)});
    setTimeout(skipAll,FBMS);
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',function(){initChoreo();setTimeout(function(){requestAnimationFrame(tick)},FBMS)});
  else{initChoreo();setTimeout(function(){requestAnimationFrame(tick)},FBMS)}
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testDecayEngine(): void {
  // Core decay
  const f0 = decayFactor('2026-04-05', 365, new Date('2026-04-05'));
  console.assert(f0 === 0, `same-day: expected 0, got ${f0}`);

  const f1 = decayFactor('2025-04-05', 365, new Date('2026-04-05'));
  console.assert(f1 === 1, `1-year: expected 1, got ${f1}`);

  // Visual mappings
  console.assert(opacityFromDecay(0) === 1, 'fresh opacity');
  console.assert(opacityFromDecay(1) === 0.35, 'fossil opacity');
  console.assert(blurFromDecay(0) === 0, 'fresh blur');
  console.assert(shadowYFromDecay(0) === 8, 'fresh shadow y');
  console.assert(shadowSpreadFromDecay(1) === 0, 'fossil spread');

  // Time bands
  console.assert(timeBand(0) === 'now', 'day 0');
  console.assert(timeBand(31) === 'recent', 'day 31');
  console.assert(timeBand(181) === 'archive', 'day 181');

  // Freshness
  console.assert(freshnessTag(0) === 'just published', 'tag 0');
  console.assert(freshnessTag(0.9) === 'fossil', 'tag 0.9');

  // Entombment
  console.assert(isEntombed(0.96, 31), 'high+dormant=entombed');
  console.assert(!isEntombed(0.94, 31), 'below threshold');
  console.assert(!isEntombed(0.96, 10), 'recent revival');

  // Revival bonus
  console.assert(revivalBonus(0) === 0, 'zero revivals');
  console.assert(revivalBonus(9999) === 0.3, 'capped');

  // Reading bonus
  console.assert(readingBonus(0) === 0, 'zero reading seconds');
  console.assert(readingBonus(999999) === 0.08, 'reading capped at 0.08');
  console.assert(readingBonus(30) > 0, 'one interval has bonus');
  console.assert(readingBonus(30) < 0.08, 'one interval below cap');

  // CSS vars
  const css = decayCSSVars(0.5);
  console.assert(css['--decay-opacity'] === String(opacityFromDecay(0.5)), 'css opacity');

  // Style string
  const style = decayStyleString(0);
  console.assert(style.includes('--decay-opacity:1'), 'style string');

  // Risen badge
  const now = new Date('2026-04-06');
  console.assert(isRecentlyRisen(new Date('2026-04-02'), now), 'recent risen');
  console.assert(!isRecentlyRisen(new Date('2026-03-01'), now), 'old risen');
  console.assert(!isRecentlyRisen(null, now), 'null risen');

  // decayFactorWithCount wrapper
  const wc = decayFactorWithCount('2026-04-05', 5, 365, new Date('2026-04-05'));
  console.assert(wc === 0, `withCount same-day: expected 0, got ${wc}`);

  // Client script
  const script = decayEngineClientScript();
  console.assert(script.includes('choreo-pending'), 'has choreography');
  console.assert(script.includes('requestAnimationFrame'), 'has RAF loop');

  console.log('[decay-engine] OK — all checks passed');
}

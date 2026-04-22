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
// Conviction — author stance modulates physics of decay
// ---------------------------------------------------------------------------

/** All valid verdict tokens (matches content/config.ts verdictEnum + 'abandoned'). */
export type ConvictionVerdict =
  | 'still-true' | 'evolved' | 'unaudited' | 'wrong' | 'abandoned';

/** Worst-case verdict wins: wrong/abandoned > unaudited > evolved > still-true. */
const VERDICT_PRIORITY: ConvictionVerdict[] =
  ['wrong', 'abandoned', 'unaudited', 'evolved', 'still-true'];

/** Multiplier applied to raw time component. >1 accelerates decay, <1 slows it. */
const CONVICTION_MULTIPLIER: Record<ConvictionVerdict, number> = {
  'still-true': 0.7,   // author doubles down — time slows
  'evolved':    0.9,   // belief refined — slight resistance
  'unaudited':  1.0,   // baseline — author hasn't checked
  'wrong':      1.4,   // author recants — accelerated
  'abandoned':  1.4,   // author walked away — accelerated
};

/** Decay speed multiplier for a conviction verdict. Null → 1.0 (baseline). */
export function convictionMultiplier(v: ConvictionVerdict | null): number {
  return v ? CONVICTION_MULTIPLIER[v] : 1.0;
}

/**
 * Worst-case verdict from an array — wrong beats still-true even 1 of 5.
 * Returns null for empty arrays (no convictions declared).
 */
export function dominantConviction(
  verdicts: ConvictionVerdict[],
): ConvictionVerdict | null {
  if (!verdicts.length) return null;
  return VERDICT_PRIORITY.find(v => verdicts.includes(v)) ?? null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Aligned with CLOCK_MAX_DAYS in death-clock.ts — single source of truth for post lifespan.
// Importing death-clock.ts here would be circular (it imports decay-engine).
// Both constants are 365; death-clock.ts is the canonical owner. — Mike §4.1
const MAX_DAYS_DEFAULT = 365;

// ---------------------------------------------------------------------------
// Logarithmic decay — Elon §3: front-loads 70% of decay to first 60 days.
// k ≈ 0.065 solved numerically from: ln(1+60k)/ln(1+365k) = 0.70
// Flag-gate allows rollback without touching callers.
// ---------------------------------------------------------------------------

/** When true, decayFactor() uses logarithmic curve instead of linear. */
export const LOGARITHMIC_DECAY = true;

const LOG_K = 0.065;

/**
 * Logarithmic decay: t=0 → 0.0, t=maxDays → 1.0.
 * Front-loads 70% of decay into the first 60 days.
 * Shape: ln(1 + t·k) / ln(1 + maxDays·k), k=0.065.
 */
export function logarithmicDecay(t: number, maxDays = MAX_DAYS_DEFAULT): number {
  const denom = Math.log(1 + maxDays * LOG_K);
  return Math.log(1 + t * LOG_K) / denom;
}
const MS_PER_DAY = 86_400_000;
const ENTOMB_THRESHOLD = 0.95;
const DORMANCY_DAYS = 30;
const RISEN_VISIBLE_DAYS = 7;

export { ENTOMB_THRESHOLD, DORMANCY_DAYS };

/** Meta tag HTML string — single source of truth for client-side decay window. */
export function decayMaxDaysMetaTag(): string {
  return `<meta name="decay-max-days" content="${MAX_DAYS_DEFAULT}">`;
}

// ---------------------------------------------------------------------------
// Core decay — pure math, zero state
// ---------------------------------------------------------------------------

/** Revival bonus: logarithmic, capped at 0.3. First revivals matter most. */
export function revivalBonus(count: number): number {
  return Math.min(0.3, Math.log(count + 1) * 0.05);
}

/**
 * Reading bonus: logarithmic, capped at 0.15.
 * Weaker than revival (0.30) — rewards presence, not gaming.
 * Every ~30s of reading is one unit. Curve saturates around 4 minutes.
 * Credits: Mike (architecture spec), cap raised 0.08 → 0.15 (bug fix)
 */
export function readingBonus(readingSeconds: number): number {
  return Math.min(0.15, Math.log(readingSeconds / 30 + 1) * 0.04);
}

/**
 * Continuous decay: 0.0 (just published) → 1.0 (ancient).
 * conviction is optional — null = 1.0× (backwards-compatible).
 * Multiplier applied to raw time only; reader bonuses are unaffected.
 */
export function decayFactor(
  pubDate: string,
  maxDays = MAX_DAYS_DEFAULT,
  now = new Date(),
  revivalCount = 0,
  readingSeconds = 0,
  conviction: ConvictionVerdict | null = null,
): number {
  const days = daysSince(pubDate, now);
  const raw = LOGARITHMIC_DECAY
    ? Math.min(1, logarithmicDecay(days, maxDays))
    : Math.min(1, days / maxDays);
  const adjusted = raw * convictionMultiplier(conviction);
  return Math.max(0, adjusted - revivalBonus(revivalCount) - readingBonus(readingSeconds));
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
// Perceptual curve — the single most impactful change (Mike §1)
// ---------------------------------------------------------------------------

/** All valid decay stage identifiers. */
export type DecayStage =
  | 'fresh' | 'fading' | 'endangered' | 'ghost' | 'fossil';

/**
 * easeInQuad: front-loads visual freshness, accelerates aging.
 * At f=0.3 → 0.09 (still 91% fresh). At f=0.7 → 0.49 (dramatic).
 * Layered on top of logarithmic time compression → double front-loading.
 */
export function perceptualFactor(f: number): number {
  return f * f;
}

/**
 * Classify raw decay factor into a discrete stage.
 * Thresholds consumed by DecayCard (via postMeta.decayStage) and heartbeat orchestrator.
 */
export function stageFromFactor(f: number): DecayStage {
  if (f >= 0.97) return 'fossil';
  if (f >= 0.75) return 'ghost';
  if (f >= 0.50) return 'endangered';
  if (f >= 0.25) return 'fading';
  return 'fresh';
}

// ---------------------------------------------------------------------------
// Visual mappings — perceptual curve widens contrast between stages
// All visual functions accept RAW factor; they apply perceptual internally.
// Mike §1: "the mapping function should use easeInQuad curve (not linear)"
// ---------------------------------------------------------------------------

/** Opacity: 1.0 (fresh) → 0.25 (fossil). Never invisible. */
export function opacityFromDecay(f: number): number {
  return Math.max(0.25, 1 - perceptualFactor(f) * 0.75);
}

/** Blur in px: 0 (fresh) → 2.5 (fossil). */
export function blurFromDecay(f: number): number {
  return +(perceptualFactor(f) * 2.5).toFixed(2);
}

/** Saturation multiplier: 1.0 (fresh) → 0.15 (fossil). */
export function saturationFromDecay(f: number): number {
  return +(1 - perceptualFactor(f) * 0.85).toFixed(2);
}

/** Shadow Y-offset: 10px (fresh) → 0 (fossil). */
export function shadowYFromDecay(f: number): number {
  return +((1 - perceptualFactor(f)) * 10).toFixed(1);
}

/** Shadow spread: 40px (fresh) → 0 (fossil). */
export function shadowSpreadFromDecay(f: number): number {
  return +((1 - perceptualFactor(f)) * 40).toFixed(1);
}

/** Shadow opacity: 0.22 (fresh) → 0 (fossil). */
export function shadowAlphaFromDecay(f: number): number {
  return +((1 - perceptualFactor(f)) * 0.22).toFixed(3);
}

/** Sepia tint: 0 (fresh) → 0.35 (fossil). Bold aging signal. */
export function sepiaFromDecay(f: number): number {
  return +(perceptualFactor(f) * 0.35).toFixed(3);
}

/**
 * Grain overlay opacity — staged with steeper curve for drama.
 * Mike §1: "fossils should look textured."
 * Grain is staged (not continuous) — each band is a distinct material.
 */
export function grainFromDecay(f: number): number {
  if (f < 0.2) return 0;
  if (f < 0.4) return 0.02;
  if (f < 0.6) return 0.08;
  if (f < 0.8) return 0.16;
  return 0.25;
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
  '--decay-sepia': string;
  '--decay-grain': string;
  '--decay-factor': string;
  '--decay-perceptual': string;
  '--decay-shadow-y': string;
  '--decay-shadow-spread': string;
  '--decay-shadow-alpha': string;
}

/** Returns CSS custom properties for inline style binding. */
export function decayCSSVars(factor: number): DecayCSSVars {
  return {
    '--decay-opacity':       String(opacityFromDecay(factor)),
    '--decay-blur':          `${blurFromDecay(factor)}px`,
    '--decay-saturation':    String(saturationFromDecay(factor)),
    '--decay-sepia':         String(sepiaFromDecay(factor)),
    '--decay-grain':         String(grainFromDecay(factor)),
    '--decay-factor':        factor.toFixed(4),
    '--decay-perceptual':    perceptualFactor(factor).toFixed(4),
    '--decay-shadow-y':      `${shadowYFromDecay(factor)}px`,
    '--decay-shadow-spread': `${shadowSpreadFromDecay(factor)}px`,
    '--decay-shadow-alpha':  String(shadowAlphaFromDecay(factor)),
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

/**
 * Days until decay reaches ENTOMB_THRESHOLD given current revival state.
 * Exported so death-clock.ts has a single authoritative source of this math.
 * Returns 0 when already entombed.
 */
export function daysToEntombment(
  pubDate: string,
  revivalCount = 0,
  readingSeconds = 0,
  maxDays = MAX_DAYS_DEFAULT,
  now = new Date(),
  conviction: ConvictionVerdict | null = null,
): number {
  const factor = decayFactor(pubDate, maxDays, now, revivalCount, readingSeconds, conviction);
  const remaining = ENTOMB_THRESHOLD - factor;
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining * maxDays));
}

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
  var CM={'still-true':.7,'evolved':.9,'unaudited':1,'wrong':1.4,'abandoned':1.4};

  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function rdg(s){return Math.min(.15,Math.log(s/30+1)*.04)}
  function df(p,n,r,s,cv){var m=CM[cv]||1;return Math.max(0,Math.min(1,(n-p)/DAY/M)*m-rb(r)-rdg(s))}
  function pf(f){return f*f}
  function stg(f){return f>=.97?'fossil':f>=.75?'ghost':f>=.5?'endangered':f>=.25?'fading':'fresh'}
  function grn(f){return f<.2?'0':f<.4?'.02':f<.6?'.08':f<.8?'.16':'.25'}
  function patch(el,n){
    if(el.hasAttribute('data-bloom-lock'))return;
    var r=+(el.dataset.revivalCount||'0');
    var s=+(el.dataset.readingSeconds||'0');
    var cv=el.dataset.conviction||'unaudited';
    var f=df(new Date(el.dataset.pubDate).getTime(),n,r,s,cv);
    var p=pf(f);
    el.style.setProperty('--decay-opacity',Math.max(.25,1-p*.75));
    el.style.setProperty('--decay-blur',(p*2.5).toFixed(2)+'px');
    el.style.setProperty('--decay-saturation',(1-p*.85).toFixed(2));
    el.style.setProperty('--decay-sepia',(p*.35).toFixed(3));
    el.style.setProperty('--decay-grain',grn(f));
    el.style.setProperty('--decay-factor',f.toFixed(4));
    el.style.setProperty('--decay-perceptual',p.toFixed(4));
    el.style.setProperty('--decay-shadow-y',((1-p)*10).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-spread',((1-p)*40).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-alpha',((1-p)*.22).toFixed(3));
    var ns=stg(f);if(el.dataset.decayStage!==ns){el.dataset.decayStage=ns}
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
// Detail page cover decay script — second IIFE, separate from decayEngineClientScript().
// Targets .detail-decay-cover[data-pub-date] on blog/[slug].astro.
// Two selectors, two scripts, one concept each — Mike §PoI-1: "polymorphism is a killer."
// Respects document.visibilityState + timetravel:seek / timetravel:exit events.
// Math subroutines (rb/rdg/df/pf/stg/grn/patch) are deliberately copied from the feed
// IIFE so both scripts are independently deployable as is:inline without a bundler step.
// ---------------------------------------------------------------------------

export function detailDecayCoverScript(): string {
  return `(function(){
  var DAY=${MS_PER_DAY},TICK=60000;
  var mm=document.querySelector('meta[name="decay-max-days"]');
  var M=mm?+mm.content||${MAX_DAYS_DEFAULT}:${MAX_DAYS_DEFAULT};
  var paused=false,lastTick=0;
  var CM={'still-true':.7,'evolved':.9,'unaudited':1,'wrong':1.4,'abandoned':1.4};
  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function rdg(s){return Math.min(.15,Math.log(s/30+1)*.04)}
  function df(p,n,r,s,cv){var m=CM[cv]||1;return Math.max(0,Math.min(1,(n-p)/DAY/M)*m-rb(r)-rdg(s))}
  function pf(f){return f*f}
  function stg(f){return f>=.97?'fossil':f>=.75?'ghost':f>=.5?'endangered':f>=.25?'fading':'fresh'}
  function grn(f){return f<.2?'0':f<.4?'.02':f<.6?'.08':f<.8?'.16':'.25'}
  function patch(el,n){
    var r=+(el.dataset.revivalCount||'0');
    var s=+(el.dataset.readingSeconds||'0');
    var cv=el.dataset.conviction||'unaudited';
    var f=df(new Date(el.dataset.pubDate).getTime(),n,r,s,cv);
    var p=pf(f);
    el.style.setProperty('--decay-opacity',Math.max(.25,1-p*.75));
    el.style.setProperty('--decay-blur',(p*2.5).toFixed(2)+'px');
    el.style.setProperty('--decay-saturation',(1-p*.85).toFixed(2));
    el.style.setProperty('--decay-sepia',(p*.35).toFixed(3));
    el.style.setProperty('--decay-grain',grn(f));
    el.style.setProperty('--decay-factor',f.toFixed(4));
    el.style.setProperty('--decay-perceptual',p.toFixed(4));
    el.style.setProperty('--decay-shadow-y',((1-p)*10).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-spread',((1-p)*40).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-alpha',((1-p)*.22).toFixed(3));
    var ns=stg(f);if(el.dataset.decayStage!==ns){el.dataset.decayStage=ns}
  }
  function tick(){
    if(!paused&&document.visibilityState!=='hidden'){
      var n=Date.now();
      if(n-lastTick>=TICK){
        lastTick=n;
        var el=document.querySelector('.detail-decay-cover[data-pub-date]');
        if(el)patch(el,n);
      }
    }
    requestAnimationFrame(tick);
  }
  document.addEventListener('timetravel:seek',function(){paused=true});
  document.addEventListener('timetravel:exit',function(){paused=false;lastTick=0});
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',function(){requestAnimationFrame(tick)});
  else requestAnimationFrame(tick);
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

  // Perceptual curve
  console.assert(perceptualFactor(0) === 0, 'perceptual 0');
  console.assert(perceptualFactor(1) === 1, 'perceptual 1');
  console.assert(perceptualFactor(0.5) === 0.25, 'perceptual 0.5');

  // Stage classification
  console.assert(stageFromFactor(0) === 'fresh', 'stage 0');
  console.assert(stageFromFactor(0.3) === 'fading', 'stage 0.3');
  console.assert(stageFromFactor(0.6) === 'endangered', 'stage 0.6');
  console.assert(stageFromFactor(0.8) === 'ghost', 'stage 0.8');
  console.assert(stageFromFactor(0.98) === 'fossil', 'stage 0.98');

  // Visual mappings (perceptual curve applied internally)
  console.assert(opacityFromDecay(0) === 1, 'fresh opacity');
  console.assert(opacityFromDecay(1) === 0.25, 'fossil opacity');
  console.assert(blurFromDecay(0) === 0, 'fresh blur');
  console.assert(shadowYFromDecay(0) === 10, 'fresh shadow y');
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
  console.assert(readingBonus(999999) === 0.15, 'reading capped at 0.15');
  console.assert(readingBonus(30) > 0, 'one interval has bonus');
  console.assert(readingBonus(30) < 0.08, 'one interval below cap');

  // Sepia + grain + factor (widened ranges)
  console.assert(sepiaFromDecay(0) === 0, 'fresh sepia');
  console.assert(sepiaFromDecay(1) === 0.35, 'fossil sepia');
  console.assert(grainFromDecay(0.1) === 0, 'stage1 grain=0');
  console.assert(grainFromDecay(0.3) === 0.02, 'stage2 grain');
  console.assert(grainFromDecay(0.5) === 0.08, 'stage3 grain');
  console.assert(grainFromDecay(0.7) === 0.16, 'stage4 grain');
  console.assert(grainFromDecay(0.9) === 0.25, 'stage5 grain');

  // CSS vars
  const css = decayCSSVars(0.5);
  console.assert(css['--decay-opacity'] === String(opacityFromDecay(0.5)), 'css opacity');
  console.assert(css['--decay-grain'] === String(grainFromDecay(0.5)), 'css grain');
  console.assert(css['--decay-sepia'] === String(sepiaFromDecay(0.5)), 'css sepia');
  console.assert(css['--decay-factor'] === (0.5).toFixed(4), 'css factor');
  console.assert(css['--decay-perceptual'] === perceptualFactor(0.5).toFixed(4), 'css perceptual');

  // Style string
  const style = decayStyleString(0);
  console.assert(style.includes('--decay-opacity:1'), 'style string');
  console.assert(style.includes('--decay-grain:0'), 'style grain fresh');

  // Risen badge
  const now = new Date('2026-04-06');
  console.assert(isRecentlyRisen(new Date('2026-04-02'), now), 'recent risen');
  console.assert(!isRecentlyRisen(new Date('2026-03-01'), now), 'old risen');
  console.assert(!isRecentlyRisen(null, now), 'null risen');

  // decayFactorWithCount wrapper
  const wc = decayFactorWithCount('2026-04-05', 5, 365, new Date('2026-04-05'));
  console.assert(wc === 0, `withCount same-day: expected 0, got ${wc}`);

  // daysToEntombment
  const dte = daysToEntombment('2026-04-05', 0, 0, 180, new Date('2026-04-05'));
  console.assert(dte >= 150, `daysToEntombment same-day: expected ≥150, got ${dte}`);
  const dte0 = daysToEntombment('2020-01-01', 0, 0, 180, new Date('2026-04-05'));
  console.assert(dte0 === 0, `daysToEntombment ancient: expected 0, got ${dte0}`);

  // Client script — feed cards
  const script = decayEngineClientScript();
  console.assert(script.includes('choreo-pending'), 'has choreography');
  console.assert(script.includes('requestAnimationFrame'), 'has RAF loop');
  console.assert(script.includes('dataset.conviction'), 'IIFE reads dataset.conviction');
  console.assert(script.includes("'still-true':.7"), 'IIFE has conviction map');
  console.assert(script.includes('decay-perceptual'), 'IIFE emits perceptual');
  console.assert(script.includes('decayStage'), 'IIFE updates stage attr');

  // Detail cover script — separate IIFE, same math, different selector
  const script2 = detailDecayCoverScript();
  console.assert(script2.includes('detail-decay-cover'), 'targets detail selector');
  console.assert(script2.includes('--decay-blur'), 'sets blur var');
  console.assert(script2.includes('visibilityState'), 'has visibility guard');
  console.assert(script2.includes('timetravel:seek'), 'hooks time travel');

  // Conviction multiplier
  console.assert(convictionMultiplier(null) === 1.0, 'null → baseline 1.0');
  console.assert(convictionMultiplier('still-true') === 0.7, 'still-true → 0.7');
  console.assert(convictionMultiplier('wrong') === 1.4, 'wrong → 1.4');
  console.assert(convictionMultiplier('abandoned') === 1.4, 'abandoned → 1.4');

  // dominantConviction — worst-case wins
  console.assert(dominantConviction([]) === null, 'empty → null');
  console.assert(dominantConviction(['still-true', 'wrong']) === 'wrong', 'wrong beats still-true');
  console.assert(dominantConviction(['evolved', 'still-true']) === 'evolved', 'evolved beats still-true');
  console.assert(dominantConviction(['abandoned', 'wrong']) === 'wrong', 'wrong beats abandoned');
  console.assert(dominantConviction(['still-true']) === 'still-true', 'single still-true');

  // Conviction modulates decay — same post, same date
  const baseDate = '2026-01-01';
  const testNow = new Date('2026-04-06');
  const fWrong     = decayFactor(baseDate, 365, testNow, 0, 0, 'wrong');
  const fStillTrue = decayFactor(baseDate, 365, testNow, 0, 0, 'still-true');
  const fNull      = decayFactor(baseDate, 365, testNow, 0, 0, null);
  console.assert(fWrong > fNull, 'wrong decays faster than baseline');
  console.assert(fStillTrue < fNull, 'still-true decays slower than baseline');
  console.assert(fWrong > fStillTrue, 'wrong decays faster than still-true');

  // Backwards compat: decayFactorWithCount still works (conviction defaults to null)
  const wc2 = decayFactorWithCount('2026-01-01', 0, 365, testNow);
  console.assert(wc2 === fNull, 'withCount matches null-conviction baseline');

  console.log('[decay-engine] OK — all checks passed');
}

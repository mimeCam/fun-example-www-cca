// src/lib/endangered.ts
// Endangered Posts — pure functions for posts approaching entombment.
//
// A post is "endangered" when its decay factor is in [0.80, 0.95).
// Everything derives from the single decay float — no new state, no DB.
//
// Three urgency tiers drive pulse speed and countdown language:
//   warning  (0.80–0.85): "fading"
//   critical (0.85–0.92): "nearly forgotten"
//   final    (0.92–0.95): "hours remaining"
//
// Credits: Mike (architecture, napkin plan), Elon (cold-start diagnosis),
//          Tanya (UX spec §3.2B — endangered surface)

import { ENTOMB_THRESHOLD } from './decay-engine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ENDANGERED_THRESHOLD = 0.80;
const MAX_DAYS_DEFAULT = 365;

// ---------------------------------------------------------------------------
// Core predicates
// ---------------------------------------------------------------------------

/** True when a post is endangered: high decay but not yet entombed. */
export function isEndangered(decay: number): boolean {
  return decay >= ENDANGERED_THRESHOLD && decay < ENTOMB_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Urgency tiers — drive pulse speed and copy
// ---------------------------------------------------------------------------

export type UrgencyLevel = 'warning' | 'critical' | 'final';

/** Classify endangered decay into urgency tier. */
export function urgencyLevel(decay: number): UrgencyLevel {
  if (decay >= 0.92) return 'final';
  if (decay >= 0.85) return 'critical';
  return 'warning';
}

// ---------------------------------------------------------------------------
// Countdown estimate
// ---------------------------------------------------------------------------

/** Estimated days until entombment, based on linear decay projection. */
export function daysUntilEntomb(
  decay: number,
  maxDays = MAX_DAYS_DEFAULT,
): number {
  const remaining = ENTOMB_THRESHOLD - decay;
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining * maxDays));
}

// ---------------------------------------------------------------------------
// CSS custom properties for endangered cards
// ---------------------------------------------------------------------------

export interface EndangeredCSSVars {
  '--endangered-pulse-speed': string;
  '--endangered-glow-opacity': string;
}

/** Pulse speed and glow driven by urgency. */
export function endangeredCSSVars(decay: number): EndangeredCSSVars {
  const tier = urgencyLevel(decay);
  const speed = tier === 'final' ? '0.8s'
    : tier === 'critical' ? '2s' : '4s';
  const glow = tier === 'final' ? '0.35'
    : tier === 'critical' ? '0.25' : '0.15';
  return {
    '--endangered-pulse-speed': speed,
    '--endangered-glow-opacity': glow,
  };
}

/** Converts endangered CSS vars to inline style string. */
export function endangeredStyleString(decay: number): string {
  const vars = endangeredCSSVars(decay);
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// ---------------------------------------------------------------------------
// Countdown copy — human-readable urgency text
// ---------------------------------------------------------------------------

/** Countdown label: "fades in N days" / "hours remaining". */
export function countdownLabel(decay: number): string {
  const days = daysUntilEntomb(decay);
  if (days <= 1) return 'hours remaining';
  return `fades in ${days} days`;
}

// ---------------------------------------------------------------------------
// Client script — SSE listener + hourly countdown refresh
// ---------------------------------------------------------------------------

export function endangeredClientScript(): string {
  return `(function(){
  var ENTOMB=${ENTOMB_THRESHOLD},ENDAN=${ENDANGERED_THRESHOLD};
  var MAX_DAYS=${MAX_DAYS_DEFAULT},DAY=86400000,HOUR=3600000;
  var band=document.querySelector('.band--endangered');
  if(!band)return;

  function daysLeft(decay){
    var r=ENTOMB-decay;
    return r<=0?0:Math.max(1,Math.ceil(r*MAX_DAYS));
  }
  function label(decay){
    var d=daysLeft(decay);
    return d<=1?'hours remaining':'fades in '+d+' days';
  }

  /* Refresh countdown text hourly */
  function refreshCountdowns(){
    band.querySelectorAll('.endangered-card[data-decay-factor]')
      .forEach(function(card){
        var f=parseFloat(card.dataset.decayFactor);
        if(isNaN(f))return;
        var el=card.querySelector('.endangered-countdown');
        if(el)el.textContent=label(f);
      });
  }
  setInterval(refreshCountdowns,HOUR);

  /* Listen for revivals via existing SSE heartbeat */
  function listenForRevivals(){
    var es=window.__presenceES;
    if(!es){setTimeout(listenForRevivals,1000);return}
    es.addEventListener('revival',function(e){
      try{
        var d=JSON.parse(e.data);if(!d.slug)return;
        var card=band.querySelector('.endangered-card[data-slug="'+d.slug+'"]');
        if(!card)return;
        card.classList.add('revived');
        setTimeout(function(){
          if(card.parentNode)card.parentNode.removeChild(card);
          var remaining=band.querySelectorAll('.endangered-card');
          if(!remaining.length&&band.parentNode)band.parentNode.removeChild(band);
        },650);
      }catch(ex){}
    });
  }
  listenForRevivals();
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testEndangered(): void {
  // isEndangered boundaries
  console.assert(!isEndangered(0.79), '0.79 not endangered');
  console.assert(isEndangered(0.80), '0.80 is endangered');
  console.assert(isEndangered(0.90), '0.90 is endangered');
  console.assert(isEndangered(0.94), '0.94 is endangered');
  console.assert(!isEndangered(0.95), '0.95 is entombed, not endangered');
  console.assert(!isEndangered(0.5), '0.5 not endangered');

  // urgencyLevel tiers
  console.assert(urgencyLevel(0.80) === 'warning', '0.80 = warning');
  console.assert(urgencyLevel(0.84) === 'warning', '0.84 = warning');
  console.assert(urgencyLevel(0.85) === 'critical', '0.85 = critical');
  console.assert(urgencyLevel(0.91) === 'critical', '0.91 = critical');
  console.assert(urgencyLevel(0.92) === 'final', '0.92 = final');
  console.assert(urgencyLevel(0.94) === 'final', '0.94 = final');

  // daysUntilEntomb
  const d80 = daysUntilEntomb(0.80);
  console.assert(d80 === 55, `0.80 → expected 55, got ${d80}`);
  const d94 = daysUntilEntomb(0.94);
  console.assert(d94 === 4, `0.94 → expected 4, got ${d94}`);
  const d95 = daysUntilEntomb(0.95);
  console.assert(d95 === 0, `0.95 → expected 0, got ${d95}`);

  // countdownLabel
  console.assert(countdownLabel(0.80) === 'fades in 55 days', 'label 0.80');
  console.assert(countdownLabel(0.9479) === 'hours remaining', 'label near-entomb');

  // endangeredCSSVars
  const w = endangeredCSSVars(0.82);
  console.assert(w['--endangered-pulse-speed'] === '4s', 'warning speed');
  const c = endangeredCSSVars(0.88);
  console.assert(c['--endangered-pulse-speed'] === '2s', 'critical speed');
  const f = endangeredCSSVars(0.93);
  console.assert(f['--endangered-pulse-speed'] === '0.8s', 'final speed');

  // endangeredStyleString
  const style = endangeredStyleString(0.90);
  console.assert(style.includes('--endangered-pulse-speed'), 'has pulse var');

  // Client script
  const script = endangeredClientScript();
  console.assert(script.includes('endangered-card'), 'targets cards');
  console.assert(script.includes('revival'), 'listens for revivals');
  console.assert(script.includes('setInterval'), 'hourly refresh');

  console.log('[endangered] OK — all checks passed');
}

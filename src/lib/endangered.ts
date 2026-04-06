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
// Multi-phase revival-dismiss with animateCollapse, debounce, a11y.
// ---------------------------------------------------------------------------

/** Reusable height-collapse animation (inline in IIFE). */
export function animateCollapseSnippet(): string {
  return `function animateCollapse(el,dur,ease,onDone){
    var h=el.offsetHeight;
    el.style.maxHeight=h+'px';
    el.style.overflow='hidden';
    el.style.boxSizing='border-box';
    el.offsetHeight;
    el.style.transition='max-height '+dur+'ms '+ease+',margin '+dur+'ms '+ease+',padding-top '+dur+'ms '+ease+',padding-bottom '+dur+'ms '+ease;
    el.style.maxHeight='0';
    el.style.marginTop='0';
    el.style.marginBottom='0';
    el.style.paddingTop='0';
    el.style.paddingBottom='0';
    function done(e){
      if(e&&e.propertyName!=='max-height')return;
      el.removeEventListener('transitionend',done);
      if(onDone)onDone();
    }
    el.addEventListener('transitionend',done);
    setTimeout(function(){done(null)},dur+50);
  }`;
}

export function endangeredClientScript(): string {
  return `(function(){
  var ENTOMB=${ENTOMB_THRESHOLD},ENDAN=${ENDANGERED_THRESHOLD};
  var MAX_DAYS=${MAX_DAYS_DEFAULT},DAY=86400000,HOUR=3600000;
  var BLOOM_MS=200,FADE_MS=400,COLLAPSE_MS=300;
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var band=document.querySelector('.band--endangered');
  if(!band)return;

  var pending={};
  var boundES=null;

  ${animateCollapseSnippet()}

  function daysLeft(decay){
    var r=ENTOMB-decay;
    return r<=0?0:Math.max(1,Math.ceil(r*MAX_DAYS));
  }
  function label(decay){
    var d=daysLeft(decay);
    return d<=1?'hours remaining':'fades in '+d+' days';
  }
  function tierSpeed(decay){
    if(decay>=0.92)return '0.8s';
    if(decay>=0.85)return '2s';
    return '4s';
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

  /* Announce removal for screen readers */
  function announce(text){
    var el=document.createElement('div');
    el.setAttribute('role','status');
    el.setAttribute('aria-live','assertive');
    el.className='sr-only';
    el.textContent=text;
    document.body.appendChild(el);
    setTimeout(function(){el.remove()},3000);
  }

  /* Update card countdown + pulse when still endangered */
  function updateCard(card,newDecay){
    card.dataset.decayFactor=newDecay.toFixed(4);
    var el=card.querySelector('.endangered-countdown');
    if(el){
      el.textContent=label(newDecay);
      el.setAttribute('aria-live','polite');
    }
    card.style.setProperty('--endangered-pulse-speed',tierSpeed(newDecay));
  }

  /* Fade the whole band when no cards remain */
  function dismissBand(){
    if(rm){
      if(band.parentNode)band.parentNode.removeChild(band);
      return;
    }
    band.classList.add('band--emptying');
    setTimeout(function(){
      if(band.parentNode)band.parentNode.removeChild(band);
    },500);
  }

  /* Multi-phase exit: bloom -> fade -> collapse -> remove */
  function dismissCard(card,title){
    if(card.dataset.dismissing)return;
    card.dataset.dismissing='1';

    if(rm){
      if(card.parentNode)card.parentNode.removeChild(card);
      announce(title+' has been revived');
      checkEmpty();
      return;
    }

    card.setAttribute('role','status');

    /* Phase 1: bloom flash */
    card.classList.add('revived-bloom');
    setTimeout(function(){

      /* Phase 2: opacity fade-out */
      card.classList.remove('revived-bloom');
      card.classList.add('revived-fade');
      setTimeout(function(){

        /* Phase 3: height collapse */
        animateCollapse(card,COLLAPSE_MS,'ease-out',function(){
          if(card.parentNode)card.parentNode.removeChild(card);
          announce(title+' has been revived');
          checkEmpty();
        });

      },FADE_MS);
    },BLOOM_MS);
  }

  function checkEmpty(){
    var cards=band.querySelectorAll('.endangered-card');
    if(!cards.length)dismissBand();
    else updateBandCount();
  }

  function updateBandCount(){
    var n=band.querySelectorAll('.endangered-card').length;
    band.setAttribute('data-endangered-count',n);
  }

  /* Debounced revival handler — coalesces rapid SSE events */
  function onRevival(slug,decayAfter){
    if(pending[slug])clearTimeout(pending[slug]);
    pending[slug]=setTimeout(function(){
      delete pending[slug];
      var card=band.querySelector('.endangered-card[data-slug="'+slug+'"]');
      if(!card)return;
      var title=card.querySelector('.post-title');
      var name=title?title.textContent:'Post';

      if(typeof decayAfter==='number'&&decayAfter>=ENDAN){
        updateCard(card,decayAfter);
        return;
      }
      dismissCard(card,name);
    },150);
  }

  /* Bind SSE listener to current EventSource */
  function bindES(es){
    if(!es||es===boundES)return;
    boundES=es;
    es.addEventListener('revival',function(e){
      try{
        var d=JSON.parse(e.data);
        if(!d.slug)return;
        onRevival(d.slug,d.decayAfterRevival);
      }catch(ex){}
    });
  }

  /* Poll for __presenceES singleton; re-bind on reconnect */
  function watchES(){
    var es=window.__presenceES;
    if(es&&es!==boundES)bindES(es);
    setTimeout(watchES,2000);
  }

  updateBandCount();
  watchES();
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

  // Client script — multi-phase dismiss
  const script = endangeredClientScript();
  console.assert(script.includes('endangered-card'), 'targets cards');
  console.assert(script.includes('revival'), 'listens for revivals');
  console.assert(script.includes('setInterval'), 'hourly refresh');
  console.assert(script.includes('animateCollapse'), 'has collapse utility');
  console.assert(script.includes('revived-bloom'), 'has bloom phase');
  console.assert(script.includes('revived-fade'), 'has fade phase');
  console.assert(script.includes('decayAfterRevival'), 'reads enriched event');
  console.assert(script.includes('prefers-reduced-motion'), 'respects a11y');
  console.assert(script.includes('band--emptying'), 'band exit animation');
  console.assert(script.includes('watchES'), 'reconnect resilience');

  // animateCollapse snippet is exported
  const collapse = animateCollapseSnippet();
  console.assert(collapse.includes('maxHeight'), 'collapses height');
  console.assert(collapse.includes('transitionend'), 'waits for transition');

  console.log('[endangered] OK — all checks passed');
}

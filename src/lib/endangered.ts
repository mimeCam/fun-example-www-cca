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
import type { DecayStage } from './decay-engine';

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
// Erosion bar helpers — visual life-drain bar (warm amber → danger red)
// ---------------------------------------------------------------------------

/** Maps decay 0.80–0.95 to bar fill percentage: 100% at 0.80, 0% at 0.95. */
export function erosionBarPct(decayFactor: number): number {
  const clamped = Math.min(Math.max(decayFactor, 0.80), 0.95);
  return Math.round((1 - (clamped - 0.80) / 0.15) * 100);
}

/** Maps urgency to HSL hue: warning=38° (amber), critical=18° (terracotta), final=0° (red). */
export function erosionHue(urgency: UrgencyLevel): number {
  return urgency === 'warning' ? 38 : urgency === 'critical' ? 18 : 0;
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
// Endangered Discovery Feed — shared types + sort
// Used by GET /api/endangered and EndangeredFeed.astro
// ---------------------------------------------------------------------------

/** Wire shape for the endangered discovery API. One flat type — no union gymnastics. */
export interface EndangeredPost {
  slug:         string;
  title:        string;
  decay:        number;       // 0–1 float
  daysLeft:     number;       // estimated days until entombment
  urgency:      UrgencyLevel; // 'warning' | 'critical' | 'final'
  revivalCount: number;
  pubDate:      string;       // ISO 8601
  /** Discrete five-stage label — API parity with the UI card.
   *  Always populated by the wire helper; never re-derived at the call site.
   *  See `wireDecayStage` (decay-engine.ts) and `/api/docs` (the contract). */
  decayStage:   DecayStage;
}

/** Rank posts by urgency: soonest death first; break ties by urgency tier (final > critical > warning). */
export function sortByUrgency(posts: EndangeredPost[]): EndangeredPost[] {
  return [...posts].sort((a, b) => {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return urgencyRank(b.urgency) - urgencyRank(a.urgency);
  });
}

function urgencyRank(u: UrgencyLevel): number {
  return u === 'final' ? 2 : u === 'critical' ? 1 : 0;
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
  var HOUR=3600000;
  var BLOOM_MS=200,COLLAPSE_MS=300;
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var band=document.querySelector('.band--endangered');
  if(!band)return;

  var pending={};
  var boundES=null;

  ${animateCollapseSnippet()}

  function tierSpeed(decay){
    if(decay>=0.92)return '0.8s';
    if(decay>=0.85)return '2s';
    return '4s';
  }
  function erosionPct(decay){
    var c=Math.min(Math.max(decay,0.80),0.95);
    return Math.round((1-(c-0.80)/0.15)*100)+'%';
  }
  function erosionHue(decay){
    return (decay>=0.92?0:decay>=0.85?18:38)+'deg';
  }
  function patchErosion(card,decay){
    card.style.setProperty('--erosion-pct',erosionPct(decay));
    card.style.setProperty('--erosion-hue',erosionHue(decay));
  }

  /* Refresh erosion bar vars hourly — ring is SSR-rendered, no text to update */
  function refreshCards(){
    band.querySelectorAll('.endangered-card[data-decay-factor]')
      .forEach(function(card){
        var f=parseFloat(card.dataset.decayFactor);
        if(isNaN(f))return;
        patchErosion(card,f);
      });
  }
  setInterval(refreshCards,HOUR);

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

  /* Update card pulse speed + erosion when still endangered (ring is SSR, no text) */
  function updateCard(card,newDecay){
    card.dataset.decayFactor=newDecay.toFixed(4);
    card.style.setProperty('--endangered-pulse-speed',tierSpeed(newDecay));
    patchErosion(card,newDecay);
  }

  /* Phase 1: bloom flash, then call onDone */
  function bloomCard(card,onDone){
    card.classList.add('revived-bloom');
    setTimeout(function(){card.classList.remove('revived-bloom');onDone();},BLOOM_MS);
  }

  /* Remove card from DOM, announce, check band empty */
  function removeCard(card,title){
    if(card.parentNode)card.parentNode.removeChild(card);
    announce(title+' has been revived');
    checkEmpty();
  }

  /* 2-phase exit: bloom → collapse (fade phase removed, -400ms on mid-range Android) */
  function dismissCard(card,title){
    if(card.dataset.dismissing)return;
    card.dataset.dismissing='1';
    card.setAttribute('role','status');
    if(rm){card.setAttribute('aria-hidden','true');removeCard(card,title);return;}
    bloomCard(card,function(){
      animateCollapse(card,COLLAPSE_MS,'ease-out',function(){removeCard(card,title)});
    });
  }

  /* Show "All beliefs tended" message */
  function showSavedMoment(){
    var sm=band.querySelector('.saved-moment');
    if(sm)sm.classList.add('saved-moment--visible');
  }

  /* Fade-remove the band from layout */
  function removeBand(){
    if(rm){if(band.parentNode)band.parentNode.removeChild(band);return;}
    band.classList.add('band--emptying');
    setTimeout(function(){if(band.parentNode)band.parentNode.removeChild(band)},500);
  }

  /* Show SavedMoment, then remove band after message completes */
  function dismissBand(){
    showSavedMoment();
    setTimeout(removeBand,rm?200:3000);
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
      var name=(card.querySelector('.post-title')||{textContent:'Post'}).textContent;
      typeof decayAfter==='number'&&decayAfter>=ENDAN
        ?updateCard(card,decayAfter)
        :dismissCard(card,name);
    },150);
  }

  /* Bind SSE listener to current EventSource */
  function bindES(es){
    if(!es||es===boundES)return;
    boundES=es;
    es.addEventListener('revival',function(e){
      try{var d=JSON.parse(e.data);if(!d.slug)return;onRevival(d.slug,d.decayAfterRevival);}
      catch(ex){}
    });
  }

  /* Poll for __presenceES singleton; re-bind on reconnect */
  function watchES(){
    var es=window.__presenceES;
    if(es&&es!==boundES)bindES(es);
    setTimeout(watchES,2000);
  }

  updateBandCount();
  refreshCards();
  watchES();
})();`;
}


// ---------------------------------------------------------------------------
// Feed client script — SSE consumer for /endangered page
// Targets canonical EndangeredCard data-* attributes. Zero custom markup.
// ---------------------------------------------------------------------------

/**
 * Client IIFE for EndangeredFeed: SSE consumer + live re-sort.
 * Reuses animateCollapseSnippet() from same module.
 * Targets .endangered-card[data-slug] (canonical card, not custom markup).
 */
export function endangeredFeedScript(): string {
  return `(function(){
  var ENDAN=${ENDANGERED_THRESHOLD};
  var BLOOM_MS=200,COLLAPSE_MS=300;
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var feed=document.getElementById('feed-cards');
  var countEl=document.getElementById('feed-count');
  if(!feed)return;

  ${animateCollapseSnippet()}

  function tierSpeed(decay){
    if(decay>=0.92)return '0.8s';
    if(decay>=0.85)return '2s';
    return '4s';
  }
  function tierUrgency(decay){
    if(decay>=0.92)return 'final';
    if(decay>=0.85)return 'critical';
    return 'warning';
  }
  function erosionPct(decay){
    var c=Math.min(Math.max(decay,0.80),0.95);
    return Math.round((1-(c-0.80)/0.15)*100)+'%';
  }
  function erosionHue(decay){
    return (decay>=0.92?0:decay>=0.85?18:38)+'deg';
  }

  /* Screen-reader announcement */
  function announce(text){
    var el=document.createElement('div');
    el.setAttribute('role','status');
    el.setAttribute('aria-live','assertive');
    el.className='sr-only';
    el.textContent=text;
    document.body.appendChild(el);
    setTimeout(function(){el.remove()},3000);
  }

  /* Phase 1: bloom flash */
  function bloomCard(card,onDone){
    card.classList.add('revived-bloom');
    setTimeout(function(){
      card.classList.remove('revived-bloom');
      onDone();
    },BLOOM_MS);
  }

  /* Remove wrap from DOM + announce */
  function removeWrap(wrap,title){
    if(wrap.parentNode)wrap.parentNode.removeChild(wrap);
    announce(title+' has been revived');
    updateCount();
  }

  /* 2-phase dismiss: bloom → collapse */
  function dismissWrap(wrap){
    if(wrap.dataset.dismissing)return;
    wrap.dataset.dismissing='1';
    var card=wrap.querySelector('.endangered-card');
    var title=card?(card.querySelector('.post-title')||{}).textContent||'Post':'Post';
    if(!card){removeWrap(wrap,title);return;}
    if(rm){removeWrap(wrap,title);return;}
    bloomCard(card,function(){
      animateCollapse(wrap,COLLAPSE_MS,'ease-out',function(){
        removeWrap(wrap,title);
      });
    });
  }

  /* Update count label from remaining wraps */
  function updateCount(){
    if(!countEl)return;
    var n=feed.querySelectorAll('.feed-card-wrap:not([data-dismissing])').length;
    countEl.textContent=n+' '+(n===1?'post':'posts')+' at risk';
    if(n===0){
      var empty=document.getElementById('feed-empty');
      if(empty)empty.removeAttribute('hidden');
    }
  }

  /* Update card data attrs from SSE payload */
  function patchCard(wrap,post,order){
    wrap.style.order=order;
    var card=wrap.querySelector('.endangered-card');
    if(!card)return;
    card.dataset.decayFactor=post.decay.toFixed(4);
    card.dataset.revivalCount=String(post.revivalCount);
    card.dataset.urgency=post.urgency;
    card.style.setProperty('--endangered-pulse-speed',tierSpeed(post.decay));
    card.style.setProperty('--erosion-pct',erosionPct(post.decay));
    card.style.setProperty('--erosion-hue',erosionHue(post.decay));
  }

  /* Process full SSE snapshot */
  function updateFeed(posts){
    var seen={};
    posts.forEach(function(post,i){
      seen[post.slug]=true;
      var wrap=feed.querySelector('.feed-card-wrap[data-slug="'+post.slug+'"]');
      if(!wrap)return;
      patchCard(wrap,post,i);
    });
    /* Dismiss cards no longer in snapshot */
    var wraps=feed.querySelectorAll('.feed-card-wrap:not([data-dismissing])');
    for(var j=0;j<wraps.length;j++){
      if(!seen[wraps[j].dataset.slug])dismissWrap(wraps[j]);
    }
    updateCount();
  }

  /* SSE connection */
  var es=new EventSource('/api/endangered-sse');
  es.onmessage=function(e){
    try{
      var posts=JSON.parse(e.data);
      if(!Array.isArray(posts))return;
      updateFeed(posts);
    }catch(ex){}
  };
  es.onerror=function(){};
  window.addEventListener('unload',function(){es.close()});
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

  // erosionBarPct — 100% at 0.80, 0% at 0.95, clamped
  console.assert(erosionBarPct(0.80) === 100, 'erosionBarPct 0.80 = 100');
  console.assert(erosionBarPct(0.875) === 50, 'erosionBarPct 0.875 = 50');
  console.assert(erosionBarPct(0.95) === 0,  'erosionBarPct 0.95 = 0');
  console.assert(erosionBarPct(0.70) === 100, 'erosionBarPct clamp low = 100');
  console.assert(erosionBarPct(0.99) === 0,   'erosionBarPct clamp high = 0');

  // erosionHue — amber/terracotta/red by urgency tier
  console.assert(erosionHue('warning')  === 38, 'warning hue = 38');
  console.assert(erosionHue('critical') === 18, 'critical hue = 18');
  console.assert(erosionHue('final')    === 0,  'final hue = 0');

  // Client script — 2-phase dismiss (no revived-fade)
  const script = endangeredClientScript();
  console.assert(script.includes('endangered-card'), 'targets cards');
  console.assert(script.includes('revival'), 'listens for revivals');
  console.assert(script.includes('setInterval'), 'hourly refresh');
  console.assert(script.includes('animateCollapse'), 'has collapse utility');
  console.assert(script.includes('revived-bloom'), 'has bloom phase');
  console.assert(!script.includes('revived-fade'), 'fade phase removed (2-phase)');
  console.assert(script.includes('decayAfterRevival'), 'reads enriched event');
  console.assert(script.includes('prefers-reduced-motion'), 'respects a11y');
  console.assert(script.includes('band--emptying'), 'band exit animation');
  console.assert(script.includes('watchES'), 'reconnect resilience');
  console.assert(script.includes('saved-moment'), 'wires SavedMoment');
  console.assert(script.includes('erosionPct'), 'updates erosion bar pct');
  console.assert(script.includes('erosionHue'), 'updates erosion bar hue');

  // animateCollapse snippet is exported
  const collapse = animateCollapseSnippet();
  console.assert(collapse.includes('maxHeight'), 'collapses height');
  console.assert(collapse.includes('transitionend'), 'waits for transition');

  // Feed client script — SSE consumer for /endangered page
  const feedScript = endangeredFeedScript();
  console.assert(feedScript.includes('endangered-card'), 'feed targets cards');
  console.assert(feedScript.includes('feed-cards'), 'feed targets container');
  console.assert(feedScript.includes('endangered-sse'), 'feed opens SSE');
  console.assert(feedScript.includes('animateCollapse'), 'feed has collapse');
  console.assert(feedScript.includes('revived-bloom'), 'feed has bloom phase');
  console.assert(feedScript.includes('prefers-reduced-motion'), 'feed a11y');
  console.assert(feedScript.includes('announce'), 'feed announces removals');
  console.assert(feedScript.includes('erosionPct'), 'feed updates erosion');
  console.assert(feedScript.includes('data-slug'), 'feed targets by slug');
  console.assert(!feedScript.includes('feed-card-urgency-bar'), 'no legacy markup');
  console.assert(!feedScript.includes('urgency-chip'), 'no legacy chips');

  console.log('[endangered] OK — all checks passed');
}

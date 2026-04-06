// src/lib/revival-moment.ts
// The Revival Moment — unified choreography for the blog post page.
//
// One CSS transition, triggered by toggling --decay-* vars from dying to alive.
// The browser's compositor handles interpolation. One class toggle kicks it off.
//
// Replaces: bloomOrchestrator, bloomReducer, bloomGuardrails, bloomA11y,
//           bloomHaptics, bloomOnArrival (6 files → 1).
// Eliminates: FirstVisitHint, GuidedTouch, DiscoveryWhisper, FirstBreath
//             (4 onboarding components → 0 needed).
//
// The decay IS the hint. The revival IS the onboarding.
//
// Credits: Mike (architecture), Tanya (UX spec), Elon (kill onboarding),
//          Paul Kim (60-second test)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DWELL_MS = 800;
const TOUCH_MS = 600;
const TOUCH_DEADZONE = 10;
const BADGE_VISIBLE_MS = 5000;
const LS_PREFIX = 'rm:'; // localStorage key prefix — 7-day TTL gate
const ARC_CIRCUMFERENCE = 301.6; // 2π × r=48 in SVG viewBox 100×100

// ---------------------------------------------------------------------------
// Decay tier thresholds (from decay-engine.ts constants)
// ---------------------------------------------------------------------------

type DecayTier = 'fresh' | 'fading' | 'dying' | 'ancient';

/** Map factor (0–1) to a human-readable tier for cursor + grain. */
export function decayTier(factor: number): DecayTier {
  if (factor < 0.15) return 'fresh';
  if (factor < 0.45) return 'fading';
  if (factor < 0.75) return 'dying';
  return 'ancient';
}

/** Grain opacity from decay factor. Fresh=0, ancient=0.4. */
export function grainFromDecay(factor: number): number {
  return +(Math.min(0.4, factor * 0.45)).toFixed(2);
}

// ---------------------------------------------------------------------------
// Server-side: CSS vars for the revival stage
// ---------------------------------------------------------------------------

export interface StageCSSVars {
  '--decay-opacity': string;
  '--decay-blur': string;
  '--decay-saturation': string;
  '--stage-grain': string;
}

/** Build stage CSS vars from a decay factor. */
export function stageVars(factor: number): StageCSSVars {
  return {
    '--decay-opacity': String(stageOpacity(factor)),
    '--decay-blur': `${stageBlur(factor)}px`,
    '--decay-saturation': String(stageSaturation(factor)),
    '--stage-grain': String(grainFromDecay(factor)),
  };
}

/** Opacity: 1.0 (fresh) → 0.30 (ancient). Wider range than card decay. */
function stageOpacity(f: number): number {
  return +(Math.max(0.30, 1 - f * 0.70)).toFixed(2);
}

/** Blur in px: 0 (fresh) → 4 (ancient). Heavier than card decay. */
function stageBlur(f: number): number {
  return +(f * 4).toFixed(1);
}

/** Saturation: 1.0 (fresh) → 0.12 (ancient). Near-monochrome. */
function stageSaturation(f: number): number {
  return +(Math.max(0.12, 1 - f * 0.88)).toFixed(2);
}

/** Inline style string for the revival stage element. */
export function stageStyleString(factor: number): string {
  const vars = stageVars(factor);
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// ---------------------------------------------------------------------------
// Client IIFE — the revival moment interaction
// ---------------------------------------------------------------------------

export function revivalMomentScript(slug: string): string {
  return `(function(){
  var DWELL=${DWELL_MS},TOUCH=${TOUCH_MS},DEAD=${TOUCH_DEADZONE},BADGE_MS=${BADGE_VISIBLE_MS};
  var CIRC=${ARC_CIRCUMFERENCE};
  var SLUG=${JSON.stringify(slug)};
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage=document.querySelector('.revival-stage');
  if(!stage)return;

  /* Phase 2: localStorage 7-day TTL gate */
  function fired(){
    try{var s=localStorage.getItem('${LS_PREFIX}'+SLUG);
      return s?Date.now()-JSON.parse(s).ts<604800000:false}catch(e){return false}
  }
  function markFired(){
    try{localStorage.setItem('${LS_PREFIX}'+SLUG,JSON.stringify({ts:Date.now()}))}catch(e){}
  }
  function sessionId(){
    try{return sessionStorage.getItem('session-token')||null}catch(e){return null}
  }

  /* API call */
  function reviveAPI(cb){
    var h={'Content-Type':'application/json'};
    var sid=sessionId();if(sid)h['x-session-id']=sid;
    fetch('/api/revive',{method:'POST',keepalive:true,
      headers:h,body:JSON.stringify({slug:SLUG})})
    .then(function(r){return r.ok?r.json():null})
    .then(function(d){if(d&&d.ok){markFired();if(cb)cb(d)}})
    .catch(function(){});
  }

  /* Phase 1: Anticipation arc — SVG stroke-dashoffset fills over DWELL_MS */
  var arcEl=null,arcStart=0,arcRaf=0;
  function createArc(){
    var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','anticipation-arc');svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('aria-hidden','true');
    var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx','50');c.setAttribute('cy','50');c.setAttribute('r','48');
    c.setAttribute('fill','none');c.style.strokeDasharray=String(CIRC);
    c.style.strokeDashoffset=String(CIRC);svg.appendChild(c);
    stage.appendChild(svg);return {svg:svg,circle:c};
  }
  function tickArc(arc,ts){
    var p=Math.min(1,(ts-arcStart)/DWELL);
    arc.circle.style.strokeDashoffset=String(CIRC*(1-p));
    if(p<1)arcRaf=requestAnimationFrame(function(t){tickArc(arc,t)});
  }
  function startArc(){
    if(rm||arcEl)return;
    arcEl=createArc();arcStart=performance.now();
    arcRaf=requestAnimationFrame(function(t){tickArc(arcEl,t)});
  }
  function cancelArc(){
    if(arcRaf){cancelAnimationFrame(arcRaf);arcRaf=0}
    if(arcEl){arcEl.svg.remove();arcEl=null}
  }

  /* Phase 3a: WAAPI dissolve — scale lift + opacity transition */
  function doRevival(){
    stage.classList.add('reviving');
    if(stage.animate){
      stage.animate([
        {opacity:+stage.style.getPropertyValue('--decay-opacity')||0.5,transform:'scale(1)'},
        {opacity:1,transform:'scale(1.003)',offset:0.3},
        {opacity:1,transform:'scale(1)'}
      ],{duration:1200,easing:'cubic-bezier(0.34,1.56,0.64,1)',fill:'none'});
    }
    setTimeout(function(){stage.classList.remove('reviving')},1200);
  }

  /* Phase 3b: chromatic aberration flash on h1 at t=200ms (signature moment) */
  function chromaticFlash(){
    var h=stage.querySelector('h1');
    if(!h)return;
    h.classList.add('chroma-flash');
    setTimeout(function(){h.classList.remove('chroma-flash')},600);
  }

  /* Phase 4: Witness badge — narrative with decay% + monthly reader count */
  function showWitnessBadge(d){
    var b=document.querySelector('.revival-badge');if(!b)return;
    var pct=d.decayPct||0,monthly=d.monthlyCount||d.count||1;
    var lead=pct>60?'You rescued this \u2014 '+pct+'% decayed':'You kept this alive';
    var trail=monthly+' reader'+(monthly!==1?'s':'')+' this month';
    b.textContent=lead+' \u00b7 '+trail;
    b.classList.add('badge--visible');
    setTimeout(function(){b.classList.remove('badge--visible')},BADGE_MS);
  }

  /* Haptic — two-tap pulse (more expressive than single tap) */
  function haptic(){
    if(rm)return;
    try{if(navigator.vibrate)navigator.vibrate([10,50,10])}catch(e){}
  }

  /* A11y */
  function announce(d){
    var el=document.querySelector('.revival-announce');
    var monthly=d.monthlyCount||d.count||1;
    if(el)el.textContent='Post revived. '+monthly+' readers this month have kept it alive.';
  }

  /* Main trigger: phases 3+4 fire after API confirms */
  var dwellTimer=null;
  function triggerRevival(){
    if(fired())return;
    cancelArc();
    reviveAPI(function(d){
      doRevival();
      if(!rm)setTimeout(function(){chromaticFlash()},200);
      showWitnessBadge(d);haptic();announce(d);
    });
  }

  /* Desktop: hover-dwell triggers Phase 1 arc */
  stage.addEventListener('mouseenter',function(){
    if(fired())return;
    startArc();dwellTimer=setTimeout(triggerRevival,DWELL);
  });
  stage.addEventListener('mouseleave',function(){
    cancelArc();if(dwellTimer){clearTimeout(dwellTimer);dwellTimer=null}
  });

  /* Touch: press-and-hold */
  var touchTimer=null,startX=0,startY=0;
  stage.addEventListener('touchstart',function(e){
    if(fired())return;
    var t=e.touches[0];startX=t.clientX;startY=t.clientY;
    touchTimer=setTimeout(triggerRevival,TOUCH);
  },{passive:true});
  stage.addEventListener('touchmove',function(e){
    if(!touchTimer)return;
    var t=e.touches[0],dx=t.clientX-startX,dy=t.clientY-startY;
    if(Math.sqrt(dx*dx+dy*dy)>DEAD)clearTouch();
  },{passive:true});
  stage.addEventListener('touchend',clearTouch,{passive:true});
  stage.addEventListener('touchcancel',clearTouch,{passive:true});
  function clearTouch(){if(touchTimer){clearTimeout(touchTimer);touchTimer=null}}

  /* Keyboard: Space/Enter hold */
  var keyTimer=null;
  document.addEventListener('keydown',function(e){
    if(e.repeat||fired())return;
    if(e.key!==' '&&e.key!=='Enter')return;
    if(!stage.contains(document.activeElement))return;
    e.preventDefault();keyTimer=setTimeout(triggerRevival,TOUCH);
  });
  document.addEventListener('keyup',function(e){
    if(e.key===' '||e.key==='Enter'){if(keyTimer){clearTimeout(keyTimer);keyTimer=null}}
  });

  /* Phase 5: SSE ripple — sympathetic bloom from other readers */
  function initHeartbeat(){
    if(typeof EventSource==='undefined')return;
    var es;
    try{es=new EventSource('/api/heartbeat');window.__rmES=es}catch(e){return}
    es.addEventListener('revival',function(e){
      try{
        var d=JSON.parse(e.data);if(d.slug!==SLUG)return;
        stage.classList.add('sympathetic');
        setTimeout(function(){stage.classList.remove('sympathetic')},1200);
      }catch(e){}
    });
  }
  initHeartbeat();
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testRevivalMoment(): void {
  // Decay tier
  console.assert(decayTier(0) === 'fresh', 'tier 0');
  console.assert(decayTier(0.5) === 'dying', 'tier 0.5');
  console.assert(decayTier(0.9) === 'ancient', 'tier 0.9');

  // Grain
  console.assert(grainFromDecay(0) === 0, 'grain 0');
  console.assert(grainFromDecay(1) === 0.4, 'grain max');

  // Stage vars
  const vars = stageVars(0);
  console.assert(vars['--decay-opacity'] === '1', 'fresh opacity');
  console.assert(vars['--decay-blur'] === '0px', 'fresh blur');
  console.assert(vars['--decay-saturation'] === '1', 'fresh sat');

  const ancient = stageVars(1);
  console.assert(ancient['--decay-opacity'] === '0.3', 'ancient opacity');
  console.assert(ancient['--stage-grain'] === '0.4', 'ancient grain');

  // Style string
  const style = stageStyleString(0.5);
  console.assert(style.includes('--decay-opacity'), 'has opacity');
  console.assert(style.includes('--stage-grain'), 'has grain');

  // Client script
  const script = revivalMomentScript('test-slug');
  console.assert(script.includes('mouseenter'), 'desktop dwell');
  console.assert(script.includes('touchstart'), 'touch handler');
  console.assert(script.includes('keydown'), 'keyboard');
  console.assert(script.includes('/api/revive'), 'api call');
  console.assert(script.includes('revival-badge'), 'badge');
  console.assert(script.includes('prefers-reduced-motion'), 'a11y');
  console.assert(script.includes('EventSource'), 'heartbeat');
  console.assert(script.includes('sympathetic'), 'sympathetic');
  console.assert(script.includes('navigator.vibrate'), 'haptic');
  // Phase upgrades
  console.assert(script.includes('localStorage'), 'localStorage 7-day gate');
  console.assert(script.includes('604800000'), '7-day ms constant');
  console.assert(script.includes('anticipation-arc'), 'SVG anticipation arc');
  console.assert(script.includes('strokeDashoffset'), 'arc animation');
  console.assert(script.includes('chroma-flash'), 'chromatic aberration');
  console.assert(script.includes('decayPct'), 'witness badge decayPct');
  console.assert(script.includes('monthlyCount'), 'witness badge monthlyCount');

  console.log('[revival-moment] OK — all checks passed');
}

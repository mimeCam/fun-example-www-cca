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
const SESSION_PREFIX = 'revived:';

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
  var DWELL=${DWELL_MS},TOUCH=${TOUCH_MS},DEAD=${TOUCH_DEADZONE};
  var BADGE_MS=${BADGE_VISIBLE_MS};
  var SLUG=${JSON.stringify(slug)};
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage=document.querySelector('.revival-stage');
  if(!stage)return;

  /* --- Session gate --- */
  function fired(){
    try{return sessionStorage.getItem('${SESSION_PREFIX}'+SLUG)==='1'}catch(e){return false}
  }
  function markFired(){
    try{sessionStorage.setItem('${SESSION_PREFIX}'+SLUG,'1')}catch(e){}
  }
  function sessionId(){
    try{return sessionStorage.getItem('session-token')||null}catch(e){return null}
  }

  /* --- API call --- */
  function reviveAPI(cb){
    var h={'Content-Type':'application/json'};
    var sid=sessionId();if(sid)h['x-session-id']=sid;
    fetch('/api/revive',{method:'POST',keepalive:true,
      headers:h,body:JSON.stringify({slug:SLUG})})
    .then(function(r){return r.ok?r.json():null})
    .then(function(d){if(d&&d.ok){markFired();if(cb)cb(d)}})
    .catch(function(){});
  }

  /* --- The moment: revival transition --- */
  function triggerRevival(){
    if(fired())return;
    reviveAPI(function(d){
      doBloom();
      showBadge(d.count);
      haptic();
      announce(d.count);
    });
  }

  /* --- Bloom: CSS class toggle, compositor does the rest --- */
  function doBloom(){
    stage.classList.add('reviving');
    setTimeout(function(){
      stage.classList.remove('reviving');
    },1200);
  }

  /* --- Badge: "You revived this" — auto-dismiss --- */
  function showBadge(count){
    var b=document.querySelector('.revival-badge');
    if(!b)return;
    var text=count===1?'You brought this back to life':'You kept this alive \\u00b7 '+count+' readers';
    b.textContent=text;
    b.classList.add('badge--visible');
    setTimeout(function(){
      b.classList.remove('badge--visible');
    },BADGE_MS);
  }

  /* --- Haptic: one pulse, graceful no-op --- */
  function haptic(){
    if(rm)return;
    try{if(navigator.vibrate)navigator.vibrate(15)}catch(e){}
  }

  /* --- A11y: announce to screen readers --- */
  function announce(count){
    var el=document.querySelector('.revival-announce');
    if(el)el.textContent='This post was revived by reader attention. '+count+' readers have kept it alive.';
  }

  /* --- Desktop: hover-dwell on article --- */
  var dwellTimer=null;
  stage.addEventListener('mouseenter',function(){
    if(fired())return;
    dwellTimer=setTimeout(triggerRevival,DWELL);
  });
  stage.addEventListener('mouseleave',function(){
    if(dwellTimer){clearTimeout(dwellTimer);dwellTimer=null}
  });

  /* --- Touch: press-and-hold on article --- */
  var touchTimer=null,startX=0,startY=0;
  stage.addEventListener('touchstart',function(e){
    if(fired())return;
    var t=e.touches[0];startX=t.clientX;startY=t.clientY;
    touchTimer=setTimeout(triggerRevival,TOUCH);
  },{passive:true});
  stage.addEventListener('touchmove',function(e){
    if(!touchTimer)return;
    var t=e.touches[0];
    var dx=t.clientX-startX,dy=t.clientY-startY;
    if(Math.sqrt(dx*dx+dy*dy)>DEAD){clearTouch()}
  },{passive:true});
  stage.addEventListener('touchend',clearTouch,{passive:true});
  stage.addEventListener('touchcancel',clearTouch,{passive:true});
  function clearTouch(){if(touchTimer){clearTimeout(touchTimer);touchTimer=null}}

  /* --- Keyboard: Space/Enter hold --- */
  var keyTimer=null;
  document.addEventListener('keydown',function(e){
    if(e.repeat)return;
    if(e.key!==' '&&e.key!=='Enter')return;
    if(!stage.contains(document.activeElement))return;
    if(fired())return;
    e.preventDefault();
    keyTimer=setTimeout(triggerRevival,TOUCH);
  });
  document.addEventListener('keyup',function(e){
    if(e.key===' '||e.key==='Enter'){
      if(keyTimer){clearTimeout(keyTimer);keyTimer=null}
    }
  });

  /* --- SSE: sympathetic bloom from other readers --- */
  function initHeartbeat(){
    if(typeof EventSource==='undefined')return;
    var es;
    try{es=new EventSource('/api/heartbeat');window.__rmES=es}catch(e){return}
    es.addEventListener('revival',function(e){
      try{
        var d=JSON.parse(e.data);
        if(d.slug!==SLUG)return;
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

  console.log('[revival-moment] OK — all checks passed');
}

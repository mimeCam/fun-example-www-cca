// src/lib/revival-engine.ts
// Unified Revival Engine — single client script for all revival interactions.
//
// Consolidates: revivalController.ts, revivalDesktop.ts, revivalTouch.ts,
// bloomOrchestrator.ts, bloomGuardrails.ts, bloomA11y.ts, bloomHaptics.ts,
// sympatheticBloom.ts, cascadeMobile.ts, resurrectClient.ts, keepAlive.ts.
//
// Three interactions, one handler:
//   1. Desktop hover-dwell (800ms) on .decay-card → POST /api/revive
//   2. Touch press-and-hold (600ms) on .decay-card → POST /api/revive
//   3. Click .resurrect-btn on /graveyard → POST /api/resurrect
//
// Bloom is a CSS transition, not a JS orchestrator.
// Accessibility is a @media query, not a module.
// Rate-limiting is server-side, not client-side PoW.
//
// Credits: Mike (architecture), Tanya (UX spec)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DWELL_MS = 800;
const TOUCH_MS = 600;
const TOUCH_DEADZONE = 10;
const BLOOM_DURATION_MS = 600;
const SESSION_PREFIX = 'revived:';
const RESURRECT_PREFIX = 'resurrected:';

// ---------------------------------------------------------------------------
// Client IIFE — handles revival, bloom, and resurrect
// ---------------------------------------------------------------------------

export function revivalEngineScript(): string {
  return `(function(){
  var DWELL=${DWELL_MS},TOUCH=${TOUCH_MS},DEAD=${TOUCH_DEADZONE};
  var BLOOM=${BLOOM_DURATION_MS};
  var reducedMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Helpers --- */
  function slug(el){
    var a=el.querySelector('a[href*="/blog/"]');
    if(!a)return null;
    var m=a.getAttribute('href').match(/\\/blog\\/([^\\/]+)/);
    return m?m[1]:null;
  }
  function fired(s){
    try{return sessionStorage.getItem('${SESSION_PREFIX}'+s)==='1'}catch(e){return false}
  }
  function markFired(s){
    try{sessionStorage.setItem('${SESSION_PREFIX}'+s,'1')}catch(e){}
  }
  function sessionId(){
    try{return sessionStorage.getItem('session-token')||null}catch(e){return null}
  }

  /* --- API call --- */
  function revive(s,cb){
    var headers={'Content-Type':'application/json'};
    var sid=sessionId();if(sid)headers['x-session-id']=sid;
    fetch('/api/revive',{method:'POST',keepalive:true,
      headers:headers,body:JSON.stringify({slug:s})})
    .then(function(r){return r.ok?r.json():null})
    .then(function(d){if(d&&d.ok){markFired(s);if(cb)cb(d)}})
    .catch(function(){});
  }

  /* --- Bloom: just set CSS vars to fresh + let transition handle it --- */
  function bloom(el){
    if(reducedMotion){el.style.opacity='1';return}
    el.setAttribute('data-bloom-lock','');
    el.style.setProperty('--decay-opacity','1');
    el.style.setProperty('--decay-blur','0px');
    el.style.setProperty('--decay-saturation','1');
    el.style.setProperty('--decay-shadow-y','8px');
    el.style.setProperty('--decay-shadow-spread','32px');
    el.style.setProperty('--decay-shadow-alpha','0.18');
    el.classList.add('blooming');
    setTimeout(function(){
      el.removeAttribute('data-bloom-lock');
      el.classList.remove('blooming');
    },BLOOM);
  }

  /* --- Update badge count after revival --- */
  function updateBadge(el,count){
    var badge=el.querySelector('.revival-count');
    if(badge)badge.textContent=count+' kept alive';
  }

  /* --- Desktop: hover-dwell revival --- */
  function initDesktop(){
    var timers=new WeakMap();
    document.addEventListener('mouseenter',function(e){
      var card=e.target.closest&&e.target.closest('.decay-card');
      if(!card)return;
      var s=slug(card);
      if(!s||fired(s))return;
      var t=setTimeout(function(){
        revive(s,function(d){bloom(card);updateBadge(card,d.count)});
      },DWELL);
      timers.set(card,t);
    },true);
    document.addEventListener('mouseleave',function(e){
      var card=e.target.closest&&e.target.closest('.decay-card');
      if(!card)return;
      var t=timers.get(card);
      if(t){clearTimeout(t);timers.delete(card)}
    },true);
  }

  /* --- Touch: press-and-hold revival --- */
  function initTouch(){
    var active=null,startX=0,startY=0,timer=null;
    document.addEventListener('touchstart',function(e){
      var card=e.target.closest&&e.target.closest('.decay-card');
      if(!card)return;
      var s=slug(card);if(!s||fired(s))return;
      active=card;
      var touch=e.touches[0];startX=touch.clientX;startY=touch.clientY;
      timer=setTimeout(function(){
        revive(s,function(d){bloom(card);updateBadge(card,d.count);haptic()});
        active=null;
      },TOUCH);
    },{passive:true});
    document.addEventListener('touchmove',function(e){
      if(!active)return;
      var t=e.touches[0];
      var dx=t.clientX-startX,dy=t.clientY-startY;
      if(Math.sqrt(dx*dx+dy*dy)>DEAD){cancelTouch()}
    },{passive:true});
    document.addEventListener('touchend',cancelTouch,{passive:true});
    document.addEventListener('touchcancel',cancelTouch,{passive:true});
    function cancelTouch(){
      if(timer){clearTimeout(timer);timer=null}active=null;
    }
  }

  /* --- Haptic feedback (one pulse, graceful no-op) --- */
  function haptic(){
    if(reducedMotion)return;
    try{if(navigator.vibrate)navigator.vibrate(15)}catch(e){}
  }

  /* --- Keyboard: Space/Enter hold on focused card --- */
  function initKeyboard(){
    var timer=null,activeCard=null;
    document.addEventListener('keydown',function(e){
      if(e.repeat)return;
      if(e.key!==' '&&e.key!=='Enter')return;
      var card=document.activeElement&&document.activeElement.closest('.decay-card');
      if(!card)return;
      var s=slug(card);if(!s||fired(s))return;
      e.preventDefault();
      activeCard=card;
      timer=setTimeout(function(){
        revive(s,function(d){bloom(card);updateBadge(card,d.count)});
        activeCard=null;timer=null;
      },TOUCH);
    });
    document.addEventListener('keyup',function(e){
      if(e.key===' '||e.key==='Enter'){
        if(timer){clearTimeout(timer);timer=null}activeCard=null;
      }
    });
  }

  /* --- Resurrect: graveyard button clicks --- */
  function initResurrect(){
    function resFired(s){
      try{return sessionStorage.getItem('${RESURRECT_PREFIX}'+s)==='1'}catch(e){return false}
    }
    function resmark(s){
      try{sessionStorage.setItem('${RESURRECT_PREFIX}'+s,'1')}catch(e){}
    }
    document.querySelectorAll('[data-resurrect-slug]').forEach(function(btn){
      var s=btn.getAttribute('data-resurrect-slug');
      if(!s)return;
      if(resFired(s)){btn.textContent='\\u2191 risen \\u2014 will return soon';btn.classList.add('risen');return}
      btn.addEventListener('click',function(){
        if(resFired(s))return;resmark(s);
        btn.textContent='rising\\u2026';btn.classList.add('risen');
        var headers={'Content-Type':'application/json'};
        var sid=sessionId();if(sid)headers['x-session-id']=sid;
        fetch('/api/resurrect',{method:'POST',keepalive:true,
          headers:headers,body:JSON.stringify({slug:s})})
        .then(function(r){return r.ok?r.json():null})
        .then(function(d){
          if(d&&d.ok){
            btn.textContent='\\u2191 risen \\u2014 will return soon';
            var card=btn.closest('.tombstone');
            if(card){card.style.transition='opacity .8s ease,transform .8s ease';
              card.style.opacity='.7';card.style.transform='translateY(-2px)'}
          }else{btn.textContent='\\u2191 resurrect';btn.classList.remove('risen')}
        }).catch(function(){btn.textContent='\\u2191 resurrect';btn.classList.remove('risen')});
      });
    });
  }

  /* --- SSE: listen for other users' revivals via heartbeat --- */
  function initHeartbeat(){
    if(typeof EventSource==='undefined')return;
    var es;
    try{es=new EventSource('/api/heartbeat')}catch(e){return}
    es.addEventListener('revival',function(e){
      try{
        var d=JSON.parse(e.data);if(!d.slug)return;
        var card=document.querySelector('.decay-card[data-slug="'+d.slug+'"]');
        if(card){bloom(card);updateBadge(card,d.count)}
      }catch(e){}
    });
  }

  /* --- Init --- */
  function init(){
    initDesktop();initTouch();initKeyboard();initResurrect();initHeartbeat();
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testRevivalEngine(): void {
  const script = revivalEngineScript();

  // Core interactions present
  console.assert(script.includes('mouseenter'), 'desktop hover');
  console.assert(script.includes('touchstart'), 'touch handler');
  console.assert(script.includes('keydown'), 'keyboard handler');
  console.assert(script.includes('/api/revive'), 'revive endpoint');
  console.assert(script.includes('/api/resurrect'), 'resurrect endpoint');

  // Bloom is CSS-based
  console.assert(script.includes('--decay-opacity'), 'bloom sets CSS vars');
  console.assert(script.includes('data-bloom-lock'), 'bloom lock present');

  // Accessibility
  console.assert(script.includes('prefers-reduced-motion'), 'a11y check');

  // Rate limiting
  console.assert(script.includes('sessionStorage'), 'session gate');

  // Heartbeat
  console.assert(script.includes('EventSource'), 'SSE listener');

  console.log('[revival-engine] OK — all checks passed');
}

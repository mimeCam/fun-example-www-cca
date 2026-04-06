// src/lib/revival-engine.ts
// Revival Engine — card-level SSE bloom + graveyard resurrect.
//
// KeepButton (revival-counter.ts) is the SOLE revival signal source.
// This module only handles two things:
//   1. SSE sympathetic bloom on .decay-card when another reader revives
//   2. Click .resurrect-btn on /graveyard → POST /api/resurrect
//
// Hover-dwell and touch press-and-hold are removed per Mike's spec.
// Bloom is a CSS transition, not a JS orchestrator.
//
// Credits: Mike (architecture), Tanya (UX spec)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BLOOM_DURATION_MS = 600;
const SESSION_PREFIX = 'revived:';
const RESURRECT_PREFIX = 'resurrected:';

// ---------------------------------------------------------------------------
// Client IIFE — handles revival, bloom, and resurrect
// ---------------------------------------------------------------------------

export function revivalEngineScript(): string {
  return `(function(){
  var BLOOM=${BLOOM_DURATION_MS};
  var reducedMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Bloom: set CSS vars to fresh, let transition handle it --- */
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

  /* --- Update badge count after SSE revival from another reader --- */
  function updateBadge(el,count){
    var badge=el.querySelector('.revival-count');
    if(badge)badge.textContent=count+' kept alive';
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

  /* --- SSE: sympathetic bloom when another reader revives a card --- */
  function initHeartbeat(){
    if(typeof EventSource==='undefined')return;
    var es;
    var fvhV=parseInt(localStorage.getItem('fvh_visits')||'0',10);
    try{es=new EventSource('/api/heartbeat?fvh='+fvhV);window.__presenceES=es}catch(e){return}
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
    initResurrect();initHeartbeat();
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

  // Hover-dwell and touch interactions must be absent (KeepButton is sole source)
  console.assert(!script.includes('mouseenter'), 'no hover-dwell');
  console.assert(!script.includes('touchstart'), 'no touch press-and-hold');
  console.assert(!script.includes('initDesktop'), 'initDesktop deleted');
  console.assert(!script.includes('initTouch'), 'initTouch deleted');

  // Graveyard resurrect still present
  console.assert(script.includes('/api/resurrect'), 'resurrect endpoint');
  console.assert(!script.includes('/api/revive'), 'no card-level revive');

  // Bloom is CSS-based (for SSE sympathetic bloom)
  console.assert(script.includes('--decay-opacity'), 'bloom sets CSS vars');
  console.assert(script.includes('data-bloom-lock'), 'bloom lock present');
  console.assert(script.includes('prefers-reduced-motion'), 'a11y check');

  // SSE heartbeat still drives sympathetic card bloom
  console.assert(script.includes('EventSource'), 'SSE listener');
  console.assert(script.includes('__presenceES'), 'unified EventSource key');

  console.log('[revival-engine] OK — all checks passed');
}

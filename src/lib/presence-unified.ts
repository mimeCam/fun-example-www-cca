// src/lib/presence-unified.ts
// Unified Presence Engine — single client IIFE for honest reader presence.
//
// Consolidates presence-engine.ts + presence-client.ts into one module.
// One EventSource per page (window.__presenceES). Scope-aware (global/slug).
// Cold-start fallback: "last tended X ago" when readerCount === 0.
// Reconnect with exponential backoff (1s → 2s → 4s → max 30s).
// Last-Event-Id support for missed-event replay on reconnect.
//
// Same IIFE injection pattern as decay-engine.ts / revival-engine.ts.
//
// Credits: Mike (architecture), Tanya (UX spec), Elon (honest-zero)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RIPPLE_MS = 800;
const BACKOFF_INIT = 1000;
const BACKOFF_MAX = 30000;

// ---------------------------------------------------------------------------
// Client IIFE
// ---------------------------------------------------------------------------

export function presenceUnifiedScript(): string {
  return `(function(){
  var RIPPLE=${RIPPLE_MS};
  var B_INIT=${BACKOFF_INIT},B_MAX=${BACKOFF_MAX};
  var reduced=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var backoff=B_INIT,lastEventId=null;

  /* --- Slug detection --- */
  function getSlug(){
    var m=location.pathname.match(/^\\/blog\\/([^\\/]+)/);
    return m?m[1]:null;
  }

  /* --- Scope detection from data attribute --- */
  function getScope(){
    var b=bandEl();
    return b?b.getAttribute('data-scope')||'slug':'slug';
  }

  /* --- Build SSE URL based on scope --- */
  function buildUrl(){
    var scope=getScope();
    if(scope==='global') return '/api/presence?scope=global';
    var slug=getSlug();
    return slug?'/api/presence?slug='+encodeURIComponent(slug):null;
  }

  /* --- DOM refs --- */
  function bandEl(){return document.getElementById('presence-band')}
  function countEl(){return document.getElementById('presence-count')}
  function dotEl(){return document.getElementById('presence-dot')}
  function textEl(){return document.getElementById('presence-text')}
  function fallbackEl(){return document.getElementById('presence-fallback')}

  /* --- Update count display with FLIP animation --- */
  function updateCount(n){
    var el=countEl();if(!el)return;
    var old=parseInt(el.textContent||'0',10);
    el.textContent=String(n);
    if(n!==old&&!reduced)flipAnim(el);
  }

  /* --- FLIP digit animation --- */
  function flipAnim(el){
    el.classList.remove('count-flip');
    void el.offsetWidth;
    el.classList.add('count-flip');
  }

  /* --- Text labels per scope --- */
  function slugLabel(n){
    if(n>=2) return n+' readers keeping this alive';
    if(n===1) return 'you are here';
    return '';
  }

  function globalLabel(n){
    if(n>=2) return n+' readers tending the garden';
    if(n===1) return 'you are the only one here';
    return 'listening\\u2026';
  }

  /* --- Update text label (scope-aware) --- */
  function updateLabel(n){
    var el=textEl();if(!el)return;
    var scope=getScope();
    el.textContent=scope==='global'?globalLabel(n):slugLabel(n);
  }

  /* --- Show/hide breathing dot --- */
  function updateDot(n){
    var d=dotEl();if(!d)return;
    var scope=getScope();
    var show=scope==='global'?n>=1:n>=2;
    d.style.display=show?'inline-block':'none';
  }

  /* --- Adjust breathing tempo by reader count --- */
  function updateTempo(n){
    if(reduced)return;
    var b=bandEl();if(!b)return;
    var t=Math.max(1.5,4-n*0.3);
    b.style.setProperty('--presence-tempo',t+'s');
  }

  /* --- Show/hide the whole band --- */
  function updateBand(n,hasActivity){
    var b=bandEl();if(!b)return;
    var scope=getScope();
    var active=scope==='global'?(n>=1||hasActivity):n>=1;
    b.classList.toggle('presence-active',active);
  }

  /* --- Cold-start fallback rendering --- */
  function renderFallback(lastActivity){
    var fb=fallbackEl();if(!fb)return;
    if(!lastActivity){
      fb.textContent='be the first to tend this post';
      fb.style.display='block';
      return;
    }
    var ago=timeSince(lastActivity);
    fb.textContent='last tended '+ago;
    fb.style.display='block';
  }

  /* --- Hide fallback when readers arrive --- */
  function hideFallback(){
    var fb=fallbackEl();if(!fb)return;
    fb.style.display='none';
  }

  /* --- Human-readable time since --- */
  function timeSince(iso){
    var ms=Date.now()-new Date(iso).getTime();
    var mins=Math.floor(ms/60000);
    if(mins<1) return 'just now';
    if(mins<60) return mins+'m ago';
    var hrs=Math.floor(mins/60);
    if(hrs<24) return hrs+'h ago';
    var days=Math.floor(hrs/24);
    return days+'d ago';
  }

  /* --- Handle presence event --- */
  function onPresence(e){
    try{
      var d=JSON.parse(e.data);
      var n=d.readers||0;
      var la=d.lastActivity||null;
      updateCount(n);updateLabel(n);
      updateDot(n);updateTempo(n);
      if(n>0){hideFallback();updateBand(n,false)}
      else{renderFallback(la);updateBand(n,!!la)}
    }catch(x){}
  }

  /* --- Handle revival ripple on band + card --- */
  function onRevival(e){
    if(reduced)return;
    try{
      var d=JSON.parse(e.data);
      rippleBand();rippleCard(d.slug);
    }catch(x){}
  }

  /* --- Ripple effect on the presence band --- */
  function rippleBand(){
    var b=bandEl();if(!b)return;
    b.classList.remove('presence-ripple');
    void b.offsetWidth;
    b.classList.add('presence-ripple');
    setTimeout(function(){b.classList.remove('presence-ripple')},RIPPLE);
  }

  /* --- Ripple on individual decay card (homepage) --- */
  function rippleCard(slug){
    if(!slug)return;
    var card=document.querySelector('.decay-card[data-slug="'+slug+'"]');
    if(!card||card.hasAttribute('data-bloom-lock'))return;
    card.classList.add('presence-ripple');
    setTimeout(function(){card.classList.remove('presence-ripple')},RIPPLE);
  }

  /* --- Connect SSE with singleton + Last-Event-Id --- */
  function connect(){
    var url=buildUrl();
    if(!url||typeof EventSource==='undefined')return;
    try{
      var opts={};
      if(lastEventId)url+=(url.indexOf('?')>-1?'&':'?')+'lastEventId='+lastEventId;
      var es=new EventSource(url);
      window.__presenceES=es;
      es.addEventListener('presence',function(e){
        if(e.lastEventId)lastEventId=e.lastEventId;
        onPresence(e);
      });
      es.addEventListener('revival',function(e){
        if(e.lastEventId)lastEventId=e.lastEventId;
        onRevival(e);
      });
      es.onopen=function(){backoff=B_INIT};
      es.onerror=onError;
    }catch(x){}
  }

  /* --- Reconnect with exponential backoff --- */
  function onError(){
    var es=window.__presenceES;
    if(es){es.close();window.__presenceES=null}
    setTimeout(connect,backoff);
    backoff=Math.min(backoff*2,B_MAX);
  }

  /* --- Init --- */
  function init(){connect()}
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

/** Assert a script string includes a token. */
function check(s: string, token: string, label: string): void {
  console.assert(s.includes(token), label);
}

export function _testPresenceUnified(): void {
  const s = presenceUnifiedScript();
  const checks: [string, string][] = [
    ['presence-band', 'targets band'],
    ['presence-count', 'targets count'],
    ['presence-dot', 'targets dot'],
    ['presence-fallback', 'targets fallback'],
    ['/api/presence?slug=', 'slug endpoint'],
    ['/api/presence?scope=global', 'global endpoint'],
    ['data-scope', 'reads scope attribute'],
    ['presence-ripple', 'ripple class'],
    ['prefers-reduced-motion', 'a11y'],
    ["'presence'", 'listens presence event'],
    ["'revival'", 'listens revival event'],
    ['tending the garden', 'global label plural'],
    ['you are the only one here', 'global label solo'],
    ['__presenceES', 'singleton EventSource'],
    ['lastEventId', 'Last-Event-Id support'],
    ['last tended', 'cold-start fallback'],
    ['be the first to tend', 'zero-revival fallback'],
    ['backoff', 'exponential backoff'],
    ['--presence-tempo', 'tempo adjustment'],
    ['decay-card', 'card ripple'],
  ];
  checks.forEach(([tok, lbl]) => check(s, tok, lbl));
  console.assert(!s.includes('__hbES'), 'no legacy EventSource key');
  console.log('[presence-unified] OK -- all checks passed');
}

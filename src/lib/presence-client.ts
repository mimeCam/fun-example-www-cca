// src/lib/presence-client.ts
// Client IIFE — connects to /api/presence for honest reader count.
// Supports two scopes via data-scope attribute on #presence-band:
//   "slug"   → /api/presence?slug=xxx  (per-post, blog detail)
//   "global" → /api/presence?scope=global (aggregate, homepage)
//
// Renders breathing dot + count in PresenceBand. Ripple on foreign revival.
// No phantoms. Zero readers = zero. That's the point.
//
// Same injection pattern as decay-engine.ts / revival-engine.ts:
// Server TS function returns inline <script> IIFE as string.
//
// Credits: Mike (architecture), Tanya (UX spec), Elon (honest-zero)

const RIPPLE_MS = 800;
const RETRY_WAIT = 3000;
const MAX_RETRIES = 5;

export function presenceClientScript(): string {
  return `(function(){
  var RIPPLE=${RIPPLE_MS},RETRY=${RETRY_WAIT},MAX_RETRIES=${MAX_RETRIES};
  var reduced=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var es=null,retries=0;

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

  /* --- Update count display --- */
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

  /* --- Show/hide the whole band --- */
  function updateBand(n){
    var b=bandEl();if(!b)return;
    var scope=getScope();
    var active=scope==='global'?n>=1:n>=1;
    b.classList.toggle('presence-active',active);
  }

  /* --- Handle presence event --- */
  function onPresence(e){
    try{
      var d=JSON.parse(e.data);
      var n=d.readers||0;
      updateCount(n);updateLabel(n);updateDot(n);updateBand(n);
    }catch(x){}
  }

  /* --- Handle revival ripple --- */
  function onRevival(e){
    if(reduced)return;
    try{
      var d=JSON.parse(e.data);
      ripple(d.slug);
    }catch(x){}
  }

  /* --- Ripple effect on the presence band --- */
  function ripple(slug){
    var b=bandEl();if(!b)return;
    b.classList.remove('presence-ripple');
    void b.offsetWidth;
    b.classList.add('presence-ripple');
    setTimeout(function(){b.classList.remove('presence-ripple')},RIPPLE);
  }

  /* --- Connect SSE (scope-aware) --- */
  function connect(){
    var url=buildUrl();
    if(!url||typeof EventSource==='undefined')return;
    try{
      es=new EventSource(url);
      es.addEventListener('presence',onPresence);
      es.addEventListener('revival',onRevival);
      es.onerror=onError;
      es.onopen=function(){retries=0};
    }catch(x){}
  }

  /* --- Reconnect with backoff --- */
  function onError(){
    if(es)es.close();es=null;
    if(retries<MAX_RETRIES){
      retries++;
      setTimeout(connect,RETRY*retries);
    }
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

export function _testPresenceClient(): void {
  const s = presenceClientScript();
  const checks: [string, string][] = [
    ['presence-band', 'targets band'], ['presence-count', 'targets count'],
    ['presence-dot', 'targets dot'], ['/api/presence?slug=', 'slug endpoint'],
    ['/api/presence?scope=global', 'global endpoint'],
    ['data-scope', 'reads scope attribute'],
    ['presence-ripple', 'ripple class'], ['prefers-reduced-motion', 'a11y'],
    ["'presence'", 'listens presence'], ["'revival'", 'listens revival'],
    ['tending the garden', 'global label plural'],
    ['you are the only one here', 'global label solo'],
  ];
  checks.forEach(([tok, lbl]) => check(s, tok, lbl));
  console.assert(!s.includes('__hbES'), 'no legacy EventSource sharing');
  console.log('[presence-client] OK -- all checks passed');
}

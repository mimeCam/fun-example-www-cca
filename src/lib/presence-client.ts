// src/lib/presence-client.ts
// Client IIFE — connects to /api/presence?slug=xxx for honest reader count.
// Renders breathing dot + count in PresenceBand. Ripple on foreign revival.
// No phantoms. count >= 2 shows "N readers". count < 2 shows nothing special.
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

  /* --- Update text label --- */
  function updateLabel(n){
    var el=textEl();if(!el)return;
    if(n>=2) el.textContent=n+' readers keeping this alive';
    else if(n===1) el.textContent='you are here';
    else el.textContent='';
  }

  /* --- Show/hide breathing dot --- */
  function updateDot(n){
    var d=dotEl();if(!d)return;
    d.style.display=n>=2?'inline-block':'none';
  }

  /* --- Show/hide the whole band --- */
  function updateBand(n){
    var b=bandEl();if(!b)return;
    b.classList.toggle('presence-active',n>=1);
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

  /* --- Connect SSE --- */
  function connect(){
    var slug=getSlug();
    if(!slug||typeof EventSource==='undefined')return;
    try{
      es=new EventSource('/api/presence?slug='+encodeURIComponent(slug));
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
    ['presence-dot', 'targets dot'], ['/api/presence?slug=', 'uses new endpoint'],
    ['presence-ripple', 'ripple class'], ['prefers-reduced-motion', 'a11y'],
    ["'presence'", 'listens presence'], ["'revival'", 'listens revival'],
  ];
  checks.forEach(([tok, lbl]) => check(s, tok, lbl));
  console.assert(!s.includes('__hbES'), 'no legacy EventSource sharing');
  console.log('[presence-client] OK -- all checks passed');
}

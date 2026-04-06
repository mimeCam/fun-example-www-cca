// src/lib/presence-engine.ts
// Client IIFE — connects to SSE heartbeat, updates presence DOM,
// manages ambient pulse, and adds ripple on foreign revival.
//
// Same pattern as decay-engine.ts and revival-engine.ts:
// Server TS function returns inline <script> IIFE as string.
//
// Reuses window.__hbES (EventSource exposed by revival-engine).
// If revival-engine hasn't loaded yet, creates its own connection.
//
// Credits: Mike (architecture), Tanya (UX spec), Paul (priority)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RIPPLE_MS = 800;
const RETRY_MS = 2000;
const MAX_DOTS = 5;
const TEMPO_BASE = 4;
const TEMPO_MIN = 1.5;

// ---------------------------------------------------------------------------
// Client IIFE
// ---------------------------------------------------------------------------

export function presenceEngineScript(): string {
  return `(function(){
  var RIPPLE=${RIPPLE_MS},RETRY=${RETRY_MS},MAX_DOTS=${MAX_DOTS};
  var TEMPO_BASE=${TEMPO_BASE},TEMPO_MIN=${TEMPO_MIN};
  var reduced=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- DOM refs --- */
  function band(){return document.getElementById('presence-band')}
  function textEl(){return document.getElementById('presence-text')}
  function dotsEl(){return document.getElementById('presence-dots')}

  /* --- Format presence text --- */
  function fmt(r,rev){
    if(r===0&&rev===0)return 'listening\\u2026';
    var p=[];
    if(r>1)p.push(r+' readers tending the garden');
    if(r===1)p.push('you are the only reader here');
    if(rev>0)p.push(rev+' revival'+(rev===1?'':'s')+' today');
    return p.join(' \\u00b7 ');
  }

  /* --- Update presence DOM --- */
  function updatePresence(r,rev){
    var t=textEl();if(t)t.textContent=fmt(r,rev);
    updateDots(r);
    updateTempo(r);
  }

  /* --- Render presence dots --- */
  function updateDots(count){
    var el=dotsEl();if(!el)return;
    var n=Math.min(count,MAX_DOTS);
    el.innerHTML='';
    for(var i=0;i<n;i++){
      var d=document.createElement('span');
      d.className='presence-dot';
      d.style.animationDelay=i*0.7+'s';
      el.appendChild(d);
    }
  }

  /* --- Adjust breathing tempo by reader count --- */
  function updateTempo(count){
    if(reduced)return;
    var b=band();if(!b)return;
    var t=Math.max(TEMPO_MIN,TEMPO_BASE-count*0.3);
    b.style.setProperty('--presence-tempo',t+'s');
  }

  /* --- Ripple on foreign revival --- */
  function ripple(slug){
    if(reduced)return;
    var card=document.querySelector('.decay-card[data-slug="'+slug+'"]');
    if(!card||card.hasAttribute('data-bloom-lock'))return;
    card.classList.add('presence-ripple');
    setTimeout(function(){card.classList.remove('presence-ripple')},RIPPLE);
  }

  /* --- SSE: reuse revival-engine's connection or create our own --- */
  function initSSE(){
    if(typeof EventSource==='undefined')return;
    waitForES(0);
  }

  function waitForES(attempts){
    var es=window.__hbES;
    if(es){
      attachListeners(es);
      return;
    }
    if(attempts<5){
      setTimeout(function(){waitForES(attempts+1)},RETRY);
      return;
    }
    createOwnES();
  }

  function createOwnES(){
    try{
      var es=new EventSource('/api/heartbeat');
      window.__hbES=es;
      attachListeners(es);
    }catch(e){}
  }

  function attachListeners(es){
    es.addEventListener('presence',function(e){
      try{
        var d=JSON.parse(e.data);
        updatePresence(d.readers||0,d.revivals||0);
      }catch(x){}
    });
    es.addEventListener('revival',function(e){
      try{
        var d=JSON.parse(e.data);
        if(d.slug)ripple(d.slug);
      }catch(x){}
    });
  }

  /* --- Init --- */
  function init(){initSSE()}
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testPresenceEngine(): void {
  const script = presenceEngineScript();

  console.assert(script.includes('presence-band'), 'targets band');
  console.assert(script.includes('presence-text'), 'targets text');
  console.assert(script.includes('presence-dot'), 'renders dots');
  console.assert(script.includes('presence-ripple'), 'ripple class');
  console.assert(script.includes('__hbES'), 'shares EventSource');
  console.assert(script.includes('prefers-reduced-motion'), 'a11y');
  console.assert(script.includes("'presence'"), 'listens presence');
  console.assert(script.includes("'revival'"), 'listens revival');

  console.log('[presence-engine] OK — all checks passed');
}

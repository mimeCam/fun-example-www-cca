// src/lib/reading-heartbeat.ts
// Passive Reading Heartbeat — tracks active reading time and slows decay.
//
// Client IIFE: fires POST /api/reading-pulse every 30 visible seconds.
// Page Visibility API pauses the clock when the tab is hidden — no cheating
// by leaving a tab open in the background.
//
// The reading bonus (0.08 max) is intentionally weaker than revival (0.30 max).
// It rewards genuine presence without becoming a gaming vector.
//
// Session ID is read from window.__sessionId (set by sessionToken.ts before
// any other script runs). The server uses it for rate-limiting.
//
// Credits: Mike (architecture spec)

const ENDPOINT = '/api/reading-pulse';
const INTERVAL_MS = 30_000;

/** Returns a self-executing script body for <script set:html={...} />. */
export function readingHeartbeatScript(slug: string): string {
  return `(function(){
  var SLUG=${JSON.stringify(slug)};
  var INT=${INTERVAL_MS};

  function sid(){try{return window.__sessionId||''}catch(e){return ''}}

  var activated=false;
  function activate(){
    if(activated) return;
    activated=true;
    var el=document.getElementById('reading-pulse');
    if(el) el.classList.add('pulse-active');
  }

  function sendPulse(){
    if(document.visibilityState!=='visible') return;
    fetch('${ENDPOINT}',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-session-id':sid()},
      body:JSON.stringify({slug:SLUG,seconds:30}),
      keepalive:true
    }).then(function(r){return r.json()})
      .then(function(d){if(d&&d.ok) activate()})
      .catch(function(){});
  }

  function init(){setInterval(sendPulse,INT)}

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check (inplace-testing-howto.md pattern)
// ---------------------------------------------------------------------------

export function _testReadingHeartbeat(): void {
  const script = readingHeartbeatScript('my-post');
  console.assert(script.includes('"my-post"'), 'slug embedded');
  console.assert(script.includes('visibilityState'), 'page visibility guard');
  console.assert(script.includes('/api/reading-pulse'), 'correct endpoint');
  console.assert(script.includes('setInterval'), 'interval timer present');
  console.assert(script.includes('keepalive'), 'keepalive for page unload');
  console.log('[reading-heartbeat] OK');
}

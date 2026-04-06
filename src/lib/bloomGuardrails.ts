// src/lib/bloomGuardrails.ts
// Defensive animation circuit breaker for cascade blooms.
// Caps concurrent blooms, enforces hard timeouts, detects thundering herds,
// pauses when tab is backgrounded, degrades on low FPS.
// Follows the inline IIFE pattern (see bloomOrchestrator.ts).

const MAX_CONCURRENT = 4;
const HARD_TIMEOUT_MS = 5000;
const CIRCUIT_RATE = 3;
const CIRCUIT_WINDOW_MS = 1000;
const FPS_FLOOR = 30;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomGuardrailsScript(): string {
  return `(function(){
  var MAX=${MAX_CONCURRENT};
  var TIMEOUT=${HARD_TIMEOUT_MS};
  var RATE=${CIRCUIT_RATE};
  var WIN=${CIRCUIT_WINDOW_MS};
  var FPS_MIN=${FPS_FLOOR};

  var active=new Set();
  var pending=[];
  var stamps=[];
  var paused=false;
  var lowFps=false;

  listenVis();
  monitorFps();

  document.__bloomGuardrails={
    request:request,
    release:release,
    isLowFps:function(){return lowFps},
    isPaused:function(){return paused}
  };

  function request(slug,intensity){
    if(paused)return'killed';
    if(isThundering())return handleThunder(slug);
    if(active.size>=MAX)return enqueue(slug,intensity);
    return approve(slug)
  }

  function approve(slug){
    active.add(slug);
    stamps.push(performance.now());
    scheduleTimeout(slug);
    return'approved'
  }

  function release(slug){
    active.delete(slug);
    flushNext()
  }

  function enqueue(slug,intensity){
    var dup=pending.some(function(p){return p.slug===slug});
    if(!dup)pending.push({slug:slug,intensity:intensity});
    return'queued'
  }

  function handleThunder(slug){
    document.dispatchEvent(new CustomEvent('bloom:constellation-pulse',{
      detail:{slug:slug}
    }));
    return'batched'
  }

  function isThundering(){
    pruneStamps(performance.now());
    return stamps.length>=RATE
  }

  function pruneStamps(now){
    while(stamps.length&&now-stamps[0]>WIN)stamps.shift()
  }

  function scheduleTimeout(slug){
    setTimeout(function(){
      if(!active.has(slug))return;
      active.delete(slug);
      dispatchKill(slug);
      flushNext()
    },TIMEOUT)
  }

  function flushNext(){
    if(!pending.length||active.size>=MAX)return;
    var next=pending.shift();
    approve(next.slug);
    dispatchFlush(next.slug,next.intensity)
  }

  function dispatchKill(slug){
    document.dispatchEvent(new CustomEvent('bloom:guardrail:kill',{
      detail:{slug:slug}
    }))
  }

  function dispatchFlush(slug,intensity){
    document.dispatchEvent(new CustomEvent('revival:success',{
      detail:{slug:slug,newCount:1,intensity:intensity,source:'guardrail-flush'}
    }))
  }

  function listenVis(){
    document.addEventListener('visibilitychange',function(){
      paused=document.visibilityState==='hidden'
    })
  }

  function monitorFps(){
    var last=performance.now();
    function check(){
      var now=performance.now();
      lowFps=(now-last)>(1000/FPS_MIN);
      last=now;
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testBloomGuardrails(): void {
  const script = bloomGuardrailsScript();

  console.assert(
    script.includes('__bloomGuardrails'),
    'exposes guardrail API',
  );
  console.assert(
    script.includes('visibilitychange'),
    'listens to Page Visibility API',
  );
  console.assert(
    script.includes('requestAnimationFrame'),
    'monitors FPS via rAF',
  );
  console.assert(
    script.includes('bloom:guardrail:kill'),
    'dispatches kill events',
  );
  console.assert(
    script.includes(String(MAX_CONCURRENT)),
    'uses max concurrent constant',
  );
  console.assert(
    script.includes(String(HARD_TIMEOUT_MS)),
    'uses hard timeout constant',
  );

  console.log('[bloom-guardrails] OK — script structure verified');
}

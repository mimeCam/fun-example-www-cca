// src/lib/bloomGuardrails.ts
// Defensive animation circuit breaker for cascade blooms.
// Caps concurrent blooms, enforces hard timeouts, detects thundering herds,
// pauses when tab is backgrounded, degrades on low FPS.
// Rolling FPS sampling: auto-reduce intensity below 45fps, kill below 30fps.
// Follows the inline IIFE pattern (see bloomOrchestrator.ts).

const MAX_CONCURRENT = 4;
const HARD_TIMEOUT_MS = 5000;
const CIRCUIT_RATE = 3;
const CIRCUIT_WINDOW_MS = 1000;
const FPS_KILL = 30;
const FPS_DEGRADE = 45;
const FPS_SAMPLE_SIZE = 8;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomGuardrailsScript(): string {
  return `(function(){
  var MAX=${MAX_CONCURRENT};
  var TIMEOUT=${HARD_TIMEOUT_MS};
  var RATE=${CIRCUIT_RATE};
  var WIN=${CIRCUIT_WINDOW_MS};
  var FPS_K=${FPS_KILL};
  var FPS_D=${FPS_DEGRADE};
  var SAMPLES=${FPS_SAMPLE_SIZE};

  var active=new Set();
  var pending=[];
  var stamps=[];
  var paused=false;
  var fpsLevel='ok';
  var frameTimes=[];

  listenVis();
  monitorFps();

  document.__bloomGuardrails={
    request:request,
    release:release,
    isLowFps:function(){return fpsLevel!=='ok'},
    isDegraded:function(){return fpsLevel==='degrade'},
    isKilled:function(){return fpsLevel==='kill'},
    isPaused:function(){return paused},
    fpsLevel:function(){return fpsLevel}
  };

  function request(slug,intensity){
    if(paused)return'killed';
    if(fpsLevel==='kill')return'killed';
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
    function sample(){
      var now=performance.now();
      var delta=now-last;
      last=now;
      if(delta>0)frameTimes.push(delta);
      if(frameTimes.length>SAMPLES)frameTimes.shift();
      if(frameTimes.length>=SAMPLES)classifyFps();
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }

  function classifyFps(){
    var sum=0;
    for(var i=0;i<frameTimes.length;i++)sum+=frameTimes[i];
    var avgMs=sum/frameTimes.length;
    var fps=1000/avgMs;
    if(fps<FPS_K)fpsLevel='kill';
    else if(fps<FPS_D)fpsLevel='degrade';
    else fpsLevel='ok'
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
    script.includes('classifyFps'),
    'rolling FPS classification (ok/degrade/kill)',
  );
  console.assert(
    script.includes('frameTimes'),
    'uses rolling frame-time sample buffer',
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
  console.assert(
    script.includes(String(FPS_DEGRADE)),
    'uses 45fps degrade threshold',
  );
  console.assert(
    script.includes(String(FPS_KILL)),
    'uses 30fps kill threshold',
  );

  console.log('[bloom-guardrails] OK — script structure verified');
}

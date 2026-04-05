// src/lib/bloomOrchestrator.ts
// The missing conductor: wires 'revival:success' to multi-phase bloom.
// Phases: Validate → Ignite → Burst → Afterglow → Settle
// FIFO queue: max 1 bloom per card at a time.
// Respects prefers-reduced-motion and time-travel state.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_SELECTOR = '.decay-card';
const PHASE_IGNITE_MS = 0;
const PHASE_BURST_RECALC_MS = 800;
const PHASE_AFTERGLOW_MS = 900;
const PHASE_SETTLE_MS = 1800;
const PHASE_CLEANUP_MS = 3000;
const MAX_DAYS = 365;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomOrchestratorScript(): string {
  return `(function(){
  var M=${MAX_DAYS},D=${MS_PER_DAY};
  var blooming=new Set();
  var queue=[];
  var ttActive=false;

  function prefersReduced(){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function findCard(slug){
    return document.querySelector('${CARD_SELECTOR}[data-slug="'+slug+'"]')
  }

  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}

  function df(pubMs,nowMs,r){
    var raw=Math.min(1,Math.max(0,(nowMs-pubMs)/D/M));
    return Math.max(0,raw-rb(r))
  }

  function patchDecay(el,count){
    var pubMs=new Date(el.dataset.pubDate).getTime();
    var f=df(pubMs,Date.now(),count);
    el.style.setProperty('--decay-opacity',Math.max(.35,1-f*.65));
    el.style.setProperty('--decay-blur',(f*1.5).toFixed(2)+'px');
    el.style.setProperty('--decay-saturation',(1-f*.4).toFixed(2));
    el.style.setProperty('--decay-shadow-y',((1-f)*8).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-spread',((1-f)*32).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-alpha',((1-f)*.18).toFixed(3))
  }

  function announce(el,count){
    var region=document.getElementById('bloom-aria-region');
    if(!region)return;
    var title=el.querySelector('.post-link');
    var name=title?title.textContent.trim():'Post';
    region.textContent=name+' revived — remembered by '+count+' readers'
  }

  function updateBadge(el,count){
    var badge=el.querySelector('[data-revival-badge]');
    if(!badge)return;
    badge.textContent=String(count);
    badge.style.display=count>=1?'':'none'
  }

  function reducedMotionPath(el,slug,count){
    el.dataset.revivalCount=String(count);
    patchDecay(el,count);
    updateBadge(el,count);
    announce(el,count);
    blooming.delete(slug)
  }

  function runBloom(slug,count){
    var el=findCard(slug);
    if(!el)return dequeue();
    if(blooming.has(slug))return dequeue();
    if(ttActive)return dequeue();

    blooming.add(slug);
    el.dataset.revivalCount=String(count);

    if(prefersReduced()){
      reducedMotionPath(el,slug,count);
      return dequeue()
    }

    el.setAttribute('data-bloom-lock','1');
    el.classList.add('blooming','bloom-lift');
    updateBadge(el,count);
    announce(el,count);

    setTimeout(function(){
      patchDecay(el,count)
    },${PHASE_BURST_RECALC_MS});

    setTimeout(function(){
      el.classList.remove('blooming');
      el.classList.add('bloom-afterglow')
    },${PHASE_AFTERGLOW_MS});

    setTimeout(function(){
      el.classList.remove('bloom-afterglow','bloom-lift');
      el.classList.add('bloom-settle')
    },${PHASE_SETTLE_MS});

    setTimeout(function(){
      el.classList.remove('bloom-settle');
      el.removeAttribute('data-bloom-lock');
      blooming.delete(slug);
      dequeue()
    },${PHASE_CLEANUP_MS})
  }

  function dequeue(){
    if(queue.length===0)return;
    var next=queue.shift();
    runBloom(next.slug,next.count)
  }

  function enqueue(slug,count){
    if(blooming.has(slug)){
      var exists=queue.some(function(q){return q.slug===slug});
      if(!exists)queue.push({slug:slug,count:count});
      return
    }
    runBloom(slug,count)
  }

  document.addEventListener('revival:success',function(e){
    var d=e.detail;
    if(!d||!d.slug)return;
    enqueue(d.slug,d.newCount||1)
  });

  document.addEventListener('timetravel:seek',function(){ttActive=true});
  document.addEventListener('timetravel:exit',function(){ttActive=false});

  if(!document.getElementById('bloom-aria-region')){
    var r=document.createElement('div');
    r.id='bloom-aria-region';
    r.setAttribute('aria-live','polite');
    r.setAttribute('aria-atomic','true');
    r.className='sr-only';
    document.body.appendChild(r)
  }
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testBloomOrchestrator(): void {
  const script = bloomOrchestratorScript();

  console.assert(
    script.includes("revival:success"),
    'listens for revival:success'
  );
  console.assert(
    script.includes("data-bloom-lock"),
    'sets bloom lock attribute'
  );
  console.assert(
    script.includes("bloom-lift"),
    'adds bloom-lift class'
  );
  console.assert(
    script.includes("bloom-afterglow"),
    'adds bloom-afterglow class'
  );
  console.assert(
    script.includes("bloom-settle"),
    'adds bloom-settle class'
  );
  console.assert(
    script.includes("prefers-reduced-motion"),
    'respects reduced motion'
  );
  console.assert(
    script.includes("timetravel:seek"),
    'pauses during time-travel'
  );
  console.assert(
    script.includes("aria-live"),
    'creates ARIA live region'
  );
  console.assert(
    script.includes("bloom-aria-region"),
    'uses shared ARIA region'
  );
  console.assert(
    script.includes(String(PHASE_CLEANUP_MS)),
    'cleanup at 3000ms'
  );

  console.log('[bloom-orchestrator] OK — script structure verified');
}

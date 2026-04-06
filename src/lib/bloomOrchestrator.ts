// src/lib/bloomOrchestrator.ts
// The missing conductor: wires 'revival:success' to multi-phase bloom.
// Phases: Validate → Ignite → Burst → Afterglow → Settle → Cleanup
// FIFO queue: max 1 bloom per card at a time.
// Respects prefers-reduced-motion and time-travel state.
// Handles touch-cancel to prevent ghost blooms from interrupted gestures.
// Clears will-change after settle (frees GPU memory on mobile).
// Uses degraded intensity when guardrails report low FPS.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_SELECTOR = '.decay-card';
// 3-phase bloom: Ignite → Glow → Settle (reduced from 5 phases).
// Burst + Afterglow removed per bloom phase reduction spec.
const PHASE_IGNITE_MS = 0;
const PHASE_GLOW_MS = 800;
const PHASE_SETTLE_MS = 1800;
const MAX_DAYS = 365;
const MS_PER_DAY = 86_400_000;
const DEGRADED_MAX_INTENSITY = 0.5;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomOrchestratorScript(): string {
  return `(function(){
  var M=${MAX_DAYS},D=${MS_PER_DAY};
  var blooming=new Set();
  var queue=[];
  var ttActive=false;
  var cancelledSlugs=new Set();

  listenRevival();
  listenTimeTravel();
  listenGuardrailKill();
  listenTouchCancel();
  ensureAriaRegion();

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
    region.textContent=name+' revived \\u2014 remembered by '+count+' readers'
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

  function runBloom(slug,count,intensity){
    intensity=typeof intensity==='number'?intensity:1;
    var el=findCard(slug);
    if(!el)return dequeue();
    if(blooming.has(slug))return dequeue();
    if(ttActive)return dequeue();
    if(cancelledSlugs.has(slug)){
      cancelledSlugs.delete(slug);
      return dequeue()
    }

    blooming.add(slug);
    el.dataset.revivalCount=String(count);
    registerGuardrail(slug,intensity);

    if(prefersReduced()){
      reducedMotionPath(el,slug,count);
      return dequeue()
    }

    if(isDegraded())intensity=Math.min(intensity,${DEGRADED_MAX_INTENSITY});
    applyIntensity(el,intensity);
    el.setAttribute('data-bloom-lock','1');
    promoteGpu(el);
    el.classList.add('blooming','bloom-lift');
    updateBadge(el,count);
    if(intensity>=1)announce(el,count);

    setTimeout(function(){
      if(!blooming.has(slug))return;
      patchDecay(el,count);
      el.classList.remove('blooming');
      el.classList.add('bloom-glow')
    },${PHASE_GLOW_MS});

    setTimeout(function(){
      if(!blooming.has(slug))return;
      el.classList.remove('bloom-glow','bloom-lift');
      el.classList.add('bloom-settle');
      demoteGpu(el);
      cleanupBloom(el,slug)
    },${PHASE_SETTLE_MS})
  }

  function cleanupBloom(el,slug){
    el.classList.remove('bloom-settle');
    el.removeAttribute('data-bloom-lock');
    clearIntensity(el);
    demoteGpu(el);
    blooming.delete(slug);
    releaseGuardrail(slug);
    dequeue()
  }

  function promoteGpu(el){
    el.style.willChange='transform, opacity'
  }

  function demoteGpu(el){
    el.style.removeProperty('will-change')
  }

  function dequeue(){
    if(queue.length===0)return;
    var next=queue.shift();
    runBloom(next.slug,next.count,next.intensity)
  }

  function applyIntensity(el,intensity){
    el.style.setProperty('--bloom-intensity',intensity.toFixed(2));
    if(intensity<1)el.classList.add('sympathetic')
  }

  function clearIntensity(el){
    el.style.removeProperty('--bloom-intensity');
    el.classList.remove('sympathetic')
  }

  function enqueue(slug,count,intensity){
    intensity=typeof intensity==='number'?intensity:1;
    if(blooming.has(slug)){
      var exists=queue.some(function(q){return q.slug===slug});
      if(!exists)queue.push({slug:slug,count:count,intensity:intensity});
      return
    }
    runBloom(slug,count,intensity)
  }

  function listenRevival(){
    document.addEventListener('revival:success',function(e){
      var d=e.detail;
      if(!d||!d.slug)return;
      if(d.programmatic)ttActive=false;
      enqueue(d.slug,d.newCount||1,d.intensity)
    })
  }

  function listenTimeTravel(){
    document.addEventListener('timetravel:seek',function(){ttActive=true});
    document.addEventListener('timetravel:exit',function(){ttActive=false})
  }

  function listenGuardrailKill(){
    document.addEventListener('bloom:guardrail:kill',function(e){
      var d=e.detail;
      if(!d||!d.slug)return;
      forceCleanup(d.slug)
    })
  }

  function listenTouchCancel(){
    document.addEventListener('revival:cancel',function(e){
      var d=e.detail;
      if(!d||!d.slug)return;
      if(blooming.has(d.slug))forceCleanup(d.slug);
      else cancelledSlugs.add(d.slug)
    })
  }

  function forceCleanup(slug){
    var el=findCard(slug);
    if(!el)return;
    el.classList.remove('blooming','bloom-lift','bloom-glow','bloom-settle');
    el.removeAttribute('data-bloom-lock');
    clearIntensity(el);
    demoteGpu(el);
    blooming.delete(slug);
    releaseGuardrail(slug)
  }

  function registerGuardrail(slug,intensity){
    var api=document.__bloomGuardrails;
    if(api&&api.request)api.request(slug,intensity)
  }

  function releaseGuardrail(slug){
    var api=document.__bloomGuardrails;
    if(api&&api.release)api.release(slug)
  }

  function isDegraded(){
    var api=document.__bloomGuardrails;
    if(!api)return false;
    if(api.isKilled&&api.isKilled())return true;
    return api.isLowFps?api.isLowFps():false
  }

  function ensureAriaRegion(){
    if(document.getElementById('bloom-aria-region'))return;
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
    script.includes("revival:cancel"),
    'handles touch-cancel ghost bloom prevention'
  );
  console.assert(
    script.includes("cancelledSlugs"),
    'tracks cancelled slugs to prevent ghost blooms'
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
    script.includes("bloom-glow"),
    'adds bloom-glow class (3-phase: ignite → glow → settle)'
  );
  console.assert(
    script.includes("bloom-settle"),
    'adds bloom-settle class'
  );
  console.assert(
    script.includes("willChange"),
    'promotes/demotes GPU will-change'
  );
  console.assert(
    script.includes("demoteGpu"),
    'clears will-change after settle to free GPU memory'
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
    script.includes(String(PHASE_SETTLE_MS)),
    'settle at 1800ms (3-phase bloom)'
  );

  console.log('[bloom-orchestrator] OK — script structure verified');
}

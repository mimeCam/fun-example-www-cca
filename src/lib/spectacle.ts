// src/lib/spectacle.ts
// First-visit spectacle controller — cinematic timelapse that teaches
// temporal decay in ~8 seconds. Drives existing time-travel engine
// via the same CSS var patching, plus a FogOverlay via --spectacle-progress.
//
// Phases: BLOOM → DECAY → RESIST → HANDOFF
// Gate: localStorage('persona:spectacle-seen')
// Coordination: dispatches 'spectacle:phase' and 'spectacle:complete'

const LS_KEY = 'persona:spectacle-seen';
const CARD_SEL = '.decay-card[data-pub-date]';
const MS_PER_DAY = 86_400_000;
const MAX_DAYS = 365;

// Phase durations (ms)
const BLOOM_MS = 1000;
const DECAY_MS = 5000;
const RESIST_MS = 2000;
const HANDOFF_MS = 2000;

// ── Helpers (exported for tests) ──────────────────────────

/** Sigmoid-ish easing: slow start → fast middle → slow end. */
export function spectacleEase(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** True when spectacle should auto-play (first visit, motion OK). */
export function shouldPlay(): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (localStorage.getItem(LS_KEY) === '1') return false;
  if (typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

/** Mark spectacle as seen so it never replays. */
export function markSeen(): void {
  try { localStorage.setItem(LS_KEY, '1'); } catch { /* private */ }
}

// ── Inline IIFE generator ─────────────────────────────────

export function spectacleScript(): string {
  return `(function(){
  var LS='${LS_KEY}',SEL='${CARD_SEL}',D=${MS_PER_DAY},M=${MAX_DAYS};
  var BLOOM=${BLOOM_MS},DECAY=${DECAY_MS},RESIST=${RESIST_MS};
  var HANDOFF=${HANDOFF_MS},TOTAL=BLOOM+DECAY+RESIST+HANDOFF;

  /* ── gate ───────────────────────────────── */
  function shouldRun(){
    try{if(localStorage.getItem(LS)==='1')return false}catch(e){}
    if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
    return true;
  }
  if(!shouldRun()){emitDone();return}

  /* ── easing ─────────────────────────────── */
  function ease(t){
    return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  }

  /* ── decay math (mirrors timeTravel.ts) ── */
  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function decayF(pubMs,simMs,r){
    var raw=Math.min(1,Math.max(0,(simMs-pubMs)/D/M));
    return Math.max(0,raw-rb(r));
  }

  function patchCard(el,simMs){
    var pubMs=new Date(el.dataset.pubDate).getTime();
    var r=+(el.dataset.revivalCount||'0');
    var f=decayF(pubMs,simMs,r);
    el.style.setProperty('--decay-opacity',Math.max(.35,1-f*.65));
    el.style.setProperty('--decay-blur',(f*1.5).toFixed(2)+'px');
    el.style.setProperty('--decay-saturation',(1-f*.4).toFixed(2));
    el.style.setProperty('--decay-shadow-y',((1-f)*8).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-spread',((1-f)*32).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-alpha',((1-f)*.18).toFixed(3));
    el.dataset.spectacleDecay=f.toFixed(3);
  }

  function patchAll(dayOffset){
    var simMs=Date.now()+dayOffset*D;
    var cards=document.querySelectorAll(SEL);
    cards.forEach(function(c){patchCard(c,simMs)});
  }

  /* ── fog progress ───────────────────────── */
  function setFog(progress){
    document.documentElement.style.setProperty(
      '--spectacle-progress',progress.toFixed(3));
  }

  /* ── resist: find most-revived card ─────── */
  function findResistCard(){
    var cards=document.querySelectorAll(SEL);
    var best=null,hi=-1;
    cards.forEach(function(c){
      var r=+(c.dataset.revivalCount||'0');
      if(r>hi){hi=r;best=c}
    });
    return best;
  }

  /* ── emit helpers ───────────────────────── */
  function emitPhase(name){
    document.dispatchEvent(new CustomEvent('spectacle:phase',{detail:name}));
  }
  function emitDone(){
    document.dispatchEvent(new CustomEvent('spectacle:complete'));
  }

  /* ── RAF loop ───────────────────────────── */
  var startT=0,raf=0,paused=false;

  function tick(now){
    if(paused){raf=requestAnimationFrame(tick);return}
    if(!startT)startT=now;
    var elapsed=now-startT;
    if(elapsed>=TOTAL){finish();return}

    if(elapsed<BLOOM) runBloom(elapsed);
    else if(elapsed<BLOOM+DECAY) runDecay(elapsed-BLOOM);
    else if(elapsed<BLOOM+DECAY+RESIST) runResist(elapsed-BLOOM-DECAY);
    else runHandoff(elapsed-BLOOM-DECAY-RESIST);

    raf=requestAnimationFrame(tick);
  }

  /* ── phase runners ─────────────────────── */
  var curPhase='';

  function runBloom(t){
    if(curPhase!=='bloom'){curPhase='bloom';emitPhase('bloom');patchAll(0);setFog(0)}
  }

  function runDecay(t){
    if(curPhase!=='decay'){curPhase='decay';emitPhase('decay')}
    var p=ease(t/DECAY);
    var day=p*M;
    patchAll(day);
    setFog(p*0.6);
  }

  function runResist(t){
    if(curPhase!=='resist'){
      curPhase='resist';emitPhase('resist');
      var rc=findResistCard();
      if(rc){
        rc.style.setProperty('--decay-opacity','0.85');
        rc.style.setProperty('--decay-blur','0px');
        rc.style.setProperty('--decay-saturation','1');
        rc.classList.add('spectacle-resist');
      }
    }
    setFog(0.6-ease(t/RESIST)*0.1);
  }

  function runHandoff(t){
    if(curPhase!=='handoff'){curPhase='handoff';emitPhase('handoff')}
    var p=ease(t/HANDOFF);
    setFog(0.5*(1-p));
    patchAll(M*(1-p));
  }

  function finish(){
    cancelAnimationFrame(raf);
    patchAll(0);
    setFog(0);
    document.body.classList.remove('spectacle-active');
    document.querySelectorAll('.spectacle-resist').forEach(function(c){
      c.classList.remove('spectacle-resist');
    });
    try{localStorage.setItem(LS,'1')}catch(e){}
    emitDone();
  }

  /* ── visibility: pause when tab hidden ── */
  document.addEventListener('visibilitychange',function(){
    paused=document.hidden;
  });

  /* ── skip button ────────────────────────── */
  document.addEventListener('spectacle:skip',function(){finish()});

  /* ── start ──────────────────────────────── */
  function start(){
    document.body.classList.add('spectacle-active');
    document.dispatchEvent(new CustomEvent('timetravel:seek'));
    raf=requestAnimationFrame(tick);
  }

  /* wait for choreography to finish, or 2s max */
  function waitAndStart(){
    var waited=0;
    var iv=setInterval(function(){
      waited+=100;
      var done=document.querySelector('.decay-card.choreo-done');
      if(done||waited>=2000){clearInterval(iv);start()}
    },100);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',waitAndStart);
  }else{waitAndStart()}
})();`;
}

// ── Sanity check ──────────────────────────────────────────

export function _testSpectacle(): void {
  console.assert(
    Math.abs(spectacleEase(0)) < 0.001,
    'ease(0) ≈ 0',
  );
  console.assert(
    Math.abs(spectacleEase(1) - 1) < 0.001,
    'ease(1) ≈ 1',
  );
  console.assert(
    spectacleEase(0.5) > 0.4 && spectacleEase(0.5) < 0.6,
    'ease(0.5) near midpoint',
  );

  const script = spectacleScript();
  console.assert(script.includes('spectacle:complete'), 'emits complete');
  console.assert(script.includes('spectacle:phase'), 'emits phase');
  console.assert(script.includes('spectacle-active'), 'sets body class');
  console.assert(script.includes('--spectacle-progress'), 'sets fog var');
  console.assert(script.includes('prefers-reduced-motion'), 'a11y gate');
  console.log('[spectacle] OK — easing, script structure verified');
}

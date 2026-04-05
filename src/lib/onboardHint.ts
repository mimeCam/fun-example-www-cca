// src/lib/onboardHint.ts
// First-visit onboarding hint for the revival mechanic.
// Shows a gentle "breath hint" on the most-decayed visible card,
// pulses the keep button, and displays a poetic one-liner.
//
// State machine: IDLE -> HINTING -> RESOLVED
// Gated by sessionStorage (once per session, first visit only).
// Listens for revival:success to auto-dismiss.
//
// Pattern: inline IIFE via onboardHintScript() — matches
// keepAlive, reviveClient, decayChoreography convention.

const SESSION_KEY = 'onboard-hint-seen';
const REVIVED_KEY = 'revived:any';
const CHOREO_DONE_SEL = '.decay-card.choreo-done';
const KEEP_BTN_SEL = '.keep-btn';
const POST_CHOREO_DELAY = 2000;
const HINT_DURATION = 10000;
const POLL_INTERVAL = 300;
const POLL_TIMEOUT = 5000;

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Check if hint was already shown this session. */
export function wasHintSeen(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
  catch { return false; }
}

/** Check if user already discovered revival organically. */
export function hasRevivedAny(): boolean {
  try { return sessionStorage.getItem(REVIVED_KEY) === '1'; }
  catch { return false; }
}

/** Mark hint as seen so it never shows again this session. */
export function markHintSeen(): void {
  try { sessionStorage.setItem(SESSION_KEY, '1'); }
  catch { /* private browsing */ }
}

/** Detect if device supports hover (desktop vs touch). */
export function isHoverDevice(): boolean {
  return typeof matchMedia !== 'undefined'
    && matchMedia('(hover: hover)').matches;
}

/** Detect if user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pick hint text based on device capability. */
export function hintText(hover: boolean): string {
  return hover
    ? 'older posts fade \u2014 click keep to revive'
    : 'older posts fade \u2014 tap keep to revive';
}

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function onboardHintScript(): string {
  return `(function(){
  var SK='${SESSION_KEY}',RK='${REVIVED_KEY}';
  var SEL='${CHOREO_DONE_SEL}',KSEL='${KEEP_BTN_SEL}';
  var DELAY=${POST_CHOREO_DELAY},DUR=${HINT_DURATION};
  var POLL=${POLL_INTERVAL},PTIMEOUT=${POLL_TIMEOUT};
  var state='idle';

  if(shouldSkip())return;

  /* ── listen for orchestrator signal ──── */
  document.addEventListener('onboard:start',function(){
    var cards=document.querySelectorAll(SEL);
    if(!cards.length){
      waitForChoreo(function(c){startHint(c)});
      return;
    }
    startHint(cards);
  },{once:true});

  function startHint(cards){
    var target=findMostDecayed(cards);
    if(!target)return;
    setTimeout(function(){showHint(target)},DELAY);
  }

  function shouldSkip(){
    try{
      if(sessionStorage.getItem(SK)==='1')return true;
      if(sessionStorage.getItem(RK)==='1')return true;
    }catch(e){}
    var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!rm;
  }

  function waitForChoreo(cb){
    var elapsed=0;
    var timer=setInterval(function(){
      var cards=document.querySelectorAll(SEL);
      elapsed+=POLL;
      if(cards.length>0||elapsed>=PTIMEOUT){
        clearInterval(timer);
        if(cards.length>0)cb(cards);
      }
    },POLL);
  }

  function findMostDecayed(cards){
    var best=null,bestFactor=-1;
    for(var i=0;i<cards.length;i++){
      var f=parseFloat(cards[i].getAttribute('data-decay-factor')||'0');
      if(f>bestFactor){bestFactor=f;best=cards[i];}
    }
    return best;
  }

  function showHint(card){
    if(state!=='idle')return;
    state='hinting';

    var keepBtn=card.querySelector(KSEL);
    if(keepBtn)keepBtn.classList.add('hint-pulse');
    card.classList.add('breath-hint-target');

    var tooltip=createTooltip(card);
    card.parentNode.insertBefore(tooltip,card.nextSibling);

    var dismiss=function(){resolve(card,keepBtn,tooltip)};

    document.addEventListener('revival:success',dismiss,{once:true});
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape')dismiss();
    },{once:true});

    setTimeout(dismiss,DUR);
  }

  function createTooltip(card){
    var hover=window.matchMedia&&matchMedia('(hover: hover)').matches;
    var text=hover
      ?'older posts fade \\u2014 click keep to revive'
      :'older posts fade \\u2014 tap keep to revive';

    var el=document.createElement('div');
    el.className='revival-hint-tooltip';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.textContent=text;
    return el;
  }

  function resolve(card,keepBtn,tooltip){
    if(state==='resolved')return;
    state='resolved';

    if(keepBtn)keepBtn.classList.remove('hint-pulse');
    card.classList.remove('breath-hint-target');
    tooltip.classList.add('hint-leaving');

    setTimeout(function(){
      if(tooltip.parentNode)tooltip.parentNode.removeChild(tooltip);
    },400);

    try{sessionStorage.setItem(SK,'1')}catch(e){}
    document.dispatchEvent(new CustomEvent('onboard:resolved'));
  }
})();`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testOnboardHint(): void {
  const script = onboardHintScript();

  console.assert(
    script.includes(SESSION_KEY),
    'script contains session key',
  );
  console.assert(
    script.includes('revival:success'),
    'script listens for revival event',
  );
  console.assert(
    script.includes('hint-pulse'),
    'script toggles pulse class',
  );
  console.assert(
    script.includes('aria-live'),
    'script sets aria-live',
  );
  console.assert(
    script.includes('Escape'),
    'script handles escape key',
  );
  console.assert(
    script.includes('data-decay-factor'),
    'script reads decay factor',
  );
  console.assert(
    hintText(true).includes('click'),
    'desktop hint says click',
  );
  console.assert(
    hintText(false).includes('tap'),
    'mobile hint says tap',
  );
  console.log('[onboardHint] OK — script, helpers verified');
}

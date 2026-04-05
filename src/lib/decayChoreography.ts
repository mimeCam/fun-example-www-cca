// src/lib/decayChoreography.ts
// Orchestrates the first-visit decay entrance animation.
// Cards bloom bright, then settle to their true decay state.
// Uses IntersectionObserver + class toggling. CSS does visuals.
//
// Pattern: inline IIFE via decayChoreographyScript() — same as
// liveDecayScript() and longPressReviveScript().

const CARD_SEL = '.choreo-pending';
const SESSION_KEY = 'decay-choreo-seen';
const STAGGER_MS = 120;
const HOLD_MS = 400;
const SETTLE_MS = 800;
const FALLBACK_MS = 3000;

// ---------------------------------------------------------------------------
// Timing helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Total ms before the i-th card finishes settling. */
export function cardFinishMs(index: number): number {
  return index * STAGGER_MS + HOLD_MS + SETTLE_MS;
}

/** Total choreography duration for N cards. */
export function totalDurationMs(cardCount: number): number {
  if (cardCount <= 0) return 0;
  return cardFinishMs(cardCount - 1);
}

/** Whether choreography should run (first visit, no reduced motion). */
export function shouldAnimate(): boolean {
  const reducedMotion = typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen = typeof sessionStorage !== 'undefined'
    && sessionStorage.getItem(SESSION_KEY) === '1';
  return !reducedMotion && !seen;
}

/** Mark this session as having seen choreography. */
export function markSeen(): void {
  try { sessionStorage.setItem(SESSION_KEY, '1'); }
  catch { /* private browsing — ignore */ }
}

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function decayChoreographyScript(): string {
  return `(function(){
  var K='${SESSION_KEY}',SEL='${CARD_SEL}';
  var STAG=${STAGGER_MS},HOLD=${HOLD_MS},SETTLE=${SETTLE_MS};
  var FB=${FALLBACK_MS};

  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen=false;
  try{seen=sessionStorage.getItem(K)==='1'}catch(e){}

  if(rm||seen){skipAll();return}
  try{sessionStorage.setItem(K,'1')}catch(e){}

  function skipAll(){
    var cards=document.querySelectorAll(SEL);
    for(var i=0;i<cards.length;i++){
      cards[i].classList.remove('choreo-pending');
      cards[i].classList.add('choreo-done');
    }
  }

  function revealCard(card,delay){
    setTimeout(function(){
      card.classList.remove('choreo-pending');
      card.classList.add('choreo-reveal');
      setTimeout(function(){
        card.classList.remove('choreo-reveal');
        card.classList.add('choreo-settle');
        setTimeout(function(){
          card.classList.remove('choreo-settle');
          card.classList.add('choreo-done');
        },SETTLE);
      },HOLD);
    },delay);
  }

  function observeCards(){
    var cards=document.querySelectorAll(SEL);
    if(!cards.length)return;
    if(!window.IntersectionObserver){skipAll();return}

    var io=new IntersectionObserver(function(entries){
      var visible=[];
      for(var i=0;i<entries.length;i++){
        if(entries[i].isIntersecting){
          visible.push(entries[i].target);
          io.unobserve(entries[i].target);
        }
      }
      visible.sort(function(a,b){
        return a.getBoundingClientRect().top-b.getBoundingClientRect().top;
      });
      for(var j=0;j<visible.length;j++){
        revealCard(visible[j],j*STAG);
      }
    },{threshold:0.1});

    for(var k=0;k<cards.length;k++){io.observe(cards[k])}
    setTimeout(function(){skipAll()},FB);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',observeCards);
  }else{observeCards()}
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testDecayChoreography(): void {
  console.assert(
    cardFinishMs(0) === HOLD_MS + SETTLE_MS,
    'card 0 finish time',
  );
  console.assert(
    cardFinishMs(1) === STAGGER_MS + HOLD_MS + SETTLE_MS,
    'card 1 finish time',
  );
  console.assert(
    totalDurationMs(0) === 0,
    'zero cards = zero duration',
  );
  console.assert(
    totalDurationMs(6) === 5 * STAGGER_MS + HOLD_MS + SETTLE_MS,
    'six cards total duration',
  );

  const script = decayChoreographyScript();
  console.assert(
    script.includes('choreo-pending'),
    'script references pending class',
  );
  console.assert(
    script.includes('choreo-done'),
    'script references done class',
  );
  console.assert(
    script.includes('IntersectionObserver'),
    'script uses IO',
  );
  console.assert(
    script.includes(SESSION_KEY),
    'script has session key',
  );
  console.log('[choreography] OK — timing, script verified');
}

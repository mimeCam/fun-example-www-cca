// src/lib/firstVisitHint.ts
// First-Visit Hint — localStorage helper + inline IIFE for onboarding.
//
// "Products with highest activation rates use only one active pattern
//  at a time." One hint. One moment. Done.
//
// localStorage keys:
//   fvh_seen   — set on first DecayCard hover/touch interaction
//   fvh_visits — incremented each visit (gates ambient life)
//
// Client JS budget: < 30 lines, inline IIFE, no imports.

const SEEN_KEY = 'fvh_seen';
const VISITS_KEY = 'fvh_visits';

// ---------------------------------------------------------------------------
// Server-side helpers (for conditional rendering logic if needed)
// ---------------------------------------------------------------------------

/** Check if hint was already seen (server can't check — always render). */
export function hintSeenKey(): string {
  return SEEN_KEY;
}

/** Visit counter key (gates ambient life after 3 visits). */
export function visitCountKey(): string {
  return VISITS_KEY;
}

// ---------------------------------------------------------------------------
// Client-side inline IIFE — the actual onboarding script
// ---------------------------------------------------------------------------

/** Returns inline IIFE that manages the first-visit hint lifecycle. */
export function firstVisitHintScript(): string {
  return `(function(){
  var S='${SEEN_KEY}',V='${VISITS_KEY}';
  var seen=localStorage.getItem(S);
  var visits=parseInt(localStorage.getItem(V)||'0',10)+1;
  localStorage.setItem(V,String(visits));
  var hint=document.getElementById('fvh');
  if(!hint)return;
  if(seen){hint.remove();return;}
  hint.classList.add('fvh-visible');
  function dismiss(){
    hint.classList.replace('fvh-visible','fvh-dismiss');
    localStorage.setItem(S,'1');
    hint.addEventListener('animationend',function(){hint.remove();});
  }
  document.querySelectorAll('.decay-card').forEach(function(c){
    c.addEventListener('mouseenter',dismiss,{once:true});
    c.addEventListener('touchstart',dismiss,{once:true,passive:true});
  });
})();`;
}

// ---------------------------------------------------------------------------
// Ambient life gating — client script to check visit count
// ---------------------------------------------------------------------------

/** Returns true on client if visitor has fewer than N visits. */
export function isNewVisitorCheck(threshold = 3): string {
  return `(parseInt(localStorage.getItem('${VISITS_KEY}')||'0',10)<${threshold})`;
}

// ---------------------------------------------------------------------------
// Demo revival — CSS-only glow on the most-decayed visible card at T+3s.
// NOT a real revival. No API call. No collectiveMemory increment.
// Adds .fvh-demo-glow class, removes on animationend.
// ---------------------------------------------------------------------------

/** Returns inline IIFE that triggers the demo glow at T+3s. */
export function demoRevivalScript(): string {
  return `(function(){
  var V='${VISITS_KEY}',S='${SEEN_KEY}';
  if(localStorage.getItem(S))return;
  var visits=parseInt(localStorage.getItem(V)||'0',10);
  if(visits>=3)return;
  setTimeout(function(){
    if(localStorage.getItem(S))return;
    var card=findMostDecayed();
    if(!card)return;
    card.classList.add('fvh-demo-glow');
    card.addEventListener('animationend',function(){
      card.classList.remove('fvh-demo-glow');
      card.classList.add('fvh-demo-done');
    },{once:true});
  },3000);
  function findMostDecayed(){
    var cards=document.querySelectorAll('.decay-card');
    var best=null,bestFactor=-1;
    cards.forEach(function(c){
      var f=parseFloat(c.dataset.decayFactor||'0');
      if(f>bestFactor){bestFactor=f;best=c;}
    });
    return best;
  }
})();`;
}

// ---------------------------------------------------------------------------
// Quiet mode — adds .fvh-quiet to <main> for visits < 3.
// Suppresses ambient overlays and amplifies decay contrast via CSS.
// ---------------------------------------------------------------------------

/** Returns inline IIFE that gates UI elements for new visitors. */
export function quietModeScript(): string {
  return `(function(){
  var V='${VISITS_KEY}';
  var visits=parseInt(localStorage.getItem(V)||'0',10);
  var isNew=(visits<3);
  var main=document.querySelector('.feed');
  if(isNew&&main)main.classList.add('fvh-quiet');
  document.documentElement.dataset.fvhQuiet=isNew?'true':'false';
})();`;
}

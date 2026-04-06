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

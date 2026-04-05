// src/lib/longPressRevive.ts
// Solves the mobile hover problem: long-press (300ms) revives decayed cards.
// Adds `.revived` class on touch, removes on release or after 4s timeout.
// Pure inline script — no framework dependency. Touch-only (noop on desktop).

/** Duration in ms a finger must hold before revival triggers. */
const HOLD_MS = 300;

/** How long the revived state persists after finger lifts. */
const LINGER_MS = 4000;

/** Selector for all decay cards that support revival. */
const CARD_SEL = '.decay-card';

/**
 * Returns an inline <script> body that enables long-press revival.
 * Drop into any layout that renders decay cards.
 */
export function longPressReviveScript(): string {
  return `(function(){
  if(!('ontouchstart' in window))return;
  var HOLD=${HOLD_MS},LINGER=${LINGER_MS},timer=null,lingerT=null,active=null;
  function revive(el){el.classList.add('revived');}
  function unrevive(el){el.classList.remove('revived');}
  function cancel(){clearTimeout(timer);timer=null;}
  function card(e){return e.target.closest('${CARD_SEL}');}
  document.addEventListener('touchstart',function(e){
    var c=card(e);if(!c)return;active=c;
    timer=setTimeout(function(){revive(c);},HOLD);
  },{passive:true});
  document.addEventListener('touchend',function(){
    cancel();if(!active)return;var c=active;active=null;
    clearTimeout(lingerT);
    lingerT=setTimeout(function(){unrevive(c);},LINGER);
  },{passive:true});
  document.addEventListener('touchcancel',function(){
    cancel();if(active){unrevive(active);active=null;}
  },{passive:true});
})();`;
}

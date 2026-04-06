// src/lib/discoveryHint.ts
// First-visit discovery — one whisper, one timeout, zero FSM.
// Replaces onboardProbe.ts (6.2K) + onboardHint.ts (6.4K).
//
// localStorage gate: 'discovery-hint-seen' (once-ever)
// Finds most-decayed visible card via CSS custom props.
// Shows hint, auto-dismisses after 4s. Done.

const SEEN_KEY = 'discovery-hint-seen';
const CARD_SEL = '.decay-card.choreo-done[data-pub-date]';
const HINT_ID = 'discovery-whisper';
const SHOW_DELAY = 1200;
const DISMISS_AFTER = 4000;

/** True when hint was already shown (ever). */
export function hintSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; }
  catch { return false; }
}

/** Stamp localStorage so hint never shows again. */
export function markHintSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); }
  catch { /* private browsing */ }
}

/** Inline IIFE for BaseLayout injection. */
export function discoveryHintScript(): string {
  return `(function(){
  var KEY='${SEEN_KEY}',SEL='${CARD_SEL}',HID='${HINT_ID}';
  var DELAY=${SHOW_DELAY},DISMISS=${DISMISS_AFTER};

  if(seen())return hide();

  setTimeout(init,DELAY);

  function seen(){
    try{return localStorage.getItem(KEY)==='1'}catch(e){return false}
  }

  function hide(){
    var el=document.getElementById(HID);
    if(el)el.style.display='none';
  }

  function init(){
    var cards=document.querySelectorAll(SEL);
    if(!cards.length)return hide();
    var target=mostDecayed(cards);
    if(!target)return hide();
    show(target);
  }

  function mostDecayed(cards){
    var best=null,maxBlur=-1;
    for(var i=0;i<cards.length;i++){
      var s=getComputedStyle(cards[i]);
      var b=parseFloat(s.getPropertyValue('--decay-blur'))||0;
      if(b>maxBlur){maxBlur=b;best=cards[i];}
    }
    return best;
  }

  function show(card){
    var el=document.getElementById(HID);
    if(!el)return;
    positionNear(el,card);
    el.classList.add('discovery--visible');
    stamp();
    scheduleExit(el);
    listenDismiss(el);
  }

  function positionNear(el,card){
    var r=card.getBoundingClientRect();
    el.style.top=(r.bottom+window.scrollY+8)+'px';
  }

  function stamp(){
    try{localStorage.setItem(KEY,'1')}catch(e){}
  }

  function scheduleExit(el){
    setTimeout(function(){dismiss(el)},DISMISS);
  }

  function listenDismiss(el){
    document.addEventListener('revival:success',function(){
      dismiss(el);
    },{once:true});
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape')dismiss(el);
    },{once:true});
  }

  function dismiss(el){
    if(el.classList.contains('discovery--exiting'))return;
    el.classList.add('discovery--exiting');
    el.classList.remove('discovery--visible');
  }
})();`;
}

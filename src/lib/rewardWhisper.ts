// src/lib/rewardWhisper.ts
// Post-revival reward — single toast, once per session.
// Replaces revivalReward.ts (4.4K) + revivalToast.ts (5.1K).
//
// sessionStorage gate: 'session-revival-rewarded' (once-per-session)
// Shows "You remembered it. Remembered by {n} readers."
// Auto-dismisses after 3s. CSS-only enter/exit.

const SESSION_KEY = 'session-revival-rewarded';
const TOAST_ID = 'reward-whisper';
const SHOW_DELAY = 500;
const DISMISS_AFTER = 3000;

/** True when reward was already shown this session. */
export function rewardShown(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
  catch { return false; }
}

/** Inline IIFE for BaseLayout injection. */
export function rewardWhisperScript(): string {
  return `(function(){
  var KEY='${SESSION_KEY}',TID='${TOAST_ID}';
  var DELAY=${SHOW_DELAY},DISMISS=${DISMISS_AFTER};

  document.addEventListener('revival:success',onRevival);

  function onRevival(e){
    if(shown())return;
    var d=e.detail||{};
    var count=d.newCount||0;
    setTimeout(function(){show(count)},DELAY);
    document.removeEventListener('revival:success',onRevival);
  }

  function shown(){
    try{return sessionStorage.getItem(KEY)==='1'}catch(e){return false}
  }

  function stamp(){
    try{sessionStorage.setItem(KEY,'1')}catch(e){}
  }

  function show(count){
    var el=document.getElementById(TID);
    if(!el)return;
    setText(el,count);
    el.classList.add('reward--visible');
    stamp();
    setTimeout(function(){dismiss(el)},DISMISS);
  }

  function setText(el,count){
    var span=el.querySelector('.reward-count');
    if(span&&count>0){
      span.textContent='Remembered by '+count+' reader'+(count===1?'':'s')+'.';
    }
  }

  function dismiss(el){
    if(el.classList.contains('reward--exiting'))return;
    el.classList.add('reward--exiting');
    el.classList.remove('reward--visible');
  }
})();`;
}

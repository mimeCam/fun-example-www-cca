// src/lib/resurrectClient.ts
// Client-side script for the /graveyard page.
// Fires POST /api/resurrect on button click.
// One resurrection per slug per session (sessionStorage gate).
// On success: swaps button label, emits resurrect:success CustomEvent.
//
// Shares pattern with reviveClient.ts — inline IIFE for BaseLayout injection.

const BTN_SELECTOR = '[data-resurrect-slug]';

/** Returns a self-executing script body for graveyard page injection. */
export function resurrectClientScript(): string {
  return `(function(){
  var S='${BTN_SELECTOR}';
  function fired(s){return sessionStorage.getItem('resurrected:'+s)==='1'}
  function mark(s){sessionStorage.setItem('resurrected:'+s,'1')}
  function emit(s,count){
    document.dispatchEvent(new CustomEvent('resurrect:success',
      {detail:{slug:s,newCount:count}}))}
  function send(btn,s){
    if(fired(s))return;mark(s);
    btn.textContent='rising\\u2026';btn.classList.add('risen');
    fetch('/api/resurrect',{method:'POST',keepalive:true,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug:s})})
    .then(function(r){return r.json()})
    .then(function(d){
      if(d&&d.ok){btn.textContent='\\u2191 risen \\u2014 will return soon';emit(s,d.count)}
      else{btn.textContent='\\u2191 resurrect';btn.classList.remove('risen')}})
    .catch(function(){btn.textContent='\\u2191 resurrect';btn.classList.remove('risen')})}
  function init(){
    document.querySelectorAll(S).forEach(function(btn){
      var s=btn.getAttribute('data-resurrect-slug');
      if(!s)return;
      if(fired(s)){btn.textContent='\\u2191 risen \\u2014 will return soon';btn.classList.add('risen');return}
      btn.addEventListener('click',function(){send(btn,s)})
    })}
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init()
})();`;
}

// src/lib/reviveClient.ts
// Client-side script that fires revival signals via fetch (keepalive).
// One signal per slug per session (sessionStorage gate).
// Desktop: 800ms hover dwell. Mobile: piggybacks on long-press.
// Dispatches revival:success CustomEvent on success for bloom system.

const HOVER_DWELL_MS = 800;
const CARD_SELECTOR = '.decay-card[data-pub-date]';

// ---------------------------------------------------------------------------
// Inline script generator (same pattern as liveDecayScript)
// ---------------------------------------------------------------------------

/** Returns a self-executing script body for BaseLayout injection. */
export function reviveClientScript(): string {
  return `(function(){
  var D=${HOVER_DWELL_MS},C='${CARD_SELECTOR}';
  function slug(el){var a=el.querySelector('a.post-link');
    if(!a)return null;var p=a.getAttribute('href')||'';
    var m=p.match(/\\/blog\\/([^\\/]+)/);return m?m[1]:null}
  function fired(s){return sessionStorage.getItem('revived:'+s)==='1'}
  function mark(s){sessionStorage.setItem('revived:'+s,'1')}
  function emit(s,count,src){
    document.dispatchEvent(new CustomEvent('revival:success',
      {detail:{slug:s,newCount:count,source:src}}))}
  function send(s,src){
    if(fired(s))return;mark(s);
    fetch('/api/revive',{method:'POST',keepalive:true,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug:s})})
    .then(function(r){return r.json()})
    .then(function(d){if(d&&d.ok)emit(s,d.count,src||'hover')})
    .catch(function(){})}
  function init(){
    var cards=document.querySelectorAll(C);
    cards.forEach(function(el){
      var timer=null;
      el.addEventListener('mouseenter',function(){
        var s=slug(el);if(!s||fired(s))return;
        timer=setTimeout(function(){send(s,'hover')},D)});
      el.addEventListener('mouseleave',function(){
        if(timer){clearTimeout(timer);timer=null}});
      el.addEventListener('touchend',function(){
        var s=slug(el);if(s)send(s,'longpress')})
    })}
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init()
})();`;
}

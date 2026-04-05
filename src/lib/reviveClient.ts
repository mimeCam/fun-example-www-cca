// src/lib/reviveClient.ts
// Client-side script that fires revival signals via sendBeacon.
// One signal per slug per session (sessionStorage gate).
// Desktop: 800ms hover dwell. Mobile: piggybacks on long-press.
// Fire-and-forget. No await, no error handling, no UI feedback.

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
  function send(s){
    if(fired(s))return;mark(s);
    navigator.sendBeacon('/api/revive',JSON.stringify({slug:s}))}
  function init(){
    var cards=document.querySelectorAll(C);
    cards.forEach(function(el){
      var timer=null;
      el.addEventListener('mouseenter',function(){
        var s=slug(el);if(!s||fired(s))return;
        timer=setTimeout(function(){send(s)},D)});
      el.addEventListener('mouseleave',function(){
        if(timer){clearTimeout(timer);timer=null}});
      el.addEventListener('touchend',function(){
        var s=slug(el);if(s)send(s)})
    })}
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init()
})();`;
}

// src/lib/keepAlive.ts
// Client-side handler for KeepButton clicks.
// Fires fetch() POST to /api/revive, reads response { count },
// triggers revival pulse animation, updates badge, swaps label.
// Session-gated: one keep per slug via sessionStorage.

const CARD_SEL = '.decay-card[data-slug]';
const BTN_SEL = '[data-keep-slug]';
const BADGE_SEL = '[data-revival-badge]';
const PULSE_MS = 600;
const BADGE_THRESHOLD = 5;

/** Returns inline IIFE for BaseLayout injection. */
export function keepAliveScript(): string {
  return `(function(){
  var CS='${CARD_SEL}',BS='${BTN_SEL}',RS='${BADGE_SEL}';
  var TH=${BADGE_THRESHOLD},PM=${PULSE_MS};

  function kept(s){return sessionStorage.getItem('kept:'+s)==='1'}
  function markKept(s){sessionStorage.setItem('kept:'+s,'1')}

  function findCard(btn){return btn.closest(CS)}

  function updateBadge(card,count){
    var b=card.querySelector(RS);
    if(!b)return;
    if(count>=TH){
      b.textContent='remembered by '+count+' readers';
      b.classList.remove('revival-hidden');
      b.removeAttribute('aria-hidden');
    }
  }

  function animatePulse(card){
    card.classList.add('just-revived');
    setTimeout(function(){
      card.classList.remove('just-revived');
    },PM);
  }

  function disableBtn(btn){
    btn.classList.add('kept');
    var lbl=btn.querySelector('.keep-label');
    if(lbl)lbl.textContent='kept';
  }

  function revive(btn){
    var slug=btn.getAttribute('data-keep-slug');
    if(!slug||kept(slug))return;
    var card=findCard(btn);
    if(!card)return;

    btn.classList.add('pulsing');
    markKept(slug);

    var ctrl=new AbortController();
    setTimeout(function(){ctrl.abort()},3000);

    fetch('/api/revive',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({slug:slug}),
      signal:ctrl.signal,
      keepalive:true
    }).then(function(r){return r.json()})
    .then(function(d){
      btn.classList.remove('pulsing');
      disableBtn(btn);
      if(d&&d.ok){
        animatePulse(card);
        updateBadge(card,d.count);
        card.setAttribute('data-revival-count',d.count);
      }
    }).catch(function(){
      btn.classList.remove('pulsing');
      disableBtn(btn);
    });
  }

  function restoreKept(){
    document.querySelectorAll(BS).forEach(function(btn){
      var s=btn.getAttribute('data-keep-slug');
      if(s&&kept(s))disableBtn(btn);
    });
  }

  function init(){
    restoreKept();
    document.addEventListener('click',function(e){
      var btn=e.target.closest(BS);
      if(btn)revive(btn);
    });
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();`;
}

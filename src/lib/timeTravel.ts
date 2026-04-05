// src/lib/timeTravel.ts
// Client-side time-travel engine — feeds a simulated date to existing decay math.
// No new decay logic. Same pure functions, different clock.
// Pauses live-decay via CustomEvent; resumes on exit.
//
// Entry point: timeTravelScript() → inline IIFE for BaseLayout injection.
// Coordination: dispatches 'timetravel:seek' and 'timetravel:exit' on document.

const CARD_SELECTOR = '.decay-card.choreo-done[data-pub-date]';
const MAX_DAYS = 365;
const MS_PER_DAY = 86_400_000;
const MAX_BLOOMS = 3;
const BLOOM_STAGGER_MS = 200;

/** Returns a self-executing script body for <script set:html={...} />. */
export function timeTravelScript(): string {
  return `(function(){
  var SEL='${CARD_SELECTOR}',M=${MAX_DAYS},D=${MS_PER_DAY};
  var slider=document.getElementById('tt-slider');
  var label=document.getElementById('tt-label');
  var toggle=document.getElementById('tt-toggle');
  var bar=document.getElementById('tt-bar');
  if(!slider||!label||!toggle||!bar) return;

  var active=false;

  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function df(pubMs,simMs,r){
    var raw=Math.min(1,Math.max(0,(simMs-pubMs)/D/M));
    return Math.max(0,raw-rb(r))}
  function band(days){return days<=30?'now':days<=180?'recent':'archive'}

  function patchCard(el,simMs){
    var pubMs=new Date(el.dataset.pubDate).getTime();
    var r=+(el.dataset.revivalCount||'0');
    var f=df(pubMs,simMs,r);
    el.style.setProperty('--decay-opacity',Math.max(.35,1-f*.65));
    el.style.setProperty('--decay-blur',(f*1.5).toFixed(2)+'px');
    el.style.setProperty('--decay-saturation',(1-f*.4).toFixed(2));
    el.style.setProperty('--decay-shadow-y',((1-f)*8).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-spread',((1-f)*32).toFixed(1)+'px');
    el.style.setProperty('--decay-shadow-alpha',((1-f)*.18).toFixed(3));
    var days=Math.max(0,(simMs-pubMs)/D);
    el.dataset.ttBand=band(days);
  }

  function formatDate(ms){
    var d=new Date(ms);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }

  function applyBloom(cards,prevOffset,curOffset){
    if(curOffset>=prevOffset) return;
    var queued=0;
    cards.forEach(function(el){
      if(queued>=${MAX_BLOOMS}) return;
      if(!el.classList.contains('blooming')&&
         parseFloat(el.style.getPropertyValue('--decay-opacity'))>0.7){
        queued++;
        setTimeout(function(){
          el.classList.add('blooming');
          setTimeout(function(){el.classList.remove('blooming')},800);
        },queued*${BLOOM_STAGGER_MS});
      }
    });
  }

  var prevOffset=0;

  function onSlide(){
    var offset=+slider.value;
    var simMs=Date.now()+offset*D;
    label.textContent=formatDate(simMs);
    var cards=document.querySelectorAll(SEL);
    cards.forEach(function(c){patchCard(c,simMs)});
    applyBloom(cards,prevOffset,offset);
    prevOffset=offset;
  }

  function enter(){
    active=true;
    bar.classList.add('tt-active');
    document.body.classList.add('time-traveling');
    document.dispatchEvent(new CustomEvent('timetravel:seek'));
    slider.value='0';
    prevOffset=0;
    onSlide();
    sessionStorage.setItem('tt-suppress-hint','1');
  }

  function exit(){
    active=false;
    bar.classList.remove('tt-active');
    document.body.classList.remove('time-traveling');
    document.dispatchEvent(new CustomEvent('timetravel:exit'));
    sessionStorage.removeItem('tt-suppress-hint');
  }

  toggle.addEventListener('click',function(){active?exit():enter()});
  slider.addEventListener('input',function(){if(active) onSlide()});
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testTimeTravel(): void {
  const script = timeTravelScript();
  console.assert(script.includes('timetravel:seek'), 'emits seek event');
  console.assert(script.includes('timetravel:exit'), 'emits exit event');
  console.assert(script.includes('--decay-opacity'), 'patches CSS vars');
  console.assert(script.includes('tt-slider'), 'reads slider element');
  console.assert(script.includes('blooming'), 'triggers bloom');
  console.log('[timeTravel] OK — script structure verified');
}

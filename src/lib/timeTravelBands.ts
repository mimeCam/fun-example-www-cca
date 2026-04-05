// src/lib/timeTravelBands.ts
// Client-side band re-sorting during time-travel slider scrub.
// Cards physically move between Now / Recent / Archive sections
// using FLIP animations (First-Last-Invert-Play) for smooth transitions.
//
// Inline IIFE pattern — matches timeTravel.ts architecture.
// Listens for 'timetravel:seek' and 'timetravel:exit' events.
// Driven by slider value; debounced to only re-sort when band assignments change.
//
// Zero dependencies. Pure platform APIs.

const CARD_SEL = '.decay-card[data-pub-date]';
const BAND_SEL = '.band';
const MS_PER_DAY = 86_400_000;
const STAGGER_MS = 50;
const FLIP_DURATION = 340;

/** Returns inline IIFE for <script set:html={...} /> injection. */
export function timeTravelBandsScript(): string {
  return `(function(){
  var CS='${CARD_SEL}',BS='${BAND_SEL}',D=${MS_PER_DAY};
  var STAG=${STAGGER_MS},FLIP=${FLIP_DURATION};
  var reducedMotion=window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  var bands=document.querySelectorAll(BS);
  if(bands.length<1) return;

  var origOrder=[];
  var bandMap=new Map();
  var active=false;

  ${fnBandFromDays()}
  ${fnSnapshotOrder()}
  ${fnFindBandSection()}
  ${fnCapturePositions()}
  ${fnAnimateFlip()}
  ${fnMoveCard()}
  ${fnSeek()}
  ${fnCollapseEmpty()}
  ${fnReset()}
  ${fnInit()}
})();`;
}

// ---------------------------------------------------------------------------
// Inline function fragments — each returns a string of JS
// ---------------------------------------------------------------------------

function fnBandFromDays(): string {
  return `function bandFromDays(d){
    return d<=30?'now':d<=180?'recent':'archive';
  }`;
}

function fnSnapshotOrder(): string {
  return `function snapshotOrder(){
    origOrder=[];
    var cards=document.querySelectorAll(CS);
    cards.forEach(function(c){
      origOrder.push({el:c,parent:c.parentElement,next:c.nextElementSibling});
      if(!c.dataset.origBand) c.dataset.origBand=c.dataset.ttBand||'now';
    });
  }`;
}

function fnFindBandSection(): string {
  return `function findBandSection(name){
    var sel={now:'.band:not(.band--recent):not(.band--archive)',
      recent:'.band--recent',archive:'.band--archive'};
    return document.querySelector(sel[name])||bands[bands.length-1];
  }`;
}

function fnCapturePositions(): string {
  return `function capturePositions(cards){
    var rects=new Map();
    cards.forEach(function(c){rects.set(c,c.getBoundingClientRect())});
    return rects;
  }`;
}

function fnAnimateFlip(): string {
  return `function animateFlip(el,fromRect,idx){
    var toRect=el.getBoundingClientRect();
    var dx=fromRect.left-toRect.left;
    var dy=fromRect.top-toRect.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1) return;
    if(reducedMotion){el.style.opacity='1';return}
    var delay=idx*STAG;
    el.style.transition='none';
    el.style.transform='translate('+dx+'px,'+dy+'px)';
    el.offsetHeight;
    el.style.transition='transform '+FLIP+'ms cubic-bezier(.34,1.56,.64,1) '+delay+'ms';
    el.style.transform='translate(0,0)';
    function cleanup(){
      el.style.transition='';el.style.transform='';
      el.removeEventListener('transitionend',cleanup);
    }
    el.addEventListener('transitionend',cleanup,{once:true});
    setTimeout(cleanup,FLIP+delay+50);
  }`;
}

function fnMoveCard(): string {
  return `function moveCard(el,targetSection){
    targetSection.appendChild(el);
  }`;
}

function fnSeek(): string {
  return `function seek(){
    var slider=document.getElementById('tt-slider');
    if(!slider||!active) return;
    var offset=+slider.value;
    var simMs=Date.now()+offset*D;
    var cards=document.querySelectorAll(CS);
    var changed=false;
    cards.forEach(function(c){
      var pubMs=new Date(c.dataset.pubDate).getTime();
      var days=Math.max(0,(simMs-pubMs)/D);
      var nb=bandFromDays(days);
      if(c.dataset.ttBand!==nb) changed=true;
    });
    if(!changed) return;
    var first=capturePositions(cards);
    var idx=0;
    cards.forEach(function(c){
      var pubMs=new Date(c.dataset.pubDate).getTime();
      var days=Math.max(0,(simMs-pubMs)/D);
      var nb=bandFromDays(days);
      c.dataset.ttBand=nb;
      var target=findBandSection(nb);
      if(c.parentElement!==target) moveCard(c,target);
    });
    collapseEmpty();
    cards.forEach(function(c){
      var fr=first.get(c);
      if(fr) animateFlip(c,fr,idx++);
    });
  }`;
}

function fnCollapseEmpty(): string {
  return `function collapseEmpty(){
    bands.forEach(function(b){
      var has=b.querySelector(CS);
      b.style.display=has?'':'none';
    });
  }`;
}

function fnReset(): string {
  return `function reset(){
    origOrder.forEach(function(snap){
      if(snap.next) snap.parent.insertBefore(snap.el,snap.next);
      else snap.parent.appendChild(snap.el);
      if(snap.el.dataset.origBand) snap.el.dataset.ttBand=snap.el.dataset.origBand;
    });
    bands.forEach(function(b){b.style.display=''});
  }`;
}

function fnInit(): string {
  return `function init(){
    snapshotOrder();
    document.addEventListener('timetravel:seek',function(){active=true;});
    document.addEventListener('timetravel:exit',function(){active=false;reset();});
    var slider=document.getElementById('tt-slider');
    if(slider) slider.addEventListener('input',function(){
      if(active) requestAnimationFrame(seek);
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  } else { init(); }`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testTimeTravelBands(): void {
  const script = timeTravelBandsScript();
  console.assert(script.includes('bandFromDays'), 'has band classifier');
  console.assert(script.includes('animateFlip'), 'has FLIP animation');
  console.assert(script.includes('capturePositions'), 'captures rects');
  console.assert(script.includes('timetravel:seek'), 'listens seek');
  console.assert(script.includes('timetravel:exit'), 'listens exit');
  console.assert(script.includes('snapshotOrder'), 'snapshots DOM');
  console.assert(script.includes('prefers-reduced-motion'), 'a11y');
  console.assert(script.includes('requestAnimationFrame'), 'RAF throttle');
  console.assert(script.includes('collapseEmpty'), 'hides empty bands');
  console.log('[timeTravelBands] OK — script structure verified');
}

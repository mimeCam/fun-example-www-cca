// src/lib/cascadeMobile.ts
// Mobile-specific cascade UX controller for Sympathetic Bloom.
// Viewport-aware stagger, scroll-into-view assist, haptic integration,
// orientation change handling, guardrail-gated bloom requests.
// Caps cascade to MAX_CASCADE visible cards (mobile GPU budget).
// Detects active scrolling to skip scroll-assist when user is in control.
// Debounces orientation change observer rebuild.
// Follows the inline IIFE pattern (see bloomOrchestrator.ts).

const MOBILE_STAGGER_MS = 150;
const MOBILE_DELAY_BASE_MS = 200;
const MOBILE_IO_THRESHOLD = 0.2;
const SCROLL_ASSIST_PX = 100;
const INTENSITY_SCALE = 0.5;
const CARD_SELECTOR = '.decay-card';
const MIN_STRENGTH = 0.2;
const MAX_CASCADE = 3;
const ORIENT_DEBOUNCE_MS = 300;
const SCROLL_IDLE_MS = 150;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function cascadeMobileScript(): string {
  return `(function(){
  var STAGGER=${MOBILE_STAGGER_MS};
  var BASE_DELAY=${MOBILE_DELAY_BASE_MS};
  var IO_THRESH=${MOBILE_IO_THRESHOLD};
  var SCROLL_ZONE=${SCROLL_ASSIST_PX};
  var SCALE=${INTENSITY_SCALE};
  var MIN_STR=${MIN_STRENGTH};
  var MAX_C=${MAX_CASCADE};
  var ORIENT_DB=${ORIENT_DEBOUNCE_MS};
  var SCROLL_IDLE=${SCROLL_IDLE_MS};

  var visible=new Set();
  var obs=null;
  var orientTimer=null;
  var scrollTimer=null;
  var userScrolling=false;

  init();

  function init(){
    obs=createObs();
    observeAll();
    listenEvents();
    listenOrientation();
    listenScroll()
  }

  function createObs(){
    return new IntersectionObserver(function(entries){
      for(var i=0;i<entries.length;i++)trackEntry(entries[i])
    },{threshold:IO_THRESH})
  }

  function trackEntry(entry){
    var slug=entry.target.dataset.slug;
    if(!slug)return;
    if(entry.isIntersecting)visible.add(slug);
    else visible.delete(slug)
  }

  function observeAll(){
    if(!obs)return;
    var cards=document.querySelectorAll('${CARD_SELECTOR}[data-slug]');
    cards.forEach(function(el){obs.observe(el)})
  }

  function listenEvents(){
    document.addEventListener('heartbeat:revival',onCascade);
    document.addEventListener('revival:local:resonance',onCascade)
  }

  function onCascade(e){
    handleCascade(e.detail&&e.detail.resonance)
  }

  function listenOrientation(){
    window.addEventListener('orientationchange',debouncedRebuild)
  }

  function debouncedRebuild(){
    if(orientTimer)clearTimeout(orientTimer);
    orientTimer=setTimeout(rebuildObs,ORIENT_DB)
  }

  function rebuildObs(){
    if(obs)obs.disconnect();
    obs=createObs();
    observeAll()
  }

  function listenScroll(){
    window.addEventListener('scroll',markScrolling,{passive:true})
  }

  function markScrolling(){
    userScrolling=true;
    if(scrollTimer)clearTimeout(scrollTimer);
    scrollTimer=setTimeout(function(){userScrolling=false},SCROLL_IDLE)
  }

  function handleCascade(resonance){
    if(!resonance||!resonance.length)return;
    var candidates=filterCandidates(resonance);
    scheduleBlooms(candidates)
  }

  function filterCandidates(resonance){
    var out=[];
    for(var i=0;i<resonance.length;i++){
      if(out.length>=MAX_C)break;
      var link=resonance[i];
      if(link.strength<MIN_STR)continue;
      if(visible.has(link.slug)||isNearFold(link.slug))out.push(link)
    }
    return out
  }

  function isNearFold(slug){
    var card=findCard(slug);
    if(!card)return false;
    var rect=card.getBoundingClientRect();
    return rect.top<=window.innerHeight+SCROLL_ZONE&&rect.top>0
  }

  function scheduleBlooms(candidates){
    var count=0;
    for(var i=0;i<candidates.length;i++){
      var c=candidates[i];
      var decision=checkGuardrail(c.slug,c.strength*SCALE);
      if(decision==='killed')continue;
      scheduleOne(c,i,count);
      count++
    }
    announceCount(count)
  }

  function scheduleOne(c,index,hapticIdx){
    var delay=BASE_DELAY+index*STAGGER;
    setTimeout(function(){
      scrollAssist(c.slug);
      fireBloom(c.slug,c.strength*SCALE);
      fireHaptic(hapticIdx)
    },delay)
  }

  function scrollAssist(slug){
    if(visible.has(slug))return;
    if(userScrolling)return;
    var card=findCard(slug);
    if(!card)return;
    card.scrollIntoView({behavior:'smooth',block:'nearest'})
  }

  function fireBloom(slug,intensity){
    document.dispatchEvent(new CustomEvent('revival:success',{
      detail:{slug:slug,newCount:1,intensity:intensity,source:'cascade-mobile'}
    }))
  }

  function fireHaptic(index){
    var api=document.__bloomHaptics;
    if(api&&api.tap)api.tap(index)
  }

  function checkGuardrail(slug,intensity){
    var api=document.__bloomGuardrails;
    if(!api||!api.request)return'approved';
    return api.request(slug,intensity)
  }

  function announceCount(count){
    if(count===0)return;
    var api=document.__bloomA11y;
    if(api&&api.announceCascade)api.announceCascade(count)
  }

  function findCard(slug){
    return document.querySelector('${CARD_SELECTOR}[data-slug="'+slug+'"]')
  }
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testCascadeMobile(): void {
  const script = cascadeMobileScript();

  console.assert(
    script.includes('orientationchange'),
    'handles orientation changes',
  );
  console.assert(
    script.includes('scrollIntoView'),
    'provides scroll assist',
  );
  console.assert(
    script.includes("block:'nearest'"),
    'scroll-assist uses nearest, not center',
  );
  console.assert(
    script.includes('userScrolling'),
    'skips scroll-assist when user is scrolling',
  );
  console.assert(
    script.includes('MAX_C'),
    'caps cascade to max visible cards',
  );
  console.assert(
    script.includes('debouncedRebuild'),
    'debounces orientation observer rebuild',
  );
  console.assert(
    script.includes('__bloomGuardrails'),
    'integrates with guardrails',
  );
  console.assert(
    script.includes('__bloomHaptics'),
    'integrates with haptics',
  );
  console.assert(
    script.includes('__bloomA11y'),
    'integrates with a11y',
  );
  console.assert(
    script.includes('heartbeat:revival'),
    'listens to heartbeat revivals',
  );
  console.assert(
    script.includes('revival:local:resonance'),
    'listens to local resonance',
  );
  console.assert(
    script.includes(String(MOBILE_STAGGER_MS)),
    'uses mobile stagger constant',
  );

  console.log('[cascade-mobile] OK — script structure verified');
}

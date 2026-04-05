// src/lib/bloomOnArrival.ts
// Client-side bloom trigger for shared revival links.
// When a visitor lands on ?ref=revival, dispatches a synthetic
// revival:success event after a short delay. The existing
// bloomOrchestrator handles the animation — zero duplication.
//
// Follows the inline IIFE pattern (see reviveClient.ts).
// Cleans ?ref param via history.replaceState after triggering.

const ARRIVAL_DELAY_MS = 600;
const CARD_SELECTOR = '.decay-card';

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomOnArrivalScript(): string {
  return `(function(){
  var DELAY=${ARRIVAL_DELAY_MS};

  function init(){
    var params=new URLSearchParams(location.search);
    if(params.get('ref')!=='revival')return;

    var slug=extractSlug();
    if(!slug)return;

    cleanUrl(params);
    setTimeout(function(){dispatchBloom(slug)},DELAY)
  }

  function extractSlug(){
    var path=location.pathname;
    var m=path.match(/\\/blog\\/([^\\/]+)/);
    return m?m[1]:null
  }

  function cleanUrl(params){
    params.delete('ref');
    var qs=params.toString();
    var clean=location.pathname+(qs?'?'+qs:'');
    history.replaceState(null,'',clean)
  }

  function dispatchBloom(slug){
    var card=document.querySelector(
      '${CARD_SELECTOR}[data-slug="'+slug+'"]');
    if(!card){
      dispatchGlobal(slug);
      return
    }
    dispatchGlobal(slug)
  }

  function dispatchGlobal(slug){
    document.dispatchEvent(new CustomEvent('revival:success',{
      detail:{slug:slug,newCount:0,source:'arrival'}
    }))
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init()
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testBloomOnArrival(): void {
  const script = bloomOnArrivalScript();

  console.assert(
    script.includes("ref"),
    'checks for ref param',
  );
  console.assert(
    script.includes("revival:success"),
    'dispatches revival:success',
  );
  console.assert(
    script.includes("replaceState"),
    'cleans URL via replaceState',
  );
  console.assert(
    script.includes("DOMContentLoaded"),
    'waits for DOM ready',
  );
  console.assert(
    script.includes(String(ARRIVAL_DELAY_MS)),
    'uses arrival delay',
  );

  console.log('[bloom-on-arrival] OK — script structure verified');
}

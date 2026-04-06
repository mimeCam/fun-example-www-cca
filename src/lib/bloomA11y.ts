// src/lib/bloomA11y.ts
// Accessible cascade announcements for sympathetic bloom.
// ARIA live region: announces cascade count.
// Reduced-motion: replaces transform/blur with opacity-only pulse.
// Updates aria-label on each bloomed card with freshness change.
// Follows the inline IIFE pattern (see bloomOrchestrator.ts).

const REDUCED_MOTION_MS = 600;
const OPACITY_PULSE_FROM = 0.5;
const OPACITY_PULSE_TO = 1.0;
const CARD_SELECTOR = '.decay-card';

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomA11yScript(): string {
  return `(function(){
  var DUR=${REDUCED_MOTION_MS};
  var OP_FROM=${OPACITY_PULSE_FROM};
  var OP_TO=${OPACITY_PULSE_TO};

  document.__bloomA11y={
    announceCascade:announceCascade,
    updateCardLabel:updateCardLabel,
    reducedMotionBloom:reducedMotionBloom,
    prefersReduced:prefersReduced
  };

  ensureRegion();

  function announceCascade(count){
    var region=document.getElementById('bloom-aria-region');
    if(!region)return;
    var noun=count===1?'post':'posts';
    region.textContent=count+' connected '+noun+' revived'
  }

  function updateCardLabel(slug,freshness){
    var card=findCard(slug);
    if(!card)return;
    var title=cardTitle(card);
    card.setAttribute('aria-label',title+' \\u2014 '+freshness);
    card.setAttribute('aria-relevant','additions')
  }

  function reducedMotionBloom(slug){
    var card=findCard(slug);
    if(!card)return;
    pulseOpacity(card)
  }

  function pulseOpacity(el){
    el.style.transition='opacity '+DUR+'ms ease';
    el.style.opacity=String(OP_FROM);
    requestAnimationFrame(function(){
      el.style.opacity=String(OP_TO);
      setTimeout(function(){clearPulse(el)},DUR)
    })
  }

  function clearPulse(el){
    el.style.removeProperty('opacity');
    el.style.removeProperty('transition')
  }

  function prefersReduced(){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function findCard(slug){
    return document.querySelector('${CARD_SELECTOR}[data-slug="'+slug+'"]')
  }

  function cardTitle(card){
    var link=card.querySelector('.post-link');
    return link?link.textContent.trim():'Post'
  }

  function ensureRegion(){
    if(document.getElementById('bloom-aria-region'))return;
    var r=document.createElement('div');
    r.id='bloom-aria-region';
    r.setAttribute('aria-live','polite');
    r.setAttribute('aria-atomic','true');
    r.className='sr-only';
    document.body.appendChild(r)
  }
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testBloomA11y(): void {
  const script = bloomA11yScript();

  console.assert(
    script.includes('__bloomA11y'),
    'exposes a11y API',
  );
  console.assert(
    script.includes('aria-live'),
    'uses ARIA live region',
  );
  console.assert(
    script.includes('aria-relevant'),
    'sets aria-relevant on cards',
  );
  console.assert(
    script.includes('prefers-reduced-motion'),
    'respects reduced motion',
  );
  console.assert(
    script.includes(String(REDUCED_MOTION_MS)),
    'uses reduced motion duration constant',
  );

  console.log('[bloom-a11y] OK — script structure verified');
}

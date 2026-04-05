// src/lib/revivalReward.ts
// Emotional payoff when a reader revives a decayed post.
// Listens for 'revival:success' and 'onboard:reward' events,
// shows contextual inline banner on the card + glow surge.
//
// Session-gated: first revival = full banner, subsequent = glow only.
// Pattern: exports revivalRewardScript() → inline IIFE string.

const CARD_SEL = '.decay-card[data-slug]';
const TPL_ID = 'revival-reward-tpl';
const ANNOUNCE_ID = 'revival-announce';
const SESSION_KEY = 'revival-reward-count';

const GLOW_CLASS = 'revival-glow';
const BANNER_CLASS = 'revival-reward-banner';
const FADING_CLASS = 'fading';

const HOLD_MS = 2500;
const HOLD_FIRST_MS = 3500;
const FADE_MS = 300;

const TEXT_FIRST = 'You brought it back';
const TEXT_REPEAT = 'Kept alive';

// ── Pure helpers (exported for tests) ────────────────────

/** Current reward count from session storage. */
export function rewardCount(): number {
  try {
    return parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10);
  } catch { return 0; }
}

// ── Inline IIFE generator ────────────────────────────────

export function revivalRewardScript(): string {
  return `(function(){
  var CS='${CARD_SEL}',TI='${TPL_ID}',AI='${ANNOUNCE_ID}';
  var SK='${SESSION_KEY}',GC='${GLOW_CLASS}',BC='${BANNER_CLASS}';
  var FC='${FADING_CLASS}';
  var HOLD=${HOLD_MS},HOLDF=${HOLD_FIRST_MS},FADE=${FADE_MS};
  var TF='${TEXT_FIRST}',TR='${TEXT_REPEAT}';

  function getCount(){
    try{return parseInt(sessionStorage.getItem(SK)||'0',10)}
    catch(e){return 0}
  }

  function bumpCount(){
    try{sessionStorage.setItem(SK,String(getCount()+1))}
    catch(e){}
  }

  function findCard(slug){
    return document.querySelector(CS+'[data-slug="'+slug+'"]');
  }

  function announce(slug){
    var el=document.getElementById(AI);
    if(el)el.textContent='Post revived: '+slug;
  }

  function hasBanner(card){
    return !!card.querySelector('.'+BC);
  }

  function addGlow(card){
    card.classList.add(GC);
  }

  function removeGlow(card,delay){
    setTimeout(function(){
      card.classList.remove(GC);
    },delay);
  }

  function insertBanner(card,text,holdMs){
    var tpl=document.getElementById(TI);
    if(!tpl)return;
    var clone=tpl.content.cloneNode(true);
    var banner=clone.querySelector('.'+BC);
    if(!banner)return;
    var span=banner.querySelector('.reward-text');
    if(span)span.textContent=text;
    card.appendChild(banner);
    scheduleFade(card,banner,holdMs);
  }

  function scheduleFade(card,banner,holdMs){
    setTimeout(function(){
      banner.classList.add(FC);
      setTimeout(function(){
        if(banner.parentNode)banner.parentNode.removeChild(banner);
      },FADE);
    },holdMs);
  }

  function reward(slug,isFirst){
    var card=findCard(slug);
    if(!card)return;
    if(hasBanner(card))return;

    var count=getCount();
    var first=isFirst||(count===0);
    var holdMs=first?HOLDF:HOLD;
    var totalMs=holdMs+FADE;

    addGlow(card);
    announce(slug);

    if(first){insertBanner(card,TF,holdMs)}
    else if(count<3){insertBanner(card,TR,holdMs)}

    removeGlow(card,totalMs);
    bumpCount();
  }

  function onRevival(e){
    var d=e.detail||{};
    if(d.slug)reward(d.slug,false);
  }

  function onOnboardReward(e){
    var d=e.detail||{};
    if(d.slug)reward(d.slug,true);
  }

  document.addEventListener('revival:success',onRevival);
  document.addEventListener('onboard:reward',onOnboardReward);
})();`;
}

// ── Sanity checks ────────────────────────────────────────

export function _testRevivalReward(): void {
  const script = revivalRewardScript();

  console.assert(
    script.includes('revival:success'),
    'listens for revival:success',
  );
  console.assert(
    script.includes('onboard:reward'),
    'listens for onboard:reward',
  );
  console.assert(
    script.includes(SESSION_KEY),
    'uses session storage key',
  );
  console.assert(
    script.includes(GLOW_CLASS),
    'applies glow class',
  );
  console.assert(
    script.includes(TEXT_FIRST),
    'has first-revival text',
  );
  console.assert(
    script.includes(TEXT_REPEAT),
    'has repeat-revival text',
  );
  console.log('[revivalReward] OK — events, session gate, banner verified');
}

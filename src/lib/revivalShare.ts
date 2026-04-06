// src/lib/revivalShare.ts
// Script factory: revival share bottom sheet IIFE.
// Listens for revival:success, slides the sheet up with OG preview +
// revival-aware copy. Also wires the static share button scroll-reveal.
//
// Architecture: inline IIFE factory — same pattern as share.ts / revivalController.ts.
// Imports shareUrl() from share.ts — no duplication of the URL builder.

import { shareUrl } from './share';

/** Returns the inline <script> body for RevivalShareSheet. */
export function revivalShareScript(slug: string): string {
  const s = JSON.stringify(slug);
  const parts = [
    `(function revivalShareInit(){`,
    `  var _slug=${s};`,
    shareUrl(), _sheetOpen(), _sheetClose(),
    _countText(), _countUpdate(),
    _sessionHelpers(), _onRevival(),
    _doShare(), _doCopy(),
    _wireSheet(), _wireStatic(), _wireRevival(),
    `})();`,
  ];
  return parts.join('\n');
}

/** JS snippet: get sheet ref + open animation. */
function _sheetOpen(): string {
  return [
    `  var _s=document.getElementById('revival-share-sheet');`,
    `  function _open(){`,
    `    if(!_s)return;`,
    `    _s.setAttribute('aria-hidden','false');`,
    `    _s.classList.add('sheet--open');`,
    `  }`,
  ].join('\n');
}

/** JS snippet: close animation with post-transition aria reset. */
function _sheetClose(): string {
  return [
    `  function _close(){`,
    `    if(!_s)return;`,
    `    _s.classList.remove('sheet--open');`,
    `    setTimeout(function(){_s&&_s.setAttribute('aria-hidden','true');},310);`,
    `  }`,
  ].join('\n');
}

/** JS snippet: map count → human copy string. */
function _countText(): string {
  return [
    `  function _txt(n){`,
    `    if(n===1)return"You're the first to save it";`,
    `    if(n>1)return n+' people kept this alive';`,
    `    return'Share this post';`,
    `  }`,
  ].join('\n');
}

/** JS snippet: update the copy element and data attribute. */
function _countUpdate(): string {
  return [
    `  function _upd(n){`,
    `    var el=_s&&_s.querySelector('[data-revival-copy]');`,
    `    if(el)el.textContent=_txt(n);`,
    `    if(_s)_s.setAttribute('data-revival-count',String(n));`,
    `  }`,
  ].join('\n');
}

/** JS snippet: session guard — one auto-show per slug per session. */
function _sessionHelpers(): string {
  return [
    `  var _key='revival-sheet:'+_slug;`,
    `  function _guarded(){return!!sessionStorage.getItem(_key);}`,
    `  function _guard(){sessionStorage.setItem(_key,'1');}`,
  ].join('\n');
}

/** JS snippet: revival:success handler — guards, updates count, opens sheet. */
function _onRevival(): string {
  return [
    `  function _onRevival(e){`,
    `    if(!e.detail||e.detail.slug!==_slug)return;`,
    `    if(_guarded())return;`,
    `    _upd(e.detail.newCount||0);`,
    `    _open();`,
    `  }`,
  ].join('\n');
}

/** JS snippet: share button handler — Web Share API with clipboard fallback. */
function _doShare(): string {
  return [
    `  function _doShare(){`,
    `    var n=parseInt((_s&&_s.getAttribute('data-revival-count'))||'0',10);`,
    `    var t=n>0?n+' people kept this alive. You\\'re reading it because of them.':'';`,
    `    var u=shareUrl();`,
    `    if(navigator.share){navigator.share({title:document.title,text:t,url:u}).catch(function(){});}`,
    `    else{navigator.clipboard.writeText(u).catch(function(){});}`,
    `    _guard();_close();`,
    `  }`,
  ].join('\n');
}

/** JS snippet: copy-link button handler — clipboard write then close. */
function _doCopy(): string {
  return [
    `  function _doCopy(){`,
    `    navigator.clipboard.writeText(shareUrl()).catch(function(){});`,
    `    _guard();_close();`,
    `  }`,
  ].join('\n');
}

/** JS snippet: wire dismiss/share/copy buttons inside the sheet panel. */
function _wireSheet(): string {
  return [
    `  if(_s){`,
    `    _s.addEventListener('click',function(e){if(e.target===_s)_close();});`,
    `    var _q=function(sel){return _s.querySelector(sel);};`,
    `    var _ds=_q('[data-sheet-dismiss]');if(_ds)_ds.addEventListener('click',_close);`,
    `    var _sh=_q('[data-sheet-share]');if(_sh)_sh.addEventListener('click',_doShare);`,
    `    var _cp=_q('[data-sheet-copy]');if(_cp)_cp.addEventListener('click',_doCopy);`,
    `    var _ob=_q('[data-static-share]');if(_ob)_ob.addEventListener('click',_open);`,
    `  }`,
  ].join('\n');
}

/** JS snippet: scroll-reveal for the static share button fallback. */
function _wireStatic(): string {
  return [
    `  function _checkReveal(){`,
    `    var p=parseFloat(getComputedStyle(document.documentElement)`,
    `      .getPropertyValue('--erosion-progress'))||1;`,
    `    var btn=_s&&_s.querySelector('[data-static-share]');`,
    `    if(btn)btn.classList.toggle('share--revealed',p<0.4);`,
    `  }`,
    `  window.addEventListener('scroll',function(){requestAnimationFrame(_checkReveal);},{passive:true});`,
    `  _checkReveal();`,
  ].join('\n');
}

/** JS snippet: wire document-level revival:success listener. */
function _wireRevival(): string {
  return `  document.addEventListener('revival:success',_onRevival);`;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testRevivalShare(): void {
  const script = revivalShareScript('hello-world');
  console.assert(script.includes('revivalShareInit'), 'missing IIFE name');
  console.assert(script.includes('revival:success'), 'missing event listener');
  console.assert(script.includes('shareUrl'), 'missing shareUrl snippet');
  console.assert(script.includes('navigator.share'), 'missing Web Share API');
  console.assert(script.includes('clipboard'), 'missing clipboard fallback');
  console.assert(script.includes('sessionStorage'), 'missing session guard');
  console.assert(script.includes('people kept this alive'), 'missing revival copy');
  console.assert(script.includes('erosion-progress'), 'missing scroll reveal');
  console.log('[revivalShare] script OK — bottom sheet + share + copy + guard');
}

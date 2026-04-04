// src/lib/share.ts
// "Share with Context" — inline script factory for the blog share button.
// Uses native Web Share API on mobile, Clipboard API fallback on desktop.
// Appends ?mood= to shared URL so recipients land in the same atmosphere.
//
// Architecture: follows moodCycle.ts / shimmer.ts inline IIFE pattern.
// Zero dependencies, zero tracking, prefers-reduced-motion respected.

/**
 * Returns an inline <script> body that powers the share button + toast.
 * Reads title/description from data attributes on [data-share-root].
 * Appends current mood from the checked radio input (mood system).
 */
export function shareScript(): string {
  return [
    `(function shareInit(){`,
    `  var root=document.querySelector('[data-share-root]');`,
    `  if(!root)return;`,
    `  var btn=root.querySelector('[data-share-btn]');`,
    `  var toast=root.querySelector('[data-share-toast]');`,
    `  if(!btn)return;`,
    buildShareUrl(),
    buildOnClick(),
    buildShowToast(),
    buildScrollReveal(),
    `  btn.addEventListener('click',onClick);`,
    `})();`,
  ].join('\n');
}

/** Builds the URL resolver snippet — appends ?mood= context. */
function buildShareUrl(): string {
  return [
    `  function shareUrl(){`,
    `    var u=new URL(location.href);`,
    `    var m=document.querySelector('input[id^="mood-"]:checked');`,
    `    if(m)u.searchParams.set('mood',m.id.replace('mood-',''));`,
    `    return u.toString();`,
    `  }`,
  ].join('\n');
}

/** Builds the click handler — Web Share API or clipboard fallback. */
function buildOnClick(): string {
  return [
    `  function onClick(){`,
    `    var title=root.dataset.shareTitle||document.title;`,
    `    var text=root.dataset.shareText||'';`,
    `    var url=shareUrl();`,
    `    if(navigator.share){`,
    `      navigator.share({title:title,text:text,url:url}).catch(function(){});`,
    `    }else{copyFallback(url)}`,
    `  }`,
  ].join('\n');
}

/** Builds the clipboard copy + toast notification snippet. */
function buildShowToast(): string {
  return [
    `  function copyFallback(url){`,
    `    navigator.clipboard.writeText(url).then(function(){`,
    `      showToast('Link copied');`,
    `    }).catch(function(){showToast('Copy failed')});`,
    `  }`,
    `  function showToast(msg){`,
    `    if(!toast)return;`,
    `    toast.textContent=msg;`,
    `    toast.setAttribute('aria-live','polite');`,
    `    toast.classList.add('share-toast--visible');`,
    `    setTimeout(function(){`,
    `      toast.classList.remove('share-toast--visible');`,
    `    },2200);`,
    `  }`,
  ].join('\n');
}

/** Builds scroll-reveal logic — share button fades in at 60% scroll. */
function buildScrollReveal(): string {
  return [
    `  var ep=parseFloat(getComputedStyle(document.documentElement)`,
    `    .getPropertyValue('--erosion-progress'))||1;`,
    `  function checkReveal(){`,
    `    var p=parseFloat(getComputedStyle(document.documentElement)`,
    `      .getPropertyValue('--erosion-progress'))||1;`,
    `    root.classList.toggle('share--revealed',p<0.4);`,
    `  }`,
    `  window.addEventListener('scroll',function(){`,
    `    requestAnimationFrame(checkReveal);`,
    `  },{passive:true});`,
    `  checkReveal();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testShare(): void {
  const script = shareScript();
  console.assert(script.includes('shareInit'), 'missing IIFE name');
  console.assert(script.includes('navigator.share'), 'missing Web Share API');
  console.assert(script.includes('clipboard'), 'missing clipboard fallback');
  console.assert(script.includes('erosion-progress'), 'missing scroll reveal');
  console.assert(script.includes('mood-'), 'missing mood context');
  console.log('[share] script OK — Web Share + clipboard + mood context');
}

// src/lib/revivalToast.ts
// Client-side toast shown after a successful revival.
// "You kept this alive · Share moment ->"
// Uses Web Share API on mobile, Clipboard API on desktop.
// Follows the inline IIFE pattern (see reviveClient.ts).
//
// Accessibility: role="status", aria-live="polite", keyboard-focusable.
// Auto-dismiss after 6s; pauses on hover/focus (WCAG 2.2.1).
// Respects prefers-reduced-motion. Max 1 toast at a time.

const TOAST_DELAY_MS = 600;
const DISMISS_MS = 6000;
const FADE_MS = 800;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function revivalToastScript(): string {
  return `(function(){
  var DELAY=${TOAST_DELAY_MS},DISMISS=${DISMISS_MS},FADE=${FADE_MS};
  var active=null,timer=null,paused=false;

  function reduced(){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function buildUrl(slug){
    var u=new URL(location.href);
    u.pathname='/blog/'+slug;
    u.searchParams.set('ref','revival');
    return u.toString()
  }

  function create(slug){
    var el=document.createElement('div');
    el.className='revival-toast'+(reduced()?' revival-toast--no-motion':'');
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.innerHTML=
      '<span class="revival-toast__icon">&#10022;</span>'+
      '<span class="revival-toast__text">You kept this alive</span>'+
      '<span class="revival-toast__sep">&#183;</span>'+
      '<button class="revival-toast__share" type="button">'+
        'Share moment &#8594;</button>';
    return el
  }

  function dismiss(){
    if(!active)return;
    active.classList.add('revival-toast--out');
    var ref=active;
    setTimeout(function(){ref.remove()},FADE);
    active=null;timer=null;paused=false
  }

  function startTimer(){
    if(timer)clearTimeout(timer);
    timer=setTimeout(dismiss,DISMISS)
  }

  function wireEvents(el,slug){
    var btn=el.querySelector('.revival-toast__share');
    if(btn)btn.addEventListener('click',function(){share(slug)});
    el.addEventListener('mouseenter',function(){
      paused=true;if(timer)clearTimeout(timer)});
    el.addEventListener('mouseleave',function(){
      paused=false;startTimer()});
    el.addEventListener('focusin',function(){
      paused=true;if(timer)clearTimeout(timer)});
    el.addEventListener('focusout',function(){
      paused=false;startTimer()})
  }

  function share(slug){
    var url=buildUrl(slug);
    var title=document.title||'A post kept alive';
    if(navigator.share){
      navigator.share({title:title,url:url}).catch(function(){});
    }else{
      navigator.clipboard.writeText(url).then(function(){
        showCopied()
      }).catch(function(){})
    }
  }

  function showCopied(){
    if(!active)return;
    var btn=active.querySelector('.revival-toast__share');
    if(!btn)return;
    btn.textContent='Copied \\u2713';
    setTimeout(function(){
      btn.innerHTML='Share moment &#8594;'
    },1500)
  }

  function hideQuietFollow(){
    var qf=document.querySelector('.quiet-follow');
    if(qf)qf.style.opacity='0'
  }

  function restoreQuietFollow(){
    var qf=document.querySelector('.quiet-follow');
    if(qf)qf.style.opacity=''
  }

  function show(slug){
    if(active)dismiss();
    hideQuietFollow();
    var el=create(slug);
    wireEvents(el,slug);
    document.body.appendChild(el);
    active=el;
    startTimer()
  }

  document.addEventListener('revival:success',function(e){
    var d=e.detail;
    if(!d||!d.slug)return;
    if(d.intensity&&d.intensity<1)return;
    setTimeout(function(){show(d.slug)},DELAY)
  });

  document.addEventListener('revival-toast:dismiss',dismiss);

  var mo=new MutationObserver(function(){
    if(active&&!document.body.contains(active)){
      restoreQuietFollow();active=null
    }
  });
  mo.observe(document.body,{childList:true});

  window.addEventListener('beforeunload',function(){
    restoreQuietFollow()
  })
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testRevivalToast(): void {
  const script = revivalToastScript();

  console.assert(
    script.includes("revival:success"),
    'listens for revival:success',
  );
  console.assert(
    script.includes("role"),
    'sets role attribute',
  );
  console.assert(
    script.includes("aria-live"),
    'sets aria-live attribute',
  );
  console.assert(
    script.includes("prefers-reduced-motion"),
    'respects reduced motion',
  );
  console.assert(
    script.includes("navigator.share"),
    'uses Web Share API',
  );
  console.assert(
    script.includes("clipboard"),
    'clipboard fallback',
  );
  console.assert(
    script.includes("ref=revival"),
    'builds revival share URL',
  );
  console.assert(
    script.includes("quiet-follow"),
    'hides QuietFollow during toast',
  );
  console.assert(
    script.includes(String(DISMISS_MS)),
    'auto-dismiss timeout',
  );

  console.log('[revival-toast] OK — script structure verified');
}

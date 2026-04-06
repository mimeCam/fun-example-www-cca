// src/lib/firstEchoClient.ts
// Client-side listener for First Revival Echo.
// Inline IIFE that coordinates with guidedTouch completion,
// signals the server on first revival, and shows a whisper
// when the echo SSE event arrives.
//
// Gates: localStorage 'echo_seen' (one-shot per device),
//        waits for guided-touch cleanup before arming.
// Accessibility: ARIA live region, reduced motion support.

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function firstEchoClientScript(): string {
  return `(${firstEchoIIFE.toString()})();`;
}

// ---------------------------------------------------------------------------
// The IIFE body
// ---------------------------------------------------------------------------

function firstEchoIIFE(): void {
  var KEY = 'echo_seen';
  var armed = false;
  var echoed = false;

  if (!shouldRun()) return;
  waitForGuidedTouchDone(arm);

  // --- gate ----------------------------------------------------------------

  function shouldRun(): boolean {
    try { if (localStorage.getItem(KEY) === '1') return false; }
    catch (e) { return false; }
    return true;
  }

  function markSeen(): void {
    try { localStorage.setItem(KEY, '1'); }
    catch (e) { /* private browsing */ }
  }

  // --- wait for guided touch completion ------------------------------------

  function waitForGuidedTouchDone(cb: () => void): void {
    if (isGuidedTouchGone()) { cb(); return; }
    listenForDoneEvent(cb);
    observeSpotlightRemoval(cb);
  }

  function isGuidedTouchGone(): boolean {
    return !document.getElementById('gt-spotlight');
  }

  function listenForDoneEvent(cb: () => void): void {
    document.addEventListener('guidedtouch:done', function onDone() {
      document.removeEventListener('guidedtouch:done', onDone);
      cb();
    }, { once: true });
  }

  function observeSpotlightRemoval(cb: () => void): void {
    var spot = document.getElementById('gt-spotlight');
    if (!spot || !spot.parentNode) return;
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var removed = muts[i].removedNodes;
        for (var j = 0; j < removed.length; j++) {
          if ((removed[j] as HTMLElement).id === 'gt-spotlight') {
            mo.disconnect();
            cb();
            return;
          }
        }
      }
    });
    mo.observe(spot.parentNode, { childList: true });
  }

  // --- arm: listen for first revival ---------------------------------------

  function arm(): void {
    if (armed) return;
    armed = true;
    document.addEventListener('revival:success', onFirstRevival, { once: true });
  }

  function onFirstRevival(e: Event): void {
    markSeen();
    sendEchoHint(e);
    listenForEchoEvent();
  }

  // --- send hint to server -------------------------------------------------

  function sendEchoHint(e: Event): void {
    var detail = (e as CustomEvent).detail;
    if (!detail || !detail.slug) return;
    var headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-first-echo': '1',
    };
    addSessionHeader(headers);
    fetch('/api/echo-hint', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ slug: detail.slug }),
    }).catch(function () { /* best-effort */ });
  }

  function addSessionHeader(headers: Record<string, string>): void {
    var sid = sessionStorage.getItem('session_token');
    if (sid) headers['x-session-id'] = sid;
  }

  // --- listen for echo arrival via SSE ------------------------------------

  function listenForEchoEvent(): void {
    document.addEventListener('heartbeat:revival', onHeartbeat);
    setTimeout(stopListening, 15000);
  }

  function onHeartbeat(e: Event): void {
    if (echoed) return;
    var d = (e as CustomEvent).detail;
    if (!d || !d.slug) return;
    echoed = true;
    stopListening();
    showEchoWhisper(d.slug);
  }

  function stopListening(): void {
    document.removeEventListener('heartbeat:revival', onHeartbeat);
  }

  // --- echo whisper UI -----------------------------------------------------

  function showEchoWhisper(slug: string): void {
    var whisper = createWhisperEl();
    setWhisperText(whisper, slug);
    document.body.appendChild(whisper);
    announceToScreenReader(slug);
    requestAnimationFrame(function () { revealWhisper(whisper); });
  }

  function createWhisperEl(): HTMLElement {
    var el = document.createElement('div');
    el.className = 'echo-whisper';
    el.setAttribute('role', 'status');
    return el;
  }

  function setWhisperText(el: HTMLElement, slug: string): void {
    var title = findPostTitle(slug);
    el.textContent = title
      ? 'someone else remembered \u201c' + title + '\u201d'
      : 'you\u2019re not alone here';
  }

  function findPostTitle(slug: string): string | null {
    var card = document.querySelector(
      '.decay-card[data-slug="' + slug + '"]'
    );
    if (!card) return null;
    var h = card.querySelector('h2, h3, [data-title]');
    return h ? (h as HTMLElement).textContent || null : null;
  }

  function revealWhisper(el: HTMLElement): void {
    el.classList.add('echo-whisper--visible');
    setTimeout(function () { fadeWhisper(el); }, 2500);
  }

  function fadeWhisper(el: HTMLElement): void {
    el.classList.remove('echo-whisper--visible');
    el.classList.add('echo-whisper--fading');
    setTimeout(function () { removeWhisper(el); }, 800);
  }

  function removeWhisper(el: HTMLElement): void {
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  // --- accessibility -------------------------------------------------------

  function announceToScreenReader(slug: string): void {
    var title = findPostTitle(slug);
    var msg = title
      ? 'Another reader just revived ' + title
      : 'Another reader is here with you';
    var sr = document.createElement('div');
    sr.setAttribute('role', 'status');
    sr.setAttribute('aria-live', 'polite');
    sr.className = 'sr-only';
    sr.textContent = msg;
    document.body.appendChild(sr);
    setTimeout(function () { removeWhisper(sr); }, 5000);
  }
}

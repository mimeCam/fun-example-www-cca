// src/lib/guidedTouch.ts
// Guided First Touch — interactive first-visit demo.
// Walks the visitor through one decay→revival cycle on a real card.
// Show, don't tell. One shot, inline, no overlay.
//
// Pattern: inline IIFE via guidedTouchScript() — same as
// decayChoreographyScript(), reviveClientScript(), etc.
//
// Flow: spotlight → ghost cursor → visitor hovers → real revival
// Short-circuits if visitor hovers ANY card before demo completes.
// localStorage gate: 'guided_touch_seen' — never replays.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'guided_touch_seen';
const CARD_SEL = '.decay-card[data-decay-factor]';

/** Delay after choreo-done before starting the demo. */
const DEMO_DELAY_MS = 600;

/** How long spotlight pulse runs before cursor appears. */
const SPOTLIGHT_LEAD_MS = 1200;

/** Duration of ghost cursor drift animation. */
const CURSOR_DRIFT_MS = 2000;

/** How long the whisper text stays visible. */
const WHISPER_HOLD_MS = 2500;

/** Total demo budget (auto-cancel safety net). */
const MAX_DEMO_MS = 12000;

// ---------------------------------------------------------------------------
// Server-side helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Whether the demo should run (first visit, no reduced motion). */
export function shouldGuide(): boolean {
  if (typeof window === 'undefined') return false;
  const rm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const seen = localStorage.getItem(STORAGE_KEY) === '1';
  return !rm && !seen;
}

/** Mark demo as seen. */
export function markGuideSeen(): void {
  try { localStorage.setItem(STORAGE_KEY, '1'); }
  catch { /* private browsing */ }
}

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function guidedTouchScript(): string {
  return `(${guidedTouchIIFE.toString()})();`;
}

// ---------------------------------------------------------------------------
// The IIFE body (written as a real function for readability)
// ---------------------------------------------------------------------------

function guidedTouchIIFE(): void {
  var KEY = 'guided_touch_seen';
  var CARD = '.decay-card[data-decay-factor]';
  var DELAY = 600;
  var SPOT_LEAD = 1200;
  var DRIFT = 2000;
  var WHISPER_HOLD = 2500;
  var MAX = 12000;
  var timers: number[] = [];
  var dead = false;

  if (!shouldRun()) return;
  markSeen();
  waitForChoreo(boot);

  // --- gate ----------------------------------------------------------------

  function shouldRun(): boolean {
    var rm = window.matchMedia
      && matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { if (localStorage.getItem(KEY) === '1') return false; }
    catch (e) { /* private browsing */ }
    if (rm) { showReducedPath(); return false; }
    return true;
  }

  function markSeen(): void {
    try { localStorage.setItem(KEY, '1'); }
    catch (e) { /* ignore */ }
  }

  // --- reduced motion path -------------------------------------------------

  function showReducedPath(): void {
    markSeen();
    var w = getWhisper();
    if (!w) return;
    w.textContent = 'posts fade over time \u2014 hover to revive them';
    w.classList.add('gt-whisper--visible');
    announce('Posts fade over time. Hover to revive them.');
    schedule(function () { fadeWhisper(w); }, 4000);
  }

  // --- wait for choreography -----------------------------------------------

  function waitForChoreo(cb: () => void): void {
    var cards = document.querySelectorAll(CARD);
    var target = cards.length ? pickTarget(cards) : null;
    if (!target) return;

    if (target.classList.contains('choreo-done')) {
      schedule(cb, DELAY);
      return;
    }
    observeChoreo(target, cb);
  }

  function observeChoreo(target: HTMLElement, cb: () => void): void {
    var mo = new MutationObserver(function (muts) {
      if (!hasChoreDone(muts)) return;
      mo.disconnect();
      schedule(cb, DELAY);
    });
    mo.observe(target, { attributes: true, attributeFilter: ['class'] });
    schedule(function () { mo.disconnect(); cb(); }, 4000);
  }

  function hasChoreDone(muts: MutationRecord[]): boolean {
    for (var i = 0; i < muts.length; i++) {
      if ((muts[i].target as HTMLElement).classList.contains('choreo-done'))
        return true;
    }
    return false;
  }

  // --- target selection ----------------------------------------------------

  function pickTarget(cards: NodeListOf<Element>): HTMLElement | null {
    var best: HTMLElement | null = null;
    var bestFactor = -1;
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i] as HTMLElement;
      var f = parseFloat(el.getAttribute('data-decay-factor') || '0');
      if (f > bestFactor) { bestFactor = f; best = el; }
    }
    return best;
  }

  // --- boot the demo -------------------------------------------------------

  function boot(): void {
    if (dead) return;
    var cards = document.querySelectorAll(CARD);
    var target = pickTarget(cards);
    if (!target) return;

    attachShortCircuit();
    schedule(function () { cleanup(); }, MAX);
    showSpotlight(target);
  }

  // --- spotlight -----------------------------------------------------------

  function showSpotlight(target: HTMLElement): void {
    var spot = getSpotlight();
    if (!spot || dead) return;

    positionOnTarget(spot, target);
    spot.classList.add('gt-spotlight--active');

    schedule(function () { showCursor(target); }, SPOT_LEAD);
  }

  function positionOnTarget(spot: HTMLElement, target: HTMLElement): void {
    var r = target.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    spot.style.setProperty('--gt-target-x', cx + 'px');
    spot.style.setProperty('--gt-target-y', cy + 'px');
  }

  // --- ghost cursor --------------------------------------------------------

  function showCursor(target: HTMLElement): void {
    if (dead) return;
    var cursor = getCursor();
    if (!cursor) return;

    setCursorTarget(cursor, target);
    setTooltipLabel();
    startCursorDrift(cursor);
    schedule(function () { onCursorArrived(target); }, DRIFT);
  }

  function setCursorTarget(cursor: HTMLElement, target: HTMLElement): void {
    var r = target.getBoundingClientRect();
    cursor.style.setProperty('--gt-target-x', (r.left + r.width / 2) + 'px');
    cursor.style.setProperty('--gt-target-y', (r.top + r.height / 2) + 'px');
  }

  function setTooltipLabel(): void {
    var tooltip = getTooltip();
    if (!tooltip) return;
    var coarse = matchMedia('(pointer: coarse)').matches;
    tooltip.textContent = coarse ? 'hold to revive' : 'hover to revive';
  }

  function startCursorDrift(cursor: HTMLElement): void {
    cursor.classList.add('gt-cursor--visible');
    requestAnimationFrame(function () {
      cursor.classList.add('gt-cursor--arriving');
    });
  }

  // --- cursor arrived → wait for real hover --------------------------------

  function onCursorArrived(target: HTMLElement): void {
    if (dead) return;
    var cursor = getCursor();
    if (cursor) cursor.classList.add('gt-cursor--done');

    listenForRevival(target);
  }

  function listenForRevival(target: HTMLElement): void {
    document.addEventListener('revival:success', function onRevive(e: Event) {
      document.removeEventListener('revival:success', onRevive);
      onRevivalSuccess();
    }, { once: true });
  }

  // --- revival success → whisper -------------------------------------------

  function onRevivalSuccess(): void {
    if (dead) return;
    fadeSpotlight();
    showWhisperMessage();
  }

  function showWhisperMessage(): void {
    var w = getWhisper();
    if (!w) return;
    w.textContent = 'your attention keeps them alive';
    w.classList.add('gt-whisper--visible');
    announce('Your attention keeps them alive.');

    schedule(function () { fadeWhisper(w); }, WHISPER_HOLD);
  }

  function fadeWhisper(w: HTMLElement): void {
    w.classList.remove('gt-whisper--visible');
    w.classList.add('gt-whisper--fading');
    schedule(function () { cleanup(); }, 800);
  }

  function fadeSpotlight(): void {
    var spot = getSpotlight();
    if (!spot) return;
    spot.classList.remove('gt-spotlight--active');
    spot.classList.add('gt-spotlight--fading');
  }

  // --- short-circuit on early interaction ----------------------------------

  function attachShortCircuit(): void {
    var feed = document.querySelector('.feed');
    if (!feed) return;
    feed.addEventListener('pointerenter', onEarlyTouch, true);
  }

  function onEarlyTouch(e: Event): void {
    var t = (e.target as HTMLElement).closest?.(CARD);
    if (!t) return;
    gracefulExit();
  }

  function gracefulExit(): void {
    fadeSpotlight();
    hideCursor();
    var w = getWhisper();
    if (w && !w.classList.contains('gt-whisper--visible')) {
      showExitWhisper(w);
    } else {
      schedule(function () { cleanup(); }, 800);
    }
  }

  function hideCursor(): void {
    var cursor = getCursor();
    if (cursor) cursor.classList.add('gt-cursor--done');
  }

  function showExitWhisper(w: HTMLElement): void {
    w.textContent = 'your attention keeps them alive';
    w.classList.add('gt-whisper--visible');
    announce('Your attention keeps them alive.');
    schedule(function () { fadeWhisper(w); }, WHISPER_HOLD);
  }

  // --- cleanup -------------------------------------------------------------

  function cleanup(): void {
    if (dead) return;
    dead = true;
    clearTimers();
    detachShortCircuit();
    ['gt-spotlight', 'gt-cursor', 'gt-whisper', 'gt-sr'].forEach(rmEl);
  }

  function clearTimers(): void {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }

  function detachShortCircuit(): void {
    var feed = document.querySelector('.feed');
    if (feed) feed.removeEventListener('pointerenter', onEarlyTouch, true);
  }

  function rmEl(id: string): void {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  // --- DOM element getters -------------------------------------------------

  function getSpotlight(): HTMLElement | null {
    return document.getElementById('gt-spotlight');
  }

  function getCursor(): HTMLElement | null {
    return document.getElementById('gt-cursor');
  }

  function getTooltip(): HTMLElement | null {
    return document.getElementById('gt-tooltip');
  }

  function getWhisper(): HTMLElement | null {
    return document.getElementById('gt-whisper');
  }

  // --- accessibility -------------------------------------------------------

  function announce(text: string): void {
    var sr = document.getElementById('gt-sr');
    if (sr) sr.textContent = text;
  }

  // --- timer utility -------------------------------------------------------

  function schedule(fn: () => void, ms: number): void {
    if (dead) return;
    timers.push(setTimeout(fn, ms) as unknown as number);
  }
}

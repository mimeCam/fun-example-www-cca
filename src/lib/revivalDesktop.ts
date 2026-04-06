// src/lib/revivalDesktop.ts
// Desktop revival strategies: hover-dwell (800ms) and keyboard hold (600ms).
// Both are composable fragments included by revivalController.ts.
//
// Keyboard path: Tab to a .decay-card article (tabindex="0"), hold Space/Enter
// for 600ms → same revival:start/progress/success/cancel event flow as touch.

/** Hover dwell duration before revival fires (ms). */
const DWELL_MS = 800;

/** Keyboard hold duration before revival fires (ms). */
const KB_HOLD_MS = 600;

/** Tick interval for keyboard progress ring (ms). */
const KB_TICK_MS = 16;

// ── Hover strategy ───────────────────────────────────────────────────────────

/** Returns inline JS fragment for desktop hover-dwell revival. */
export function desktopStrategyFragment(): string {
  return `
  function desktopStrategy(cards, send) {
    cards.forEach(function(el) {
      var timer = null;
      el.addEventListener('mouseenter', function() { startHover(el); });
      el.addEventListener('mouseleave', function() { cancelHover(); });
      function startHover(card) {
        var s = slug(card);
        if (!s || fired(s)) return;
        timer = setTimeout(function() { send(s, 'hover'); }, ${DWELL_MS});
      }
      function cancelHover() {
        if (timer) { clearTimeout(timer); timer = null; }
      }
    });
  }`;
}

// ── Keyboard strategy ────────────────────────────────────────────────────────
// Helper functions declared at IIFE scope so they share keyState without
// being nested inside keyboardStrategy (keeps each fn ≤ 10 lines).

/** Returns inline JS for keyboard-hold revival helpers (IIFE-scope). */
export function keyboardHelpersFragment(): string {
  return `
  var keyState=null;

  ${kbEmit.toString()}
  ${kbCenter.toString()}
  ${kbTick.toString()}
  ${kbComplete.toString()}
  ${kbCancel.toString()}
  ${kbStart.toString()}`;
}

/** Returns inline JS fragment for the keyboard event listeners. */
export function keyboardStrategyFragment(): string {
  return `
  function keyboardStrategy(cards, send) {
    document.addEventListener('keydown', function(e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.repeat || keyState) return;
      var card = e.target.matches && e.target.matches('.decay-card') ? e.target : null;
      if (!card) return;
      var s = slug(card);
      if (!s || fired(s)) return;
      e.preventDefault();
      kbStart(s, card, send);
    });
    document.addEventListener('keyup', function(e) {
      if (e.key === ' ' || e.key === 'Enter') kbCancel('keyup');
    });
    document.addEventListener('blur', function() { kbCancel('blur'); }, true);
  }`;
}

// ── Keyboard helper functions (serialised via toString()) ────────────────────
// Reference IIFE-scope vars: keyState, KB_HOLD, KB_TICK.

function kbEmit(name: string, detail: Record<string, unknown>): void {
  document.dispatchEvent(new CustomEvent('revival:' + name, { detail: detail }));
}

function kbCenter(card: HTMLElement): { x: number; y: number } {
  var r = card.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function kbTick(): void {
  if (!keyState) return;
  var p = Math.min((Date.now() - keyState.started) / KB_HOLD, 1);
  kbEmit('progress', { slug: keyState.slug, progress: p });
}

function kbComplete(): void {
  if (!keyState) return;
  clearInterval(keyState.tickTimer);
  kbEmit('progress', { slug: keyState.slug, progress: 1 });
  keyState.send(keyState.slug, 'keyboard');
  keyState = null;
}

function kbCancel(reason: string): void {
  if (!keyState) return;
  clearInterval(keyState.tickTimer);
  clearTimeout(keyState.holdTimer);
  kbEmit('cancel', { slug: keyState.slug, reason: reason });
  keyState = null;
}

function kbStart(s: string, card: HTMLElement, send: Function): void {
  var pos = kbCenter(card);
  keyState = { slug: s, started: Date.now(), send: send,
               tickTimer: null, holdTimer: null };
  kbEmit('start', { slug: s, x: pos.x, y: pos.y });
  keyState.tickTimer = setInterval(kbTick,     KB_TICK);
  keyState.holdTimer = setTimeout(kbComplete,  KB_HOLD);
}

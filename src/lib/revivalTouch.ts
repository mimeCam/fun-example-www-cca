// src/lib/revivalTouch.ts
// Touch revival strategy: press-and-hold with real-time visual feedback.
// Replaces longPressRevive.ts's "measure after the fact" approach with
// a timer-on-touchstart model where users SEE progress as it happens.
//
// Key behaviors:
// - 600ms hold threshold (shorter than desktop — thumb fatigue)
// - 10px move dead zone cancels revival (prevents scroll conflicts)
// - Emits revival:start, revival:progress, revival:cancel events
// - Vibration API pulses at 50% and 100% (progressive enhancement)

/** Hold duration before revival fires (ms). */
const HOLD_MS = 600;

/** Movement threshold that cancels revival (px). */
const MOVE_DEAD_ZONE = 10;

/** Progress tick interval for ring animation (ms). */
const TICK_MS = 16;

/** Returns inline JS fragment for touch hold revival. */
export function touchStrategyFragment(): string {
  return `
  function touchStrategy(cards, send) {
    if (!('ontouchstart' in window)) return;
    var state = null;

    function emitPhase(name, detail) {
      document.dispatchEvent(
        new CustomEvent('revival:' + name, { detail: detail })
      );
    }

    function vibrate(ms) {
      if (navigator.vibrate) navigator.vibrate(ms);
    }

    function distanceMoved(touch) {
      if (!state) return 0;
      var dx = touch.clientX - state.startX;
      var dy = touch.clientY - state.startY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function cancelRevival(reason) {
      if (!state) return;
      clearTimeout(state.holdTimer);
      clearInterval(state.tickTimer);
      emitPhase('cancel', {
        slug: state.slug, reason: reason
      });
      state = null;
    }

    function completeRevival() {
      if (!state) return;
      clearInterval(state.tickTimer);
      vibrate(30);
      var s = state.slug;
      emitPhase('progress', { slug: s, progress: 1 });
      send(s, 'touch');
      state = null;
    }

    function startTick() {
      var started = Date.now();
      state.tickTimer = setInterval(function() {
        if (!state) return;
        var elapsed = Date.now() - started;
        var progress = Math.min(elapsed / ${HOLD_MS}, 1);
        emitPhase('progress', {
          slug: state.slug, progress: progress
        });
        if (progress >= 0.5 && !state.halfPulsed) {
          state.halfPulsed = true;
          vibrate(15);
        }
      }, ${TICK_MS});
    }

    document.addEventListener('touchstart', function(e) {
      var card = e.target.closest('.decay-card');
      if (!card) return;
      var s = slug(card);
      if (!s || fired(s)) return;
      var touch = e.touches[0];
      state = {
        slug: s,
        card: card,
        startX: touch.clientX,
        startY: touch.clientY,
        halfPulsed: false,
        holdTimer: null,
        tickTimer: null
      };
      emitPhase('start', {
        slug: s,
        x: touch.clientX,
        y: touch.clientY
      });
      state.holdTimer = setTimeout(completeRevival, ${HOLD_MS});
      startTick();
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (!state) return;
      var touch = e.touches[0];
      if (distanceMoved(touch) > ${MOVE_DEAD_ZONE}) {
        cancelRevival('move');
      }
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (state) cancelRevival('lift');
    }, { passive: true });

    document.addEventListener('touchcancel', function() {
      cancelRevival('system');
    }, { passive: true });
  }`;
}

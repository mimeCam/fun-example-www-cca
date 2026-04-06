// src/lib/revivalTouch.ts
// Touch revival strategy: press-and-hold with real-time visual feedback.
// Replaces longPressRevive.ts's "measure after the fact" approach with
// a timer-on-touchstart model where users SEE progress as it happens.
//
// Key behaviors:
// - 600ms hold threshold (shorter than desktop — thumb fatigue)
// - 10px move dead zone cancels revival (prevents scroll conflicts)
// - Card lifts immediately on touch-start (instant feedback)
// - Settles back with ease-out if released early
// - Emits revival:start, revival:progress, revival:cancel events
// - Vibration API pulses at 50% and 100% (progressive enhancement)

/** Hold duration before revival fires (ms). */
const HOLD_MS = 600;

/** Movement threshold that cancels revival (px). */
const MOVE_DEAD_ZONE = 10;

/** Progress tick interval for ring animation (ms). */
const TICK_MS = 16;

/** Instant lift on touch-start (px). */
const TOUCH_LIFT_PX = 2;

/** Ease-out duration when touch releases early (ms). */
const SETTLE_MS = 200;

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
      try { if (navigator.vibrate) navigator.vibrate(ms); }
      catch(e) {}
    }

    function distanceMoved(touch) {
      if (!state) return 0;
      var dx = touch.clientX - state.startX;
      var dy = touch.clientY - state.startY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function liftCard(card) {
      card.style.transition = 'transform 80ms ease-out';
      card.style.transform = 'translateY(-${TOUCH_LIFT_PX}px)';
    }

    function settleCard(card) {
      card.style.transition = 'transform ${SETTLE_MS}ms ease-out';
      card.style.transform = '';
      setTimeout(function() {
        card.style.removeProperty('transition');
        card.style.removeProperty('transform');
      }, ${SETTLE_MS});
    }

    function cancelRevival(reason) {
      if (!state) return;
      clearTimeout(state.holdTimer);
      clearInterval(state.tickTimer);
      settleCard(state.card);
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
      settleCard(state.card);
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
      liftCard(card);
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

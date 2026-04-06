// src/lib/revivalDesktop.ts
// Desktop revival strategy: 800ms hover dwell on .decay-card elements.
// Extracted from the monolithic reviveClient.ts into a composable fragment.
// Used by revivalController.ts — not injected directly.

/** Hover dwell duration before revival fires. */
const DWELL_MS = 800;

/** Returns inline JS fragment for desktop hover-dwell revival. */
export function desktopStrategyFragment(): string {
  return `
  function desktopStrategy(cards, send) {
    cards.forEach(function(el) {
      var timer = null;
      el.addEventListener('mouseenter', function() {
        startHover(el);
      });
      el.addEventListener('mouseleave', function() {
        cancelHover();
      });
      function startHover(card) {
        var s = slug(card);
        if (!s || fired(s)) return;
        timer = setTimeout(function() {
          send(s, 'hover');
        }, ${DWELL_MS});
      }
      function cancelHover() {
        if (timer) { clearTimeout(timer); timer = null; }
      }
    });
  }`;
}

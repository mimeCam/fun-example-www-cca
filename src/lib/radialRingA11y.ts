// src/lib/radialRingA11y.ts
// ARIA live-region announcer for the radial-ring revival gesture.
// Listens to the same revival:* events as radialRing.ts and announces
// key milestones to screen readers via #revival-a11y-announce.
//
// Architecture: exports radialRingA11yScript() → inline IIFE string.
// Same pattern as radialRing.ts / revivalReward.ts.

/** Returns inline IIFE string for BaseLayout injection. */
export function radialRingA11yScript(): string {
  return `(function(){
  var halfAnnounced=false;

  ${findRegion.toString()}
  ${announce.toString()}
  ${onA11yStart.toString()}
  ${onA11yProgress.toString()}
  ${onA11ySuccess.toString()}
  ${onA11yCancel.toString()}

  document.addEventListener('revival:start',   onA11yStart);
  document.addEventListener('revival:progress', onA11yProgress);
  document.addEventListener('revival:success',  onA11ySuccess);
  document.addEventListener('revival:cancel',   onA11yCancel);
})();`;
}

// ── Fragment functions (serialised via toString()) ───────────────────────────
// These reference IIFE-scope vars: halfAnnounced.
// TypeScript strict mode will flag the bare names; Astro/esbuild transpiles
// without tsc type-checking so the build succeeds.

function findRegion() {
  return document.getElementById('revival-a11y-announce');
}

function announce(msg: string): void {
  var r = findRegion();
  if (!r) return;
  // Double-set: clear first so polite live region re-announces same text.
  r.textContent = '';
  requestAnimationFrame(function () { if (r) r.textContent = msg || ''; });
}

function onA11yStart(): void {
  halfAnnounced = false;
  announce('Reviving\u2026');
}

function onA11yProgress(e: any): void {
  var p = (e.detail || {}).progress || 0;
  if (!halfAnnounced && p >= 0.5) {
    halfAnnounced = true;
    announce('Almost there\u2026');
  }
}

function onA11ySuccess(): void {
  halfAnnounced = false;
  announce('Post revived!');
}

function onA11yCancel(): void {
  halfAnnounced = false;
  announce('');
}

// ── Sanity checks ────────────────────────────────────────────────────────────

export function _testRadialRingA11y(): void {
  const s = radialRingA11yScript();
  console.assert(s.includes('revival-a11y-announce'), 'targets live region element');
  console.assert(s.includes('revival:start'),    'listens to revival:start');
  console.assert(s.includes('revival:progress'), 'listens to revival:progress');
  console.assert(s.includes('revival:success'),  'listens to revival:success');
  console.assert(s.includes('revival:cancel'),   'listens to revival:cancel');
  console.assert(s.includes('Reviving'),         'announces start message');
  console.assert(s.includes('Post revived'),     'announces success message');
  console.log('[radialRingA11y] OK — events and messages verified');
}

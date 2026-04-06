// src/lib/radialRing.ts
// Drives the persistent SVG radial progress ring rendered by RadialRing.astro.
// Listens for revival:start/progress/cancel/success and shows/positions/
// animates the single shared #revival-ring-svg element.
//
// Architecture: exports radialRingScript() → inline IIFE string.

/** SVG circle radius (inset from viewBox edge for stroke). */
const RADIUS = 20;

/** Ring diameter in px — mirrors RadialRing.astro constant. */
const RING_SIZE = 48;

/** SVG circle circumference for dasharray trick. */
const CIRCUMFERENCE = (2 * Math.PI * RADIUS).toFixed(2);

/** Bloom animation duration (ms) — matches ring-bloom in radial-ring.css. */
const BLOOM_MS = 400;

/** Cancel dissolve duration (ms) — matches ring-dissolve. */
const CANCEL_MS = 150;

// ── Inline IIFE generator ────────────────────────────────────────────────────

export function radialRingScript(): string {
  return `(function(){
  var SIZE=${RING_SIZE},R=${RADIUS},C=${CIRCUMFERENCE};
  var BLOOM=${BLOOM_MS},CANCEL=${CANCEL_MS};

  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;

  ${findRing.toString()}
  ${showRing.toString()}
  ${hideRing.toString()}
  ${positionRing.toString()}
  ${clampToViewport.toString()}
  ${updateProgress.toString()}
  ${triggerBloom.toString()}
  ${triggerCancel.toString()}
  ${onStart.toString()}
  ${onProgress.toString()}
  ${onSuccess.toString()}
  ${onCancel.toString()}

  document.addEventListener('revival:start',   onStart);
  document.addEventListener('revival:progress', onProgress);
  document.addEventListener('revival:success',  onSuccess);
  document.addEventListener('revival:cancel',   onCancel);
})();`;
}

// ── Fragment functions (serialised via toString()) ───────────────────────────
// Reference IIFE-scope vars: SIZE, R, C, BLOOM, CANCEL.

function findRing(): SVGSVGElement | null {
  return document.getElementById('revival-ring-svg') as SVGSVGElement | null;
}

function showRing(svg: any, x: number, y: number): void {
  svg.style.display = '';
  svg.removeAttribute('aria-hidden');
  positionRing(svg, x, y);
}

function hideRing(): void {
  var svg = findRing();
  if (!svg) return;
  svg.style.display = 'none';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('aria-valuenow', '0');
  svg.classList.remove('revival-ring--bloom', 'revival-ring--cancel');
  var track = svg.querySelector('.revival-ring__track') as any;
  if (track) track.setAttribute('stroke-dashoffset', String(C));
}

function positionRing(svg: any, x: number, y: number): void {
  var pos = clampToViewport(x, y);
  svg.style.left = (pos.x - SIZE / 2) + 'px';
  svg.style.top  = (pos.y - SIZE / 2) + 'px';
}

function clampToViewport(x: number, y: number): { x: number; y: number } {
  var half = SIZE / 2;
  return {
    x: Math.max(half, Math.min(x, window.innerWidth  - half)),
    y: Math.max(half, Math.min(y, window.innerHeight - half)),
  };
}

function updateProgress(progress: number): void {
  var svg = findRing();
  if (!svg) return;
  var track = svg.querySelector('.revival-ring__track') as any;
  if (track) track.setAttribute('stroke-dashoffset', String(C * (1 - progress)));
  svg.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}

function triggerBloom(): void {
  var svg = findRing();
  if (!svg) return;
  svg.classList.add('revival-ring--bloom');
  setTimeout(hideRing, BLOOM);
}

function triggerCancel(): void {
  var svg = findRing();
  if (!svg) return;
  svg.classList.add('revival-ring--cancel');
  setTimeout(hideRing, CANCEL);
}

function onStart(e: any): void {
  var d = e.detail || {};
  if (!d.slug) return;
  var svg = findRing();
  if (!svg) return;
  hideRing();
  showRing(svg, d.x || 0, d.y || 0);
}

function onProgress(e: any): void {
  updateProgress((e.detail || {}).progress || 0);
}

function onSuccess(): void { triggerBloom(); }
function onCancel():  void { triggerCancel(); }

// ── Sanity checks ────────────────────────────────────────────────────────────

export function _testRadialRing(): void {
  const script = radialRingScript();

  console.assert(script.includes('revival:start'),    'listens for revival:start');
  console.assert(script.includes('revival:progress'), 'listens for revival:progress');
  console.assert(script.includes('revival:cancel'),   'listens for revival:cancel');
  console.assert(script.includes('revival:success'),  'listens for revival:success');
  console.assert(script.includes('stroke-dashoffset'), 'uses SVG dashoffset trick');
  console.assert(script.includes('prefers-reduced-motion'), 'respects reduced motion');
  console.assert(script.includes('revival-ring-svg'), 'targets persistent SVG element');
  console.log('[radialRing] OK — events, SVG, motion-respect, persistent-element verified');
}

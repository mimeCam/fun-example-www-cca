// src/lib/radialRing.ts
// SVG radial progress ring that visualises the touch-hold revival gesture.
// Listens for revival:start/progress/cancel/success events emitted by
// revivalTouch.ts and renders a filling circle at the touch point.
//
// Architecture: exports radialRingScript() → inline IIFE string.
// Same pattern as revivalReward.ts / bloomOrchestrator.ts.

/** Ring diameter in px — thumb-sized touch target. */
const RING_SIZE = 48;

/** SVG circle radius (inset from viewBox edge for stroke). */
const RADIUS = 20;

/** SVG circle circumference for dasharray trick. */
const CIRCUMFERENCE = (2 * Math.PI * RADIUS).toFixed(2);

/** Bloom animation duration (ms). */
const BLOOM_MS = 400;

/** Cancel dissolve duration (ms). */
const CANCEL_MS = 150;

/** Overlay z-index (above cards, below modals). */
const Z_INDEX = 40;

// ── Inline IIFE generator ────────────────────────────────

export function radialRingScript(): string {
  return `(function(){
  var SIZE=${RING_SIZE},R=${RADIUS},C=${CIRCUMFERENCE};
  var BLOOM=${BLOOM_MS},CANCEL=${CANCEL_MS},Z=${Z_INDEX};

  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;

  var overlay=null;
  var ring=null;

  ${createOverlay.toString()}
  ${createRingSVG.toString()}
  ${positionRing.toString()}
  ${clampToViewport.toString()}
  ${updateProgress.toString()}
  ${triggerBloom.toString()}
  ${triggerCancel.toString()}
  ${removeRing.toString()}
  ${onStart.toString()}
  ${onProgress.toString()}
  ${onSuccess.toString()}
  ${onCancel.toString()}

  document.addEventListener('revival:start',onStart);
  document.addEventListener('revival:progress',onProgress);
  document.addEventListener('revival:success',onSuccess);
  document.addEventListener('revival:cancel',onCancel);
})();`;
}

// ── Fragment functions (serialised via toString()) ───────

function createOverlay(): HTMLDivElement {
  var el = document.createElement('div');
  el.className = 'revival-ring-overlay';
  document.body.appendChild(el);
  return el;
}

function createRingSVG(): SVGSVGElement {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg') as any;
  svg.setAttribute('width', String(SIZE));
  svg.setAttribute('height', String(SIZE));
  svg.setAttribute('viewBox', '0 0 ' + SIZE + ' ' + SIZE);
  svg.setAttribute('class', 'revival-ring');
  svg.setAttribute('aria-hidden', 'true');

  var circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', String(SIZE / 2));
  circle.setAttribute('cy', String(SIZE / 2));
  circle.setAttribute('r', String(R));
  circle.setAttribute('stroke-dasharray', String(C));
  circle.setAttribute('stroke-dashoffset', String(C));
  circle.setAttribute('class', 'revival-ring__track');
  svg.appendChild(circle);
  return svg;
}

function positionRing(svg: any, x: number, y: number): void {
  var pos = clampToViewport(x, y);
  svg.style.left = (pos.x - SIZE / 2) + 'px';
  svg.style.top = (pos.y - SIZE / 2) + 'px';
}

function clampToViewport(x: number, y: number): { x: number; y: number } {
  var half = SIZE / 2;
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  return {
    x: Math.max(half, Math.min(x, vw - half)),
    y: Math.max(half, Math.min(y, vh - half))
  };
}

function updateProgress(progress: number): void {
  if (!ring) return;
  var track = ring.querySelector('.revival-ring__track') as any;
  if (track) track.setAttribute('stroke-dashoffset', String(C * (1 - progress)));
}

function triggerBloom(): void {
  if (!ring) return;
  ring.classList.add('revival-ring--bloom');
  setTimeout(function() { removeRing(); }, BLOOM);
}

function triggerCancel(): void {
  if (!ring) return;
  ring.classList.add('revival-ring--cancel');
  setTimeout(function() { removeRing(); }, CANCEL);
}

function removeRing(): void {
  if (ring && ring.parentNode) ring.parentNode.removeChild(ring);
  ring = null;
}

function onStart(e: any): void {
  var d = e.detail || {};
  if (!d.slug) return;
  removeRing();
  if (!overlay) overlay = createOverlay();
  ring = createRingSVG();
  positionRing(ring, d.x || 0, d.y || 0);
  overlay.appendChild(ring);
}

function onProgress(e: any): void {
  var d = e.detail || {};
  if (ring) updateProgress(d.progress || 0);
}

function onSuccess(): void {
  triggerBloom();
}

function onCancel(): void {
  triggerCancel();
}

// ── Sanity checks ────────────────────────────────────────

export function _testRadialRing(): void {
  const script = radialRingScript();

  console.assert(
    script.includes('revival:start'),
    'listens for revival:start',
  );
  console.assert(
    script.includes('revival:progress'),
    'listens for revival:progress',
  );
  console.assert(
    script.includes('revival:cancel'),
    'listens for revival:cancel',
  );
  console.assert(
    script.includes('revival:success'),
    'listens for revival:success',
  );
  console.assert(
    script.includes('stroke-dashoffset'),
    'uses SVG dashoffset trick',
  );
  console.assert(
    script.includes('prefers-reduced-motion'),
    'respects reduced motion',
  );
  console.log('[radialRing] OK — events, SVG, motion-respect verified');
}

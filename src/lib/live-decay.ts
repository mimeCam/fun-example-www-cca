// src/lib/live-decay.ts
// Client-side RAF loop that recomputes decay CSS vars from data-pub-date.
// Throttled to 1 recompute per minute — decay is slow, CPUs are precious.
// Replaces the one-shot liveDecayScript() from temporal.ts.
//
// Build-time values are the initial state (SSG, good for SEO).
// This script is the correction — imperceptible transition to true values.

const SELECTOR = '.decay-card[data-pub-date]';
const READY_SELECTOR = '.decay-card.choreo-done[data-pub-date]';
const MAX_DAYS = 365;
const MS_PER_DAY = 86_400_000;
const TICK_INTERVAL_MS = 60_000; // 1 minute
const CHOREO_FALLBACK_MS = 3_000; // wait max 3s for choreography

// ---------------------------------------------------------------------------
// Pure helpers (duplicated from decay.ts to keep the client bundle tiny —
// no import tree, no bundler, just an inline IIFE)
// ---------------------------------------------------------------------------

function revBonus(count: number): number {
  return Math.min(0.3, Math.log(count + 1) * 0.05);
}

function factor(pubMs: number, nowMs: number, revivals = 0): number {
  const raw = Math.min(1, Math.max(0, (nowMs - pubMs) / MS_PER_DAY / MAX_DAYS));
  return Math.max(0, raw - revBonus(revivals));
}

function opacity(f: number): string {
  return String(Math.max(0.35, 1 - f * 0.65));
}

function blur(f: number): string {
  return `${(f * 1.5).toFixed(2)}px`;
}

function saturation(f: number): string {
  return (1 - f * 0.4).toFixed(2);
}

function shadowY(f: number): string {
  return `${((1 - f) * 8).toFixed(1)}px`;
}

function shadowSpread(f: number): string {
  return `${((1 - f) * 32).toFixed(1)}px`;
}

function shadowAlpha(f: number): string {
  return ((1 - f) * 0.18).toFixed(3);
}

// ---------------------------------------------------------------------------
// DOM patching — sets all 6 CSS vars on one card element
// ---------------------------------------------------------------------------

function patchCard(el: HTMLElement, nowMs: number): void {
  const pubMs = new Date(el.dataset.pubDate!).getTime();
  const revivals = +(el.dataset.revivalCount || '0');
  const f = factor(pubMs, nowMs, revivals);
  el.style.setProperty('--decay-opacity', opacity(f));
  el.style.setProperty('--decay-blur', blur(f));
  el.style.setProperty('--decay-saturation', saturation(f));
  el.style.setProperty('--decay-shadow-y', shadowY(f));
  el.style.setProperty('--decay-shadow-spread', shadowSpread(f));
  el.style.setProperty('--decay-shadow-alpha', shadowAlpha(f));
}

// ---------------------------------------------------------------------------
// Tick loop — RAF-gated, throttled to 1/min
// ---------------------------------------------------------------------------

function startLoop(): void {
  let lastTick = 0;
  function tick(): void {
    const now = Date.now();
    if (now - lastTick >= TICK_INTERVAL_MS) {
      lastTick = now;
      const cards = document.querySelectorAll<HTMLElement>(READY_SELECTOR);
      cards.forEach(card => patchCard(card, now));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Inline script generator (for Astro <script set:html={...} />)
// ---------------------------------------------------------------------------

/** Returns a self-executing script body for BaseLayout injection. */
export function liveDecayScript(): string {
  return `(function(){
  var S='${READY_SELECTOR}',M=${MAX_DAYS},D=${MS_PER_DAY};
  var I=${TICK_INTERVAL_MS},L=0,FB=${CHOREO_FALLBACK_MS};
  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function f(p,n,r){var raw=Math.min(1,Math.max(0,(n-p)/D/M));return Math.max(0,raw-rb(r))}
  function patch(e,n){var r=+(e.dataset.revivalCount||'0');
    var d=f(new Date(e.dataset.pubDate).getTime(),n,r);
    e.style.setProperty('--decay-opacity',Math.max(.35,1-d*.65));
    e.style.setProperty('--decay-blur',(d*1.5).toFixed(2)+'px');
    e.style.setProperty('--decay-saturation',(1-d*.4).toFixed(2));
    e.style.setProperty('--decay-shadow-y',((1-d)*8).toFixed(1)+'px');
    e.style.setProperty('--decay-shadow-spread',((1-d)*32).toFixed(1)+'px');
    e.style.setProperty('--decay-shadow-alpha',((1-d)*.18).toFixed(3))}
  function tick(){var n=Date.now();if(n-L>=I){L=n;
    document.querySelectorAll(S).forEach(function(c){patch(c,n)})}
    requestAnimationFrame(tick)}
  setTimeout(function(){requestAnimationFrame(tick)},FB)
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testLiveDecay(): void {
  const f0 = factor(Date.now(), Date.now());
  console.assert(f0 === 0, `same-ms factor: expected 0, got ${f0}`);

  const yearAgo = Date.now() - MAX_DAYS * MS_PER_DAY;
  const f1 = factor(yearAgo, Date.now());
  console.assert(f1 === 1, `1-year factor: expected 1, got ${f1}`);

  console.assert(opacity(0) === '1', 'fresh opacity');
  console.assert(opacity(1) === '0.35', 'fossil opacity');
  console.assert(blur(0) === '0.00px', 'fresh blur');
  console.assert(shadowAlpha(0) === '0.180', 'fresh shadow alpha');
  console.assert(shadowAlpha(1) === '0.000', 'fossil shadow alpha');

  const script = liveDecayScript();
  console.assert(script.includes('requestAnimationFrame'), 'RAF present');
  console.assert(script.includes('data-pub-date'), 'selector present');
  console.log('[live-decay] OK — factor, visuals, script verified');
}

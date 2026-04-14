// src/lib/live-decay.ts
// Client-side RAF loop that recomputes decay CSS vars from data-pub-date.
// Throttled to 1 recompute per minute — decay is slow, CPUs are precious.
// Replaces the one-shot liveDecayScript() from temporal.ts.
//
// Build-time values are the initial state (SSG, good for SEO).
// This script is the correction — imperceptible transition to true values.

const SELECTOR = '.decay-card[data-pub-date]';
const READY_SELECTOR = '.decay-card.choreo-done[data-pub-date]';
const MAX_DAYS_FALLBACK = 365;
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

function readMaxDays(): number {
  const meta = document.querySelector('meta[name="decay-max-days"]');
  return meta ? +(meta as HTMLMetaElement).content || MAX_DAYS_FALLBACK : MAX_DAYS_FALLBACK;
}

function factor(pubMs: number, nowMs: number, revivals = 0, maxDays = MAX_DAYS_FALLBACK): number {
  const raw = Math.min(1, Math.max(0, (nowMs - pubMs) / MS_PER_DAY / maxDays));
  return Math.max(0, raw - revBonus(revivals));
}

/** easeInQuad perceptual curve — front-loads freshness, accelerates aging. */
function perceptual(f: number): number {
  return f * f;
}

/** Classify raw factor into discrete stage for data-decay-stage attribute. */
function stageOf(f: number): string {
  if (f >= 0.97) return 'fossil';
  if (f >= 0.75) return 'ghost';
  if (f >= 0.50) return 'endangered';
  if (f >= 0.25) return 'fading';
  return 'fresh';
}

function opacity(f: number): string {
  return String(Math.max(0.25, 1 - perceptual(f) * 0.75));
}

function blur(f: number): string {
  return `${(perceptual(f) * 2.5).toFixed(2)}px`;
}

function saturation(f: number): string {
  return (1 - perceptual(f) * 0.85).toFixed(2);
}

function sepia(f: number): string {
  return (perceptual(f) * 0.35).toFixed(3);
}

/** Staged grain — steeper curve; fossils should look textured. */
function grain(f: number): string {
  if (f < 0.2) return '0';
  if (f < 0.4) return '0.02';
  if (f < 0.6) return '0.08';
  if (f < 0.8) return '0.16';
  return '0.25';
}

function shadowY(f: number): string {
  return `${((1 - perceptual(f)) * 10).toFixed(1)}px`;
}

function shadowSpread(f: number): string {
  return `${((1 - perceptual(f)) * 40).toFixed(1)}px`;
}

function shadowAlpha(f: number): string {
  return ((1 - perceptual(f)) * 0.22).toFixed(3);
}

// ---------------------------------------------------------------------------
// DOM patching — sets all 6 CSS vars on one card element
// ---------------------------------------------------------------------------

function patchCard(el: HTMLElement, nowMs: number, maxDays: number): void {
  if (el.hasAttribute('data-bloom-lock')) return;
  const pubMs = new Date(el.dataset.pubDate!).getTime();
  const revivals = +(el.dataset.revivalCount || '0');
  const f = factor(pubMs, nowMs, revivals, maxDays);
  el.style.setProperty('--decay-opacity',       opacity(f));
  el.style.setProperty('--decay-blur',          blur(f));
  el.style.setProperty('--decay-saturation',    saturation(f));
  el.style.setProperty('--decay-sepia',         sepia(f));
  el.style.setProperty('--decay-grain',         grain(f));
  el.style.setProperty('--decay-factor',        f.toFixed(4));
  el.style.setProperty('--decay-perceptual',    perceptual(f).toFixed(4));
  el.style.setProperty('--decay-shadow-y',      shadowY(f));
  el.style.setProperty('--decay-shadow-spread', shadowSpread(f));
  el.style.setProperty('--decay-shadow-alpha',  shadowAlpha(f));
  const ns = stageOf(f);
  if (el.dataset.decayStage !== ns) el.dataset.decayStage = ns;
}

// ---------------------------------------------------------------------------
// Tick loop — RAF-gated, throttled to 1/min
// ---------------------------------------------------------------------------

function startLoop(): void {
  let lastTick = 0;
  const maxDays = readMaxDays();
  function tick(): void {
    const now = Date.now();
    if (now - lastTick >= TICK_INTERVAL_MS) {
      lastTick = now;
      const cards = document.querySelectorAll<HTMLElement>(READY_SELECTOR);
      cards.forEach(card => patchCard(card, now, maxDays));
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
  var S='${READY_SELECTOR}',D=${MS_PER_DAY};
  var mm=document.querySelector('meta[name="decay-max-days"]');
  var M=mm?+mm.content||${MAX_DAYS_FALLBACK}:${MAX_DAYS_FALLBACK};
  var I=${TICK_INTERVAL_MS},L=0,FB=${CHOREO_FALLBACK_MS},paused=false;
  function rb(c){return Math.min(.3,Math.log(c+1)*.05)}
  function pf(d){return d*d}
  function stg(d){return d>=.97?'fossil':d>=.75?'ghost':d>=.5?'endangered':d>=.25?'fading':'fresh'}
  function grn(d){return d<.2?'0':d<.4?'.02':d<.6?'.08':d<.8?'.16':'.25'}
  function f(p,n,r){var raw=Math.min(1,Math.max(0,(n-p)/D/M));return Math.max(0,raw-rb(r))}
  function patch(e,n){if(e.hasAttribute('data-bloom-lock'))return;var r=+(e.dataset.revivalCount||'0');
    var d=f(new Date(e.dataset.pubDate).getTime(),n,r);var p=pf(d);
    e.style.setProperty('--decay-opacity',Math.max(.25,1-p*.75));
    e.style.setProperty('--decay-blur',(p*2.5).toFixed(2)+'px');
    e.style.setProperty('--decay-saturation',(1-p*.85).toFixed(2));
    e.style.setProperty('--decay-sepia',(p*.35).toFixed(3));
    e.style.setProperty('--decay-grain',grn(d));
    e.style.setProperty('--decay-factor',d.toFixed(4));
    e.style.setProperty('--decay-perceptual',p.toFixed(4));
    e.style.setProperty('--decay-shadow-y',((1-p)*10).toFixed(1)+'px');
    e.style.setProperty('--decay-shadow-spread',((1-p)*40).toFixed(1)+'px');
    e.style.setProperty('--decay-shadow-alpha',((1-p)*.22).toFixed(3));
    var ns=stg(d);if(e.dataset.decayStage!==ns){e.dataset.decayStage=ns}}
  function tick(){if(!paused){var n=Date.now();if(n-L>=I){L=n;
    document.querySelectorAll(S).forEach(function(c){patch(c,n)})}}
    requestAnimationFrame(tick)}
  document.addEventListener('timetravel:seek',function(){paused=true});
  document.addEventListener('timetravel:exit',function(){paused=false;L=0});
  setTimeout(function(){requestAnimationFrame(tick)},FB)
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testLiveDecay(): void {
  const f0 = factor(Date.now(), Date.now());
  console.assert(f0 === 0, `same-ms factor: expected 0, got ${f0}`);

  const yearAgo = Date.now() - MAX_DAYS_FALLBACK * MS_PER_DAY;
  const f1 = factor(yearAgo, Date.now());
  console.assert(f1 === 1, `1-year factor: expected 1, got ${f1}`);

  console.assert(opacity(0) === '1', 'fresh opacity');
  console.assert(opacity(1) === '0.25', 'fossil opacity');
  console.assert(blur(0) === '0.00px', 'fresh blur');
  console.assert(shadowAlpha(0) === '0.220', 'fresh shadow alpha');
  console.assert(shadowAlpha(1) === '0.000', 'fossil shadow alpha');
  console.assert(perceptual(0.5) === 0.25, 'perceptual mid');
  console.assert(stageOf(0.6) === 'endangered', 'stage endangered');

  const script = liveDecayScript();
  console.assert(script.includes('requestAnimationFrame'), 'RAF present');
  console.assert(script.includes('data-pub-date'), 'selector present');
  console.assert(script.includes('decay-perceptual'), 'perceptual emitted');
  console.assert(script.includes('decayStage'), 'stage attr updated');
  console.log('[live-decay] OK — factor, visuals, script verified');
}

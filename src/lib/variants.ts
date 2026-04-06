// src/lib/variants.ts
// Seasonal Post Variants — makes blog content shift based on time of day
// and post age. Pure functions + inline script generator.
// No external dependencies. Graceful no-JS fallback (variants stay hidden).
//
// TODO: Absorb variantScript() IIFE into decayEngineClientScript() in decay-engine.ts.
// See Mike's freeze-sprawl directive. ageTier() is already a shim — remove once
// blog/[slug].astro is updated to use freshnessTag() from decay-engine directly.
// Active import in blog/[slug].astro — do NOT delete until then.

import { freshnessTag } from './decay-engine';

// ---------------------------------------------------------------------------
// Time-of-day phases: [startHour, endHour, label]
// ---------------------------------------------------------------------------

type TimePhase = 'night' | 'dawn' | 'morning' | 'noon'
  | 'afternoon' | 'golden-hour' | 'dusk' | 'evening';

const PHASE_RANGES: [number, number, TimePhase][] = [
  [0, 4, 'night'],
  [5, 6, 'dawn'],
  [7, 9, 'morning'],
  [10, 13, 'noon'],
  [14, 16, 'afternoon'],
  [17, 18, 'golden-hour'],
  [19, 20, 'dusk'],
  [21, 23, 'evening'],
];

type WitnessState = 'sun' | 'moon' | 'asleep';

const STATE_RANGES: [number, number, WitnessState][] = [
  [0, 4, 'asleep'],
  [5, 6, 'moon'],
  [7, 18, 'sun'],
  [19, 20, 'moon'],
  [21, 23, 'asleep'],
];

/** Resolve time phase from hour. */
function hourToPhase(h: number): TimePhase {
  const m = PHASE_RANGES.find(([s, e]) => h >= s && h <= e);
  return m ? m[2] : 'noon';
}

/** Resolve celestial state from hour. */
function hourToWitness(h: number): WitnessState {
  const m = STATE_RANGES.find(([s, e]) => h >= s && h <= e);
  return m ? m[2] : 'moon';
}

// ---------------------------------------------------------------------------
// Age tier resolution — shim over decay-engine freshnessTag()
// Single source of truth: decay-engine.ts. ageTier() kept for compatibility.
// ---------------------------------------------------------------------------

type AgeTier = 'fresh' | 'aged' | 'fossil';

/**
 * Buckets days-since-publish into fresh / aged / fossil.
 * Shim over freshnessTag() — converts decay-factor tags to unified tier names.
 * Thresholds now align with freshnessTag() (decay-factor based, maxDays=365):
 *   fresh  → < 73 days  (factor < 0.2)
 *   aged   → 73–292 days (factor 0.2–0.8)
 *   fossil → > 292 days  (factor >= 0.8)
 * Do not add new callers: use freshnessTag() from decay-engine directly.
 */
export function ageTier(days: number): AgeTier {
  const factor = Math.min(1, days / 365);
  const tag = freshnessTag(factor);
  if (tag === 'fossil') return 'fossil';
  if (tag === 'aged' || tag === 'settling') return 'aged';
  return 'fresh';
}

// ---------------------------------------------------------------------------
// Inline script generator — runs at visit time, toggles .variant visibility
// ---------------------------------------------------------------------------

/**
 * Returns a self-contained <script> body that evaluates .variant elements.
 * Expects the post container to carry data-pub-date="<ISO string>".
 */
export function variantScript(): string {
  const phases = JSON.stringify(PHASE_RANGES);
  const states = JSON.stringify(STATE_RANGES);
  return [
    `(function(){`,
    `  var a=document.querySelector('[data-pub-date]');`,
    `  if(!a)return;`,
    `  var h=new Date().getHours();`,
    `  var P=${phases};`,
    `  var pm=P.find(function(r){return h>=r[0]&&h<=r[1]});`,
    `  var phase=pm?pm[2]:'noon';`,
    `  var S=${states};`,
    `  var sm=S.find(function(r){return h>=r[0]&&h<=r[1]});`,
    `  var witness=sm?sm[2]:'moon';`,
    `  var pub=new Date(a.dataset.pubDate).getTime();`,
    `  var days=Math.max(0,Math.floor((Date.now()-pub)/864e5));`,
    `  var f=Math.min(1,days/365);`,
    `  var tier=f>=0.8?'fossil':f>=0.2?'aged':'fresh';`,
    `  a.querySelectorAll('.variant').forEach(function(el){`,
    `    var w=el.dataset.when||'';`,
    `    var on=(w===phase||w===witness||w===tier);`,
    `    el.setAttribute('data-active',on?'true':'false');`,
    `  });`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testVariants(): void {
  console.assert(hourToPhase(2) === 'night', 'hour 2 = night');
  console.assert(hourToWitness(2) === 'asleep', 'hour 2 = asleep');
  // ageTier thresholds now match freshnessTag() (decay-factor based, maxDays=365)
  console.assert(ageTier(100) === 'aged',   '100 days = aged');
  console.assert(ageTier(0)   === 'fresh',  '0 days = fresh');
  console.assert(ageTier(300) === 'fossil', '300 days = fossil (factor ≥ 0.8 at 292d)');
  console.assert(ageTier(180) === 'aged',   '180 days = aged (unified thresholds)');
  const s = variantScript();
  console.assert(s.includes('data-active'), 'script toggles data-active');
  console.assert(s.includes('f>=0.8'), 'script uses decay-factor thresholds');
  console.log('[variants] OK');
}

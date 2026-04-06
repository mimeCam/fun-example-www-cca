// src/lib/variants.ts
// TODO: consolidate into decay-engine client script (Mike's freeze-sprawl directive).
// Active import in blog/[slug].astro — do NOT delete.
//
// Seasonal Post Variants — makes blog content shift based on time of day
// and post age. Pure functions + inline script generator.
// No external dependencies. Graceful no-JS fallback (variants stay hidden).

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
// Age tier resolution
// ---------------------------------------------------------------------------

type AgeTier = 'fresh' | 'aged' | 'fossil';

/** Buckets days-since-publish into fresh / aged / fossil. */
export function ageTier(days: number): AgeTier {
  if (days >= 180) return 'fossil';
  if (days >= 30) return 'aged';
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
    `  var tier=days>=180?'fossil':days>=30?'aged':'fresh';`,
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
  console.assert(ageTier(100) === 'aged', '100 days = aged');
  console.assert(ageTier(0) === 'fresh', '0 days = fresh');
  console.assert(ageTier(180) === 'fossil', '180 days = fossil');
  const s = variantScript();
  console.assert(s.includes('data-active'), 'script toggles data-active');
  console.log('[variants] OK');
}

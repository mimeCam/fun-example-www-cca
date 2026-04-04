// src/lib/hearth.ts
// The Hearth — convergence sentence engine.
// Combines time-of-day, celestial state, and blog age into a single
// poetic sentence. Pre-computed at build time; inline script picks
// the right variant by visitor's local hour.
//
// No dependencies beyond sibling lib modules.
// No runtime generation — all sentences are hand-authored templates.

import { type TimePhase, hourToPhase } from './timeAmbient';
import { type WitnessState, hourToWitnessState } from './celestialWitness';
import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Blog age tiers — tone shifts as the site matures
// ---------------------------------------------------------------------------

type AgeTier = 'kindling' | 'steady' | 'coals' | 'ancient';

const AGE_THRESHOLDS: [number, AgeTier][] = [
  [1095, 'ancient'],  // 3+ years
  [365,  'coals'],    // 1–3 years
  [90,   'steady'],   // 91–365 days
  [0,    'kindling'], // 0–90 days
];

/** Classify blog age into a tone tier. */
export function ageTier(days: number): AgeTier {
  const match = AGE_THRESHOLDS.find(([min]) => days >= min);
  return match ? match[1] : 'kindling';
}

// ---------------------------------------------------------------------------
// Sentence templates — keyed by [ageTier][celestialState]
// ---------------------------------------------------------------------------

const SENTENCES: Record<AgeTier, Record<WitnessState, string[]>> = {
  kindling: {
    sun:    ['A young fire, still catching, warmed by daylight.'],
    moon:   ['New flames flicker under the evening sky.'],
    asleep: ['A small fire keeps watch while the world sleeps.'],
  },
  steady: {
    sun:    ['The fire has learned your name; the sun agrees.'],
    moon:   ['Steady flames and a patient moon tonight.'],
    asleep: ['The fire burns on, long after midnight.'],
  },
  coals: {
    sun:    ['Old coals glow beneath the ash, bright in daylight.'],
    moon:   ['Deep embers remember every moonlit visit.'],
    asleep: ['Coals hold warmth through the quietest hours.'],
  },
  ancient: {
    sun:    ['This hearth has burned longer than some friendships.'],
    moon:   ['An ancient fire, moonlit and unbothered.'],
    asleep: ['Still burning at this hour — some fires never ask permission.'],
  },
};

/** Pick a sentence for the given tier and celestial state. */
export function pickSentence(
  tier: AgeTier,
  state: WitnessState,
): string {
  const pool = SENTENCES[tier][state];
  return pool[0];
}

// ---------------------------------------------------------------------------
// Build-time: generate all 3 celestial variants for current blog age
// ---------------------------------------------------------------------------

/** Site birthday — first published post. */
const SITE_BIRTHDAY = '2026-04-04';

/** Returns { sun, moon, asleep } sentence map for current blog age. */
export function buildHearthVariants(now = new Date()): Record<WitnessState, string> {
  const days = daysSince(SITE_BIRTHDAY, now);
  const tier = ageTier(days);
  return {
    sun:    pickSentence(tier, 'sun'),
    moon:   pickSentence(tier, 'moon'),
    asleep: pickSentence(tier, 'asleep'),
  };
}

// ---------------------------------------------------------------------------
// Inline script — picks the right sentence at visit time
// ---------------------------------------------------------------------------

/** Returns a self-contained <script> body for client-side sentence selection. */
export function hearthScript(variants: Record<WitnessState, string>): string {
  const data = JSON.stringify(variants);
  const ranges = JSON.stringify([
    [0, 5, 'asleep'],
    [6, 17, 'sun'],
    [18, 23, 'moon'],
  ]);
  return [
    '(function(){',
    `  var V=${data};`,
    `  var R=${ranges};`,
    '  var h=new Date().getHours();',
    '  var m=R.find(function(r){return h>=r[0]&&h<=r[1]});',
    '  var el=document.getElementById("hearth-sentence");',
    '  if(m&&el)el.textContent=V[m[2]];',
    '})();',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testHearth(): void {
  const tier = ageTier(0);
  console.assert(tier === 'kindling', `0 days should be kindling, got ${tier}`);
  console.assert(ageTier(100) === 'steady', 'ageTier(100)');
  console.assert(ageTier(500) === 'coals', 'ageTier(500)');
  console.assert(ageTier(2000) === 'ancient', 'ageTier(2000)');

  const v = buildHearthVariants(new Date('2026-04-04'));
  console.assert(v.sun.length > 0, 'sun variant empty');
  console.assert(v.moon.length > 0, 'moon variant empty');
  console.assert(v.asleep.length > 0, 'asleep variant empty');

  const script = hearthScript(v);
  console.assert(script.includes('hearth-sentence'), 'script missing element ID');
  console.log('[hearth] OK — age tiers, variants, script verified');
}

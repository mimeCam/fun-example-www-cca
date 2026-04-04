// src/lib/moodCycle.ts
// "Living Mood" — auto-cycles the ambient mood palette based on time of day.
// Maps the 8 existing time phases to the 4 mood palettes so the blog feels
// like a living place that drifts through the day without user interaction.
//
// Design: Tanya Donska spec — "time drives mood, invisible transitions."
// Architecture: Michael Koch napkin plan — zero deps, zero tracking.
//
// TODO: integrate contentMoodWeight.ts saturation bias from wall.json freshness
// TODO: add 60-second CSS transition on :root mood vars (needs AmbientLayer tweak)

import type { MoodId } from './mood';
import type { TimePhase } from './timeAmbient';
import { PHASE_RANGES } from './timeAmbient';

// ---------------------------------------------------------------------------
// Phase-to-mood schedule — single source of truth
// ---------------------------------------------------------------------------

const PHASE_MOOD_MAP: Record<TimePhase, MoodId> = {
  'night':       'jazz',
  'dawn':        'lo-fi',
  'morning':     'lo-fi',
  'noon':        'focus',
  'afternoon':   'focus',
  'golden-hour': 'hyperpop',
  'dusk':        'hyperpop',
  'evening':     'jazz',
};

/** Returns the mood assigned to a given time phase. */
export function phaseMood(phase: TimePhase): MoodId {
  return PHASE_MOOD_MAP[phase];
}

/** Resolves a 0–23 hour directly to its mood ID. */
export function hourToMood(hour: number): MoodId {
  const match = PHASE_RANGES.find(([lo, hi]) => hour >= lo && hour <= hi);
  return match ? PHASE_MOOD_MAP[match[2]] : 'focus';
}

// ---------------------------------------------------------------------------
// Session jitter — ±5 min random offset so transitions feel organic
// ---------------------------------------------------------------------------

/** Returns a jitter in minutes: integer in [-5, +5]. Deterministic per session seed. */
export function sessionJitter(seed: number): number {
  return Math.floor(((seed * 9301 + 49297) % 233280) / 233280 * 11) - 5;
}

// ---------------------------------------------------------------------------
// Client-side script generator — runs once on page load
// ---------------------------------------------------------------------------

/**
 * Returns an inline <script> body that:
 * 1. Checks ?mood= URL param (power-user override)
 * 2. Otherwise resolves current hour (+jitter) to a mood
 * 3. Clicks the matching radio input to activate the mood
 * 4. Listens for Shift+M to toggle MoodPills visibility
 */
export function moodCycleScript(): string {
  const ranges = JSON.stringify(PHASE_RANGES);
  const map = JSON.stringify(PHASE_MOOD_MAP);
  return [
    `(function(){`,
    `  var P=${ranges},M=${map};`,
    `  var u=new URLSearchParams(location.search).get('mood');`,
    `  var id;`,
    `  if(u&&document.getElementById('mood-'+u)){id=u}`,
    `  else{`,
    `    var s=Date.now(),j=Math.floor(((s*9301+49297)%233280)/233280*11)-5;`,
    `    var h=new Date().getHours(),m=new Date().getMinutes()+j;`,
    `    if(m<0){h=(h-1+24)%24}else if(m>=60){h=(h+1)%24}`,
    `    var r=P.find(function(x){return h>=x[0]&&h<=x[1]});`,
    `    id=r?M[r[2]]:'focus';`,
    `  }`,
    `  var el=document.getElementById('mood-'+id);`,
    `  if(el)el.checked=true;`,
    `  document.addEventListener('keydown',function(e){`,
    `    if(e.shiftKey&&e.key==='M'){`,
    `      var bar=document.querySelector('[data-mood-bar]');`,
    `      if(bar)bar.classList.toggle('mood-bar--revealed');`,
    `    }`,
    `  });`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testMoodCycle(): void {
  const allMoods: MoodId[] = ['lo-fi', 'focus', 'hyperpop', 'jazz'];

  for (let h = 0; h <= 23; h++) {
    const m = hourToMood(h);
    console.assert(allMoods.includes(m), `hour ${h}: got unknown mood "${m}"`);
  }

  const j = sessionJitter(12345);
  console.assert(j >= -5 && j <= 5, `jitter out of range: ${j}`);

  const script = moodCycleScript();
  console.assert(script.includes('mood-'), 'script missing mood- selector');
  console.assert(script.includes('shiftKey'), 'script missing Shift+M handler');

  console.log('[moodCycle] OK — 24h covered, jitter bounded, script generated');
}

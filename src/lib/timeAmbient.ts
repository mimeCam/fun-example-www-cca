// src/lib/timeAmbient.ts
// Maps the visitor's local hour to subtle CSS tint overrides.
// Pure functions — consumed by an inline <script> on the client.
// No server, no API, no dependencies. Graceful no-JS fallback
// (all CSS vars default to transparent/0 so nothing breaks).
//
// Seasonal tint adjustments are handled by seasonal.ts (--season-hue-shift,
// --season-sat-mult, --season-opacity-mult) and applied via CSS filter on
// AmbientLayer. The two systems compose without coupling.
// TODO: merge seasonal temp bias into time-of-day tints for deeper integration
// Dissolve transition at phase boundaries handled by dissolve.ts

import { dissolveConfig, DISSOLVE_TIMING } from './dissolve';

export type TimePhase =
  | 'night'       // 00–05
  | 'dawn'        // 06–07
  | 'morning'     // 08–10
  | 'noon'        // 11–13
  | 'afternoon'   // 14–16
  | 'golden-hour' // 17–18
  | 'dusk'        // 19–20
  | 'evening';    // 21–23

export interface TimeTint {
  hue: string;        // CSS color for overlay
  opacity: number;    // 0.00–0.06; kept subtle to avoid contrast issues
  label: string;      // human-readable for debugging / aria
}

// ---------------------------------------------------------------------------
// Phase resolution — one pure lookup, no branching chains
// ---------------------------------------------------------------------------

export const PHASE_RANGES: [number, number, TimePhase][] = [
  [ 0,  5, 'night'],
  [ 6,  7, 'dawn'],
  [ 8, 10, 'morning'],
  [11, 13, 'noon'],
  [14, 16, 'afternoon'],
  [17, 18, 'golden-hour'],
  [19, 20, 'dusk'],
  [21, 23, 'evening'],
];

/** Resolves a 0–23 hour to its TimePhase. */
export function hourToPhase(hour: number): TimePhase {
  const match = PHASE_RANGES.find(([lo, hi]) => hour >= lo && hour <= hi);
  return match ? match[2] : 'noon';
}

// ---------------------------------------------------------------------------
// Tint registry — single source of truth for every time-of-day palette
// ---------------------------------------------------------------------------

const TINTS: Record<TimePhase, TimeTint> = {
  'night':       { hue: '#1a1a3e', opacity: 0.06, label: 'deep night' },
  'dawn':        { hue: '#e8a87c', opacity: 0.04, label: 'early dawn' },
  'morning':     { hue: '#f5e6ca', opacity: 0.02, label: 'soft morning' },
  'noon':        { hue: 'transparent', opacity: 0,    label: 'high noon' },
  'afternoon':   { hue: '#f0d9b5', opacity: 0.02, label: 'warm afternoon' },
  'golden-hour': { hue: '#d4956a', opacity: 0.05, label: 'golden hour' },
  'dusk':        { hue: '#6b4c8a', opacity: 0.04, label: 'twilight dusk' },
  'evening':     { hue: '#2d1b4e', opacity: 0.05, label: 'late evening' },
};

/** Returns tint values for a given phase. */
export function phaseTint(phase: TimePhase): TimeTint {
  return TINTS[phase];
}

/** Shortcut: hour → tint in one call. */
export function hourToTint(hour: number): TimeTint {
  return phaseTint(hourToPhase(hour));
}

// ---------------------------------------------------------------------------
// CSS var names — shared between inline script and AmbientLayer
// ---------------------------------------------------------------------------

export const TIME_CSS_VARS = {
  tint: '--time-tint',
  opacity: '--time-tint-opacity',
} as const;

// ---------------------------------------------------------------------------
// Inline script generator — called at build time, runs at visit time.
// Polls every 60s; on phase boundary triggers dissolve choreography.
// ---------------------------------------------------------------------------

/** Resolves phase name from hour (inline-friendly helper). */
function phaseFinderSnippet(): string {
  return `function gp(h,P){var r=P.find(function(x){return h>=x[0]&&h<=x[1]});return r?r[2]:'noon'}`;
}

/** Returns a self-contained <script> body that sets time CSS vars on :root. */
export function timeAmbientScript(): string {
  const phases = JSON.stringify(PHASE_RANGES);
  const tints = JSON.stringify(TINTS);
  const lim = dissolveConfig();
  const { fadeOut, liminal, settle } = DISSOLVE_TIMING;
  return [
    `(function(){`,
    `  var P=${phases},T=${tints},L=${lim};`,
    `  ${phaseFinderSnippet()}`,
    `  var s=document.documentElement.style;`,
    `  var cur=gp(new Date().getHours(),P);`,
    `  function apply(t){s.setProperty('${TIME_CSS_VARS.tint}',t.hue);s.setProperty('${TIME_CSS_VARS.opacity}',String(t.opacity))}`,
    `  apply(T[cur]);`,
    `  setInterval(function(){`,
    `    var nxt=gp(new Date().getHours(),P);`,
    `    if(nxt===cur)return;`,
    `    var key=cur+'→'+nxt,li=L[key];`,
    `    cur=nxt;`,
    `    if(!li){apply(T[nxt]);return}`,
    `    s.setProperty('${TIME_CSS_VARS.opacity}','0');`,
    `    setTimeout(function(){`,
    `      s.setProperty('${TIME_CSS_VARS.tint}',li.color);`,
    `      s.setProperty('${TIME_CSS_VARS.opacity}',String(li.peakOpacity));`,
    `    },${fadeOut});`,
    `    setTimeout(function(){apply(T[nxt])},${fadeOut + liminal});`,
    `  },60000);`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testTimeAmbient(): void {
  for (let h = 0; h <= 23; h++) {
    const t = hourToTint(h);
    console.assert(t.opacity >= 0 && t.opacity <= 0.06, `hour ${h}: opacity out of range`);
    console.assert(t.label.length > 0, `hour ${h}: missing label`);
  }
  const script = timeAmbientScript();
  console.assert(script.includes('setProperty'), 'script missing setProperty call');
  console.assert(script.includes('setInterval'), 'script missing boundary polling');
  console.assert(script.includes('→'), 'script missing dissolve boundary keys');
  console.log('[timeAmbient] OK — 24h covered, dissolve wired, script generated');
}

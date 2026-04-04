// src/lib/celestialWitness.ts
// Resolves the Celestial Witness state from the visitor's local hour.
// Pure functions — consumed by an inline <script> on the client.
// No server, no API, no dependencies. Graceful no-JS fallback
// (witness simply stays hidden if script never runs).
//
// States: sun (day), moon (night), asleep (late night).
// The mood glow piggybacks on --mood-accent-rgb set by the mood system.

export type WitnessState = 'sun' | 'moon' | 'asleep';

export const STATE_RANGES: [number, number, WitnessState][] = [
  [ 0,  5, 'asleep'],
  [ 6, 17, 'sun'],
  [18, 23, 'moon'],
];

/** Maps a 0-23 hour to a WitnessState. */
export function hourToWitnessState(hour: number): WitnessState {
  const match = STATE_RANGES.find(([lo, hi]) => hour >= lo && hour <= hi);
  return match ? match[2] : 'moon';
}

/** Returns a self-contained script body that activates the witness at visit time. */
export function celestialWitnessScript(): string {
  const ranges = JSON.stringify(STATE_RANGES);
  return [
    `(function(){`,
    `  var el=document.getElementById('celestial-witness');`,
    `  if(!el)return;`,
    `  var h=new Date().getHours();`,
    `  var R=${ranges};`,
    `  var m=R.find(function(r){return h>=r[0]&&h<=r[1]});`,
    `  if(m)el.setAttribute('data-state',m[2]);`,
    `  el.style.opacity='1';`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testCelestialWitness(): void {
  for (let h = 0; h <= 23; h++) {
    const s = hourToWitnessState(h);
    console.assert(['sun', 'moon', 'asleep'].includes(s), `hour ${h}: invalid state`);
  }
  console.assert(hourToWitnessState(3) === 'asleep', '3 AM should be asleep');
  console.assert(hourToWitnessState(10) === 'sun', '10 AM should be sun');
  console.assert(hourToWitnessState(21) === 'moon', '9 PM should be moon');
  const script = celestialWitnessScript();
  console.assert(script.includes('celestial-witness'), 'script missing element ID');
  console.log('[celestialWitness] OK — 24 hours covered, script generated');
}

// src/lib/seasonal.ts
// Maps the visitor's calendar date to subtle seasonal modifiers.
// Pure functions — consumed by an inline <script> on the client.
// No server, no API, no dependencies. Graceful no-JS fallback
// (all CSS vars default to neutral values so nothing breaks).
//
// The core idea: sinusoidal interpolation between four seasonal
// anchor points (solstices & equinoxes) produces smooth, continuous
// "drift" — seasons never snap, they arrive gradually.

export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn';

export interface SeasonAnchor {
  day: number;          // day-of-year (0–365) when this season peaks
  hueShift: number;     // degrees to bias mood hue (negative = cooler)
  satMult: number;      // chroma multiplier (< 1 = muted, > 1 = vivid)
  opacityMult: number;  // mood opacity multiplier (safety lever)
  name: SeasonName;
}

export interface SeasonalModifiers {
  hueShift: number;
  satMult: number;
  opacityMult: number;
  season: SeasonName;
}

// ---------------------------------------------------------------------------
// Anchor config — peaks at solstices/equinoxes (Northern Hemisphere)
// ---------------------------------------------------------------------------

export const ANCHORS: SeasonAnchor[] = [
  { day: 355, hueShift: -3,   satMult: 0.93, opacityMult: 0.95, name: 'winter' },
  { day:  80, hueShift:  1.5, satMult: 1.06, opacityMult: 1.00, name: 'spring' },
  { day: 172, hueShift:  3,   satMult: 1.04, opacityMult: 1.02, name: 'summer' },
  { day: 266, hueShift: -1,   satMult: 0.98, opacityMult: 0.98, name: 'autumn' },
];

// ---------------------------------------------------------------------------
// Pure functions — deterministic, testable with explicit day values
// ---------------------------------------------------------------------------

/** Extracts 0-based day-of-year from a Date. */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** Finds the two nearest anchors and interpolates between them. */
export function getSeasonalModifiers(day: number): SeasonalModifiers {
  const sorted = anchorsForDay(day);
  const [prev, next] = sorted;
  const t = interpolationFactor(day, prev.day, next.day);
  return {
    hueShift:    lerp(prev.hueShift, next.hueShift, t),
    satMult:     lerp(prev.satMult, next.satMult, t),
    opacityMult: lerp(prev.opacityMult, next.opacityMult, t),
    season:      t < 0.5 ? prev.name : next.name,
  };
}

/** Returns [prev, next] anchors surrounding the given day. */
function anchorsForDay(day: number): [SeasonAnchor, SeasonAnchor] {
  const wrapped = ((day % 366) + 366) % 366;
  const sorted = [...ANCHORS].sort((a, b) => a.day - b.day);
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[(i + 1) % sorted.length];
    const curr = sorted[i];
    if (isInArc(wrapped, curr.day, next.day)) {
      return [curr, next];
    }
  }
  return [sorted[0], sorted[1]];
}

/** Checks if `day` falls in the arc from `a` to `b` (wrapping at 366). */
function isInArc(day: number, a: number, b: number): boolean {
  if (a <= b) return day >= a && day < b;
  return day >= a || day < b;
}

/** Cosine interpolation factor (0→1) for smooth seasonal drift. */
function interpolationFactor(day: number, fromDay: number, toDay: number): number {
  const arc = arcLength(fromDay, toDay);
  const pos = arcLength(fromDay, day);
  const linear = arc === 0 ? 0 : pos / arc;
  return (1 - Math.cos(linear * Math.PI)) / 2;
}

/** Arc length from a to b on a 366-day circle. */
function arcLength(a: number, b: number): number {
  return ((b - a) + 366) % 366;
}

/** Simple linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// CSS var names — shared between inline script and AmbientLayer
// ---------------------------------------------------------------------------

export const SEASON_CSS_VARS = {
  hueShift:    '--season-hue-shift',
  satMult:     '--season-sat-mult',
  opacityMult: '--season-opacity-mult',
} as const;

// ---------------------------------------------------------------------------
// Inline script generator — called at build time, runs at visit time
// ---------------------------------------------------------------------------

/** Returns a self-contained <script> body that sets seasonal CSS vars on :root. */
export function seasonalScript(): string {
  const anchors = JSON.stringify(ANCHORS);
  // Embed the algorithm as a compact inline script
  return [
    `(function(){`,
    `  var A=${anchors};`,
    `  var d=new Date(),s=new Date(d.getFullYear(),0,0);`,
    `  var day=Math.floor((d-s)/864e5);`,
    `  function arc(a,b){return((b-a)+366)%366}`,
    `  function inArc(d,a,b){return a<=b?d>=a&&d<b:d>=a||d<b}`,
    `  var S=A.slice().sort(function(a,b){return a.day-b.day});`,
    `  var p=S[0],n=S[1];`,
    `  for(var i=0;i<S.length;i++){`,
    `    var nx=S[(i+1)%S.length];`,
    `    if(inArc(day%366,S[i].day,nx.day)){p=S[i];n=nx;break}`,
    `  }`,
    `  var a=arc(p.day,n.day),pos=arc(p.day,day%366);`,
    `  var t=a===0?0:(1-Math.cos(pos/a*Math.PI))/2;`,
    `  function mix(a,b){return a+(b-a)*t}`,
    `  var r=document.documentElement.style;`,
    `  r.setProperty('${SEASON_CSS_VARS.hueShift}',mix(p.hueShift,n.hueShift)+'deg');`,
    `  r.setProperty('${SEASON_CSS_VARS.satMult}',String(mix(p.satMult,n.satMult)));`,
    `  r.setProperty('${SEASON_CSS_VARS.opacityMult}',String(mix(p.opacityMult,n.opacityMult)));`,
    `  document.documentElement.setAttribute('data-season',t<0.5?p.name:n.name);`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testSeasonal(): void {
  // Every day produces valid modifiers
  for (let d = 0; d <= 365; d++) {
    const m = getSeasonalModifiers(d);
    console.assert(m.hueShift >= -5 && m.hueShift <= 5, `day ${d}: hue out of range`);
    console.assert(m.satMult >= 0.9 && m.satMult <= 1.1, `day ${d}: sat out of range`);
    console.assert(m.opacityMult >= 0.9 && m.opacityMult <= 1.1, `day ${d}: opacity out of range`);
  }
  // Continuity: no jumps > threshold between adjacent days
  for (let d = 0; d < 365; d++) {
    const a = getSeasonalModifiers(d), b = getSeasonalModifiers(d + 1);
    console.assert(Math.abs(a.hueShift - b.hueShift) < 0.2, `day ${d}: hue discontinuity`);
    console.assert(Math.abs(a.satMult - b.satMult) < 0.01, `day ${d}: sat discontinuity`);
  }
  // Anchor days produce expected season names
  console.assert(getSeasonalModifiers(172).season === 'summer', 'day 172 should be summer');
  console.assert(getSeasonalModifiers(355).season === 'winter', 'day 355 should be winter');
  const script = seasonalScript();
  console.assert(script.includes('setProperty'), 'script missing setProperty');
  console.assert(script.includes('data-season'), 'script missing data-season');
  console.log('[seasonal] OK — 366 days covered, continuity verified, script generated');
}

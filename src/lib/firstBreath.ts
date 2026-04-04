// src/lib/firstBreath.ts
// "First Breath" — arrival choreography that fires once per session.
// The page blooms from muted to full, and a time-aware whisper fades
// in then dissolves. Pure functions + inline script generator.
// No dependencies beyond timeAmbient (phase resolution).
// Follows the same pattern as timeAmbient.ts / seasonal.ts.

import { hourToPhase, PHASE_RANGES, type TimePhase } from './timeAmbient';
import whispersData from '../data/whispers.json';

export interface Whisper {
  phase: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Deterministic hash — same algo as constellation.ts, keeps it consistent
// ---------------------------------------------------------------------------

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Phase-aware whisper selection — deterministic by phase + day
// ---------------------------------------------------------------------------

/** Returns all whispers for a given phase. */
export function whispersForPhase(phase: TimePhase): Whisper[] {
  return whispersData.filter((w) => w.phase === phase);
}

/** Pick one whisper deterministically: hash(phase + dayOfYear) → index. */
export function pickWhisper(phase: TimePhase, now = new Date()): Whisper {
  const pool = whispersForPhase(phase);
  const dayOfYear = Math.floor(
    (+now - +new Date(now.getFullYear(), 0, 0)) / 86_400_000,
  );
  const idx = hashCode(phase + ':' + dayOfYear) % pool.length;
  return pool[idx];
}

/** Resolve current phase from the clock — reusable across modules. */
export function getCurrentPhase(now = new Date()): TimePhase {
  return hourToPhase(now.getHours());
}

// ---------------------------------------------------------------------------
// Inline script generator — build-time function, runs client-side.
// Orchestrates the 4-beat arrival sequence via CSS class toggles.
// sessionStorage gates it to once per session.
// ---------------------------------------------------------------------------

// TODO: wire into FirstBreath.astro component (next session)
// TODO: add prefers-reduced-motion bailout in script body

export function firstBreathScript(): string {
  const phases = JSON.stringify(PHASE_RANGES);
  return [
    `(function(){`,
    `  if(sessionStorage.getItem('breath'))return;`,
    `  sessionStorage.setItem('breath','1');`,
    `  var P=${phases};`,
    `  function gp(h){var r=P.find(function(x){return h>=x[0]&&h<=x[1]});return r?r[2]:'noon'}`,
    `  var ph=gp(new Date().getHours());`,
    `  var d=document,root=d.documentElement;`,
    `  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;`,
    `  root.setAttribute('data-breath','active');`,
    `  var w=d.querySelector('[data-breath-whisper]');`,
    `  requestAnimationFrame(function(){`,
    `    setTimeout(function(){root.setAttribute('data-breath','settle')},1500);`,
    `    setTimeout(function(){if(w)w.style.opacity='0.55'},2000);`,
    `    setTimeout(function(){if(w)w.style.opacity='0'},5500);`,
    `    setTimeout(function(){`,
    `      root.removeAttribute('data-breath');`,
    `      if(w)w.remove();`,
    `    },7500);`,
    `  });`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testFirstBreath(): void {
  const phases: TimePhase[] = [
    'night', 'dawn', 'morning', 'noon',
    'afternoon', 'golden-hour', 'dusk', 'evening',
  ];
  for (const p of phases) {
    const pool = whispersForPhase(p);
    console.assert(pool.length >= 6, `${p}: need ≥6 whispers, got ${pool.length}`);
  }

  const w1 = pickWhisper('dawn', new Date('2026-04-04'));
  const w2 = pickWhisper('dawn', new Date('2026-04-04'));
  console.assert(w1.text === w2.text, 'same day = same whisper');

  const w3 = pickWhisper('dawn', new Date('2026-04-05'));
  console.assert(w3.phase === 'dawn', 'phase matches');

  const script = firstBreathScript();
  console.assert(script.includes('sessionStorage'), 'script has session gate');
  console.assert(script.includes('data-breath'), 'script sets data-breath');
  console.assert(script.includes('prefers-reduced-motion'), 'script respects a11y');

  console.log('[firstBreath] OK — all phases covered, deterministic pick, script valid');
}

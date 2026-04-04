// src/lib/drift.ts
// Drift feature — resurrects aged content in a reverse-decay animation.
// Pulls from wall + embers. Selects entries with decay > 0.5 (the forgotten).
// Pure functions, zero side-effects.
//
// TODO: add tidepool as a drift source once link cards are styled
// TODO: v1.1 — celestial witness reaction during drift scene
// TODO: v1.1 — chromatic aberration on reconstruction phase

import type { MoodId } from './mood';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftCandidate {
  id: string;
  text: string;
  posted: string;
  mood: MoodId;
  source: 'wall' | 'ember';
}

export interface DriftPhase {
  name: 'arrival' | 'reconstruction' | 'hold' | 'release';
  duration: number;  // seconds
  opacity: number;   // target opacity at phase end
  blur: number;      // target blur in px
}

// ---------------------------------------------------------------------------
// Phase timing — 7 seconds total (Tanya spec: 6-8s)
// ---------------------------------------------------------------------------

export function driftPhases(): DriftPhase[] {
  return [
    { name: 'arrival',        duration: 1.2, opacity: 0.3, blur: 12 },
    { name: 'reconstruction', duration: 2.5, opacity: 1.0, blur: 0 },
    { name: 'hold',           duration: 2.3, opacity: 1.0, blur: 0 },
    { name: 'release',        duration: 1.0, opacity: 0.0, blur: 8 },
  ];
}

/** Total animation duration in seconds. */
export function driftDuration(): number {
  return driftPhases().reduce((s, p) => s + p.duration, 0);
}

// ---------------------------------------------------------------------------
// Candidate selection — deterministic with seeded index
// ---------------------------------------------------------------------------

/** Filter entries to those sufficiently decayed (forgotten). */
export function filterCandidates(
  entries: DriftCandidate[],
  minDecay: number,
  maxDays: number,
  now = new Date(),
): DriftCandidate[] {
  return entries.filter(e => {
    const age = (now.getTime() - new Date(e.posted).getTime()) / 86_400_000;
    return (age / maxDays) >= minDecay;
  });
}

/** Pick one candidate. Uses day-of-year as seed for determinism per visit. */
export function pickCandidate(
  candidates: DriftCandidate[],
  now = new Date(),
): DriftCandidate | null {
  if (candidates.length === 0) return null;
  const doy = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return candidates[doy % candidates.length];
}

// ---------------------------------------------------------------------------
// Client-side drift script (inline <script>)
// ---------------------------------------------------------------------------

export function driftScript(): string {
  const dur = driftDuration();
  return [
    '(function(){',
    '  var btn=document.querySelector("[data-drift-btn]");',
    '  var scene=document.querySelector("[data-drift-scene]");',
    '  if(!btn||!scene) return;',
    '  btn.addEventListener("click",function(){',
    '    btn.classList.add("drift-used");',
    '    btn.setAttribute("disabled","true");',
    '    scene.classList.add("drift-active");',
    `    setTimeout(function(){ scene.classList.remove("drift-active"); },${dur * 1000});`,
    '  });',
    '})();',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testDriftLib(): void {
  const phases = driftPhases();
  console.assert(phases.length === 4, 'expected 4 phases');
  const dur = driftDuration();
  console.assert(dur >= 6 && dur <= 8, `duration ${dur}s outside 6-8s range`);

  const entries: DriftCandidate[] = [
    { id: 'a', text: 'old', posted: '2026-01-01', mood: 'lo-fi', source: 'wall' },
    { id: 'b', text: 'new', posted: '2026-04-03', mood: 'focus', source: 'ember' },
  ];
  const filtered = filterCandidates(entries, 0.5, 30, new Date('2026-04-04'));
  console.assert(filtered.length === 1, `expected 1 candidate, got ${filtered.length}`);
  console.assert(filtered[0].id === 'a', 'should pick the old entry');

  const picked = pickCandidate(filtered, new Date('2026-04-04'));
  console.assert(picked !== null, 'should pick a candidate');

  console.assert(driftScript().includes('drift-active'), 'script must toggle class');
  console.log('[drift] lib OK — phases, filtering, picking, script verified');
}

// src/lib/snapshot.ts
// "Mood Snapshot" — encodes the blog's atmospheric state into a URL-safe
// token so shared links land recipients in the exact same atmosphere.
//
// Format: ?snap=<mood>.<phase>  e.g. ?snap=jazz.night
// Readable, debuggable, zero external deps. Composes with moodCycle.ts
// and timeAmbient.ts — snapshot overrides both when present.
//
// TODO: add seasonal season name to snapshot once UI preview card lands
// TODO: OG image generation endpoint that renders snapshot as preview card

import type { MoodId } from './mood';
import { MOODS } from './mood';
import type { TimePhase } from './timeAmbient';
import { PHASE_RANGES } from './timeAmbient';

// ---------------------------------------------------------------------------
// Snapshot data shape
// ---------------------------------------------------------------------------

export interface MoodSnapshot {
  mood: MoodId;
  phase: TimePhase;
}

// ---------------------------------------------------------------------------
// Encode / decode — pure, stateless, never throws
// ---------------------------------------------------------------------------

const VALID_MOODS = new Set(Object.keys(MOODS));
const VALID_PHASES = new Set(PHASE_RANGES.map(r => r[2]));

/** Packs a snapshot into a URL-safe dot-delimited token. */
export function encodeSnapshot(snap: MoodSnapshot): string {
  return `${snap.mood}.${snap.phase}`;
}

/** Parses a token back into a snapshot. Returns null on bad input. */
export function decodeSnapshot(token: string): MoodSnapshot | null {
  const [mood, phase] = token.split('.');
  if (!VALID_MOODS.has(mood) || !VALID_PHASES.has(phase)) return null;
  return { mood: mood as MoodId, phase: phase as TimePhase };
}

// ---------------------------------------------------------------------------
// Client-side script — reads ?snap= and overrides mood + time tint
// ---------------------------------------------------------------------------

/**
 * Inline <script> body that:
 * 1. Reads ?snap= param from URL
 * 2. Activates the mood radio (overrides moodCycle auto-pick)
 * 3. Overrides time tint CSS vars (overrides timeAmbient auto-pick)
 * 4. Sets data-snapshot on <html> for CSS hooks
 *
 * Must run AFTER moodCycleScript and timeAmbientScript so it wins.
 */
export function snapshotScript(): string {
  const tints = JSON.stringify(
    Object.fromEntries(
      PHASE_RANGES.map(r => [r[2], { hue: '', opacity: 0 }])
    )
  );
  return [
    `(function(){`,
    `  var s=new URLSearchParams(location.search).get('snap');`,
    `  if(!s)return;`,
    `  var p=s.split('.');if(p.length!==2)return;`,
    `  var mood=p[0],phase=p[1];`,
    `  var el=document.getElementById('mood-'+mood);`,
    `  if(!el)return;`,
    `  el.checked=true;`,
    `  document.documentElement.setAttribute('data-snapshot',s);`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testSnapshot(): void {
  const snap: MoodSnapshot = { mood: 'jazz', phase: 'night' };
  const token = encodeSnapshot(snap);
  console.assert(token === 'jazz.night', `encode: expected jazz.night got ${token}`);

  const decoded = decodeSnapshot(token);
  console.assert(decoded !== null, 'decode returned null');
  console.assert(decoded!.mood === 'jazz', 'decode mood mismatch');
  console.assert(decoded!.phase === 'night', 'decode phase mismatch');

  console.assert(decodeSnapshot('bogus') === null, 'bad token should return null');
  console.assert(decodeSnapshot('jazz.bogus') === null, 'bad phase should return null');
  console.assert(decodeSnapshot('bogus.night') === null, 'bad mood should return null');

  const script = snapshotScript();
  console.assert(script.includes('snap'), 'script missing snap param');
  console.assert(script.includes('data-snapshot'), 'script missing data-snapshot');
  console.log('[snapshot] OK — encode, decode, reject bad input, script generated');
}

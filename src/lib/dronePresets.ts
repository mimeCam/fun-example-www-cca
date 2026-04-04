// src/lib/dronePresets.ts
// Bridge between the temporal/seasonal system and the drone engine.
// Pure functions — maps time phase + season to DroneParams.
// This is the ONLY coupling point between audio and the ambient system.
// If temporal.ts or seasonal.ts change, only this file needs updating.

import type { TimePhase } from './timeAmbient';
import type { SeasonName } from './seasonal';
import type { DroneParams } from './droneEngine';

/** Phase-specific audio character (base values before seasonal adjust). */
interface PhaseAudio {
  baseFreq: number;
  beatFreq: number;
  gainDb: number;
  filterHz: number;
}

const PHASE_AUDIO: Record<TimePhase, PhaseAudio> = {
  'night':       { baseFreq: 220, beatFreq: 2.0, gainDb: -30, filterHz: 400 },
  'dawn':        { baseFreq: 280, beatFreq: 3.5, gainDb: -28, filterHz: 600 },
  'morning':     { baseFreq: 320, beatFreq: 4.0, gainDb: -28, filterHz: 700 },
  'noon':        { baseFreq: 350, beatFreq: 4.5, gainDb: -30, filterHz: 800 },
  'afternoon':   { baseFreq: 330, beatFreq: 4.0, gainDb: -28, filterHz: 700 },
  'golden-hour': { baseFreq: 300, beatFreq: 3.0, gainDb: -26, filterHz: 550 },
  'dusk':        { baseFreq: 260, beatFreq: 2.5, gainDb: -28, filterHz: 480 },
  'evening':     { baseFreq: 240, beatFreq: 2.0, gainDb: -28, filterHz: 420 },
};

// TODO: fine-tune frequencies with real headphones + phone speaker testing

/** Seasonal frequency offset — cooler seasons lower, warmer raise. */
const SEASON_FREQ_OFFSET: Record<SeasonName, number> = {
  winter: -15,
  spring:   5,
  summer:  10,
  autumn:  -5,
};

/** Seasonal filter bias — winter muffles, summer opens up. */
const SEASON_FILTER_OFFSET: Record<SeasonName, number> = {
  winter: -80,
  spring:  20,
  summer:  40,
  autumn: -20,
};

const DEFAULT_FADE_MS = 2000;

/** Resolves a time phase + season into concrete DroneParams. */
export function droneParamsFor(
  phase: TimePhase,
  season: SeasonName,
): DroneParams {
  const base = PHASE_AUDIO[phase];
  return {
    baseFreq: base.baseFreq + SEASON_FREQ_OFFSET[season],
    beatFreq: base.beatFreq,
    gainDb:   base.gainDb,
    fadeMs:   DEFAULT_FADE_MS,
    filterHz: base.filterHz + SEASON_FILTER_OFFSET[season],
  };
}

/** Human-readable label for the current drone mood (used in UI bar). */
export function droneMoodLabel(
  phase: TimePhase,
  season: SeasonName,
): string {
  const labels: Record<TimePhase, string> = {
    'night': 'Deep Night Pulse',
    'dawn': 'First Light Hum',
    'morning': 'Morning Drift',
    'noon': 'Midday Tone',
    'afternoon': 'Warm Afternoon',
    'golden-hour': 'Golden Hour Glow',
    'dusk': 'Twilight Murmur',
    'evening': 'Evening Lull',
  };
  return `${labels[phase]} · ${season}`;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testDronePresets(): void {
  const phases: TimePhase[] = [
    'night','dawn','morning','noon',
    'afternoon','golden-hour','dusk','evening',
  ];
  const seasons: SeasonName[] = ['winter','spring','summer','autumn'];
  for (const p of phases) {
    for (const s of seasons) {
      const d = droneParamsFor(p, s);
      console.assert(d.baseFreq >= 200, `${p}/${s}: freq too low`);
      console.assert(d.baseFreq <= 400, `${p}/${s}: freq too high`);
      console.assert(d.filterHz >= 300, `${p}/${s}: filter too low`);
      console.assert(d.gainDb <= -24, `${p}/${s}: too loud`);
    }
  }
  const label = droneMoodLabel('golden-hour', 'summer');
  console.assert(label.includes('Golden'), 'label missing phase');
  console.assert(label.includes('summer'), 'label missing season');
  console.log('[dronePresets] OK — all phase×season combos in range');
}

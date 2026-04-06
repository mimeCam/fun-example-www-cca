// src/lib/mood-simple.ts
// Simplified mood system — 3 moods only: warm, sharp, raw.
// Expressed as an 8px colored dot, not pills. Decay is the star;
// mood is background seasoning.
//
// Outputs the same CSSMoodVars interface the site already consumes,
// so zero downstream changes needed.

import type { MoodDefinition, CSSMoodVars } from './mood';
import { moodToCSSVars, moodToCSSString } from './mood';

export type SimpleMoodId = 'warm' | 'sharp' | 'raw';

const SIMPLE_MOODS: Record<SimpleMoodId, MoodDefinition> = {
  warm: {
    label: 'warm',
    gradient_from: '#C4A882', gradient_to: '#D4956A',
    temperature: 'warm', opacity: 0.08, animation_duration: '14s',
    shadow_rgb: '180, 140, 100', accent: '#D4956A', accent_rgb: '212, 149, 106',
  },
  sharp: {
    label: 'sharp',
    gradient_from: '#8AB4CF', gradient_to: '#6BA3C4',
    temperature: 'cool', opacity: 0.06, animation_duration: '18s',
    shadow_rgb: '90, 140, 180', accent: '#6BA3C4', accent_rgb: '107, 163, 196',
  },
  raw: {
    label: 'raw',
    gradient_from: '#A0A0A0', gradient_to: '#707070',
    temperature: 'neutral', opacity: 0.04, animation_duration: '22s',
    shadow_rgb: '120, 120, 120', accent: '#9CA3AF', accent_rgb: '156, 163, 175',
  },
};

const VALID_IDS = new Set<string>(Object.keys(SIMPLE_MOODS));

/** Resolve a mood ID; unknown values fall back to 'warm'. */
export function resolveSimpleMood(id: string): MoodDefinition {
  return SIMPLE_MOODS[id as SimpleMoodId] ?? SIMPLE_MOODS.warm;
}

/** All simple mood IDs for iteration. */
export function simpleMoodIds(): SimpleMoodId[] {
  return Object.keys(SIMPLE_MOODS) as SimpleMoodId[];
}

/** CSS vars for a simple mood — same shape as the old system. */
export function simpleMoodCSSVars(id: string): CSSMoodVars {
  return moodToCSSVars(resolveSimpleMood(id));
}

/** CSS string for inline :root injection. */
export function simpleMoodCSSString(id: string): string {
  return moodToCSSString(simpleMoodCSSVars(id));
}

/** Dot color for the mood indicator (the accent hex). */
export function moodDotColor(id: string): string {
  return resolveSimpleMood(id).accent;
}

/** Check if a string is a valid simple mood. */
export function isSimpleMood(value: unknown): value is SimpleMoodId {
  return typeof value === 'string' && VALID_IDS.has(value);
}

// TODO: map old article moods (contemplative, etc.) → closest simple mood

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testMoodSimple(): void {
  for (const id of simpleMoodIds()) {
    const m = resolveSimpleMood(id);
    console.assert(m.label === id, `label mismatch for ${id}`);
    const vars = simpleMoodCSSVars(id);
    console.assert(Object.keys(vars).length === 7, `${id}: expected 7 vars`);
    console.assert(moodDotColor(id).startsWith('#'), `${id}: dot color`);
  }
  console.assert(resolveSimpleMood('unknown').label === 'warm', 'fallback');
  console.assert(!isSimpleMood('jazz'), 'old mood rejected');
  console.assert(isSimpleMood('raw'), 'valid mood accepted');
  console.log('[mood-simple] OK — 3 moods, CSS vars, dot colors verified');
}

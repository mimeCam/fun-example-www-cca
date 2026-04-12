// src/lib/mood-simple.ts
// Canonical mood system — 3 moods: warm, sharp, raw.
// Self-contained: no imports from the deleted mood.ts.
// Expressed as an 8px colored dot, not pills. Decay is the star;
// mood is background seasoning.
//
// Tanya §4.7: mood-simple.ts is the surviving file. mood.ts is deleted.
// TODO: map old article moods (contemplative, etc.) → closest simple mood

export type Temperature = 'warm' | 'cool' | 'neutral';
export type SimpleMoodId = 'warm' | 'sharp' | 'raw';

export interface MoodDefinition {
  label: string;
  gradient_from: string;
  gradient_to: string;
  temperature: Temperature;
  opacity: number;
  animation_duration: string;
  shadow_rgb: string;
  accent: string;
  accent_rgb: string;
}

export interface CSSMoodVars {
  '--mood-from': string;
  '--mood-to': string;
  '--mood-opacity': string;
  '--mood-speed': string;
  '--mood-shadow-rgb': string;
  '--mood-accent': string;
  '--mood-accent-rgb': string;
  /** Composite token: rgba(r,g,b, 0.04) — use instead of rgba(var(--mood-accent-rgb), 0.04)
   *  which silently fails in all browsers (CSS vars can't interpolate comma-separated rgb). */
  '--mood-accent-glow': string;
}

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

/** Resolve a mood ID; unknown values (including old 5-mood IDs) fall back to 'warm'. */
export function resolveSimpleMood(id: string): MoodDefinition {
  return SIMPLE_MOODS[id as SimpleMoodId] ?? SIMPLE_MOODS.warm;
}

/** All simple mood IDs for iteration. */
export function simpleMoodIds(): SimpleMoodId[] {
  return Object.keys(SIMPLE_MOODS) as SimpleMoodId[];
}

/** Convert a MoodDefinition to CSS custom property map. */
export function moodToCSSVars(mood: MoodDefinition): CSSMoodVars {
  return {
    '--mood-from':        mood.gradient_from,
    '--mood-to':          mood.gradient_to,
    '--mood-opacity':     String(mood.opacity),
    '--mood-speed':       mood.animation_duration,
    '--mood-shadow-rgb':  mood.shadow_rgb,
    '--mood-accent':      mood.accent,
    '--mood-accent-rgb':  mood.accent_rgb,
    // Pre-computed composite so consumers use var(--mood-accent-glow) directly.
    // rgba(var(--mood-accent-rgb), 0.04) silently fails — this fixes it (Tanya §10.1).
    '--mood-accent-glow': `rgba(${mood.accent_rgb}, 0.04)`,
  };
}

/** Serialise CSS vars map to a :root { … } inner string for <style> tags. */
export function moodToCSSString(vars: CSSMoodVars): string {
  return Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
}

/** CSS vars for a mood by ID. */
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

// ---------------------------------------------------------------------------
// Sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testMoodSimple(): void {
  for (const id of simpleMoodIds()) {
    const m = resolveSimpleMood(id);
    console.assert(m.label === id, `label mismatch for ${id}`);
    const vars = simpleMoodCSSVars(id);
    console.assert(Object.keys(vars).length === 8, `${id}: expected 8 vars (incl. --mood-accent-glow)`);
    console.assert(moodDotColor(id).startsWith('#'), `${id}: dot color`);
  }
  console.assert(resolveSimpleMood('unknown').label === 'warm', 'fallback');
  console.assert(resolveSimpleMood('jazz').label === 'warm', 'old mood falls back');
  console.assert(!isSimpleMood('jazz'), 'old mood rejected by isSimpleMood');
  console.assert(isSimpleMood('raw'), 'valid mood accepted');
  console.log('[mood-simple] OK — 3 moods, CSS vars, dot colors verified');
}

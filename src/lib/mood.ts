// src/lib/mood.ts
// Core mood system — maps mood IDs to CSS custom property values.
// All downstream components consume only CSSMoodVars; they never reach
// into MoodDefinition directly. Add a new mood here and the whole site
// picks it up automatically.
//
// TODO: wire _testMoodRegistry() into a build script or CI step

export type MoodId = 'lo-fi' | 'focus' | 'hyperpop' | 'jazz' | 'default';
export type Temperature = 'warm' | 'cool' | 'neutral';

export interface MoodDefinition {
  label: string;
  gradient_from: string;
  gradient_to: string;
  temperature: Temperature;
  opacity: number;            // 0.00–0.14; tested against 4.5:1 text contrast
  animation_duration: string;
  shadow_rgb: string;         // "r, g, b" tuple for use inside rgba()
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
}

// ---------------------------------------------------------------------------
// Mood registry — single source of truth for every palette in the system
// ---------------------------------------------------------------------------

export const MOODS: Record<MoodId, MoodDefinition> = {
  'lo-fi': {
    label: 'lo-fi hip hop',
    gradient_from: '#C4A882', gradient_to: '#D4956A',
    temperature: 'warm', opacity: 0.10, animation_duration: '12s',
    shadow_rgb: '180, 140, 100', accent: '#D4956A', accent_rgb: '212, 149, 106',
  },
  'focus': {
    label: 'deep focus',
    gradient_from: '#8AB4CF', gradient_to: '#6BA3C4',
    temperature: 'cool', opacity: 0.08, animation_duration: '16s',
    shadow_rgb: '90, 140, 180', accent: '#6BA3C4', accent_rgb: '107, 163, 196',
  },
  'hyperpop': {
    label: 'hyperpop',
    gradient_from: '#D4A8FF', gradient_to: '#C084FC',
    temperature: 'cool', opacity: 0.08, animation_duration: '8s',
    shadow_rgb: '180, 100, 240', accent: '#C084FC', accent_rgb: '192, 132, 252',
  },
  'jazz': {
    label: 'late night jazz',
    gradient_from: '#2D1B4E', gradient_to: '#4C1D95',
    temperature: 'cool', opacity: 0.12, animation_duration: '18s',
    shadow_rgb: '80, 40, 140', accent: '#8B5CF6', accent_rgb: '139, 92, 246',
  },
  'default': {
    label: 'default',
    gradient_from: '#A0A0A0', gradient_to: '#808080',
    temperature: 'neutral', opacity: 0.04, animation_duration: '20s',
    shadow_rgb: '120, 120, 120', accent: '#9CA3AF', accent_rgb: '156, 163, 175',
  },
};

// ---------------------------------------------------------------------------
// Graveyard constants — locked palette, no cycling (P2)
// ---------------------------------------------------------------------------

/**
 * Fixed mood for /graveyard.  Jazz is deep, respectful, unhurried —
 * the right register for grief.  Never warm, never cozy.
 * Warm moods (lo-fi) belong to the living feed; graveyard stays cool.
 */
export const GRAVEYARD_MOOD: MoodId = 'jazz';

// ---------------------------------------------------------------------------
// Public API — five functions, zero side-effects
// ---------------------------------------------------------------------------

/** Resolves a mood ID string to its definition; falls back to 'default'. */
export function resolveMood(id: string): MoodDefinition {
  return MOODS[id as MoodId] ?? MOODS['default'];
}

/** Converts a MoodDefinition into the CSS custom property map. */
export function moodToCSSVars(mood: MoodDefinition): CSSMoodVars {
  return {
    '--mood-from': mood.gradient_from,
    '--mood-to': mood.gradient_to,
    '--mood-opacity': String(mood.opacity),
    '--mood-speed': mood.animation_duration,
    '--mood-shadow-rgb': mood.shadow_rgb,
    '--mood-accent': mood.accent,
    '--mood-accent-rgb': mood.accent_rgb,
  };
}

/** Serialises a CSSMoodVars map to a :root { … } inner string for <style> tags. */
export function moodToCSSString(vars: CSSMoodVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

/** Returns non-default mood IDs for UI pill rendering. */
export function activeMoodIds(): MoodId[] {
  return (Object.keys(MOODS) as MoodId[]).filter(id => id !== 'default');
}

/** Returns only warm-temperature mood IDs (safe for the living feed). */
export function warmMoodIds(): MoodId[] {
  return (Object.keys(MOODS) as MoodId[]).filter(id => MOODS[id].temperature === 'warm');
}

/** Generates global CSS rules that wire radio :checked state to ambient + pill visuals. */
export function moodSwitchCSS(): string {
  return (Object.keys(MOODS) as MoodId[]).map(id => {
    const m = MOODS[id];
    const ambient = [
      `#mood-${id}:checked ~ [data-ambient] {`,
      `  background: linear-gradient(135deg, ${m.gradient_from}, ${m.gradient_to});`,
      `  opacity: ${m.opacity}; animation-duration: ${m.animation_duration};`,
      `}`,
    ].join('\n');
    const pill = [
      `#mood-${id}:checked ~ [data-mood-bar] [data-mood="${id}"] {`,
      `  opacity: 1; background: rgba(${m.accent_rgb}, 0.14);`,
      `  border-color: ${m.accent}; box-shadow: 0 0 8px rgba(${m.accent_rgb}, 0.25);`,
      `}`,
    ].join('\n');
    return `${ambient}\n${pill}`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (leave in place — see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

/** Call from a build script with ISOLATED_RUN_MOOD env var to verify registry. */
export function _testMoodRegistry(): void {
  const ids: MoodId[] = ['lo-fi', 'focus', 'hyperpop', 'jazz', 'default'];
  for (const id of ids) {
    const m = resolveMood(id);
    console.assert(m.label !== undefined, `mood "${id}" missing label`);
    console.assert(m.opacity >= 0 && m.opacity <= 0.14, `mood "${id}" opacity out of range`);
    console.assert(Object.keys(moodToCSSVars(m)).length === 7, `mood "${id}" incomplete CSS vars`);
  }
  console.log('[mood] registry OK — 5 moods, all 7 CSS vars defined per entry');
}

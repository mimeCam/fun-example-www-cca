// src/lib/mood-engine.ts
// Persona Lens — maps per-article mood keywords to visual atmosphere.
// Content authors add `mood: "contemplative"` to frontmatter; the
// entire page transforms. Outputs the same CSSMoodVars interface the
// rest of the site already consumes, so zero component changes needed.
//
// TODO: blend article mood with user-selected mood (weighted merge) — see blend.ts

import type { MoodDefinition, CSSMoodVars } from './mood';
import { moodToCSSVars, moodToCSSString } from './mood';

export type ArticleMood =
  | 'contemplative'
  | 'energetic'
  | 'melancholic'
  | 'playful'
  | 'focused'
  | 'serene'
  | 'nostalgic'
  | 'dreamy';

const ARTICLE_MOODS: Record<ArticleMood, MoodDefinition> = {
  contemplative: {
    label: 'contemplative',
    gradient_from: '#4A6670', gradient_to: '#2C3E50',
    temperature: 'cool', opacity: 0.09, animation_duration: '20s',
    shadow_rgb: '74, 102, 112', accent: '#5B8A9A', accent_rgb: '91, 138, 154',
  },
  energetic: {
    label: 'energetic',
    gradient_from: '#E8744F', gradient_to: '#D4533B',
    temperature: 'warm', opacity: 0.10, animation_duration: '8s',
    shadow_rgb: '232, 116, 79', accent: '#E8744F', accent_rgb: '232, 116, 79',
  },
  melancholic: {
    label: 'melancholic',
    gradient_from: '#3B4371', gradient_to: '#283048',
    temperature: 'cool', opacity: 0.11, animation_duration: '22s',
    shadow_rgb: '59, 67, 113', accent: '#7B8CDE', accent_rgb: '123, 140, 222',
  },
  playful: {
    label: 'playful',
    gradient_from: '#F7B733', gradient_to: '#FC4A1A',
    temperature: 'warm', opacity: 0.07, animation_duration: '10s',
    shadow_rgb: '247, 183, 51', accent: '#F7B733', accent_rgb: '247, 183, 51',
  },
  focused: {
    label: 'focused',
    gradient_from: '#1A2A3A', gradient_to: '#0F1923',
    temperature: 'cool', opacity: 0.06, animation_duration: '24s',
    shadow_rgb: '26, 42, 58', accent: '#4A90B8', accent_rgb: '74, 144, 184',
  },
  serene: {
    label: 'serene',
    gradient_from: '#A8E6CF', gradient_to: '#88D8A8',
    temperature: 'cool', opacity: 0.08, animation_duration: '18s',
    shadow_rgb: '168, 230, 207', accent: '#88D8A8', accent_rgb: '136, 216, 168',
  },
  nostalgic: {
    label: 'nostalgic',
    gradient_from: '#C9956B', gradient_to: '#8B6D54',
    temperature: 'warm', opacity: 0.10, animation_duration: '22s',
    shadow_rgb: '201, 149, 107', accent: '#D4A574', accent_rgb: '212, 165, 116',
  },
  dreamy: {
    label: 'dreamy',
    gradient_from: '#B8A9D4', gradient_to: '#7E6BAE',
    temperature: 'cool', opacity: 0.09, animation_duration: '20s',
    shadow_rgb: '184, 169, 212', accent: '#A08ED0', accent_rgb: '160, 142, 208',
  },
};

const VALID_MOODS = new Set<string>(Object.keys(ARTICLE_MOODS));

/** Check whether a frontmatter mood string is a known article mood. */
export function isArticleMood(value: unknown): value is ArticleMood {
  return typeof value === 'string' && VALID_MOODS.has(value);
}

/** Resolve an article mood string to CSS vars; returns null for unknown. */
export function resolveArticleMood(mood?: string): CSSMoodVars | null {
  if (!mood || !isArticleMood(mood)) return null;
  return moodToCSSVars(ARTICLE_MOODS[mood]);
}

/** Build a complete inline :root override string for an article mood. */
export function articleMoodCSS(mood?: string): string {
  const vars = resolveArticleMood(mood);
  if (!vars) return '';
  return moodToCSSString(vars);
}

/** List all available article mood names for documentation/UI. */
export function articleMoodIds(): ArticleMood[] {
  return Object.keys(ARTICLE_MOODS) as ArticleMood[];
}

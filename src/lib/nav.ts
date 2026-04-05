// src/lib/nav.ts
// Shared navigation helpers — framework-agnostic, SSR-safe.
// Used by DriftNav, SiteNav, and any future routing-aware component.

import { resolveMood, type MoodDefinition } from './mood';

/** Canonical page IDs used across navigation components. */
export type PageId = 'home' | 'now' | 'wall' | 'embers'
  | 'tidepool' | 'lowtide' | 'constellations' | 'blog' | 'unknown';

const PAGE_PREFIXES: [string, PageId][] = [
  ['/now', 'now'],
  ['/wall', 'wall'],
  ['/embers', 'embers'],
  ['/tidepool', 'tidepool'],
  ['/lowtide', 'lowtide'],
  ['/constellations', 'constellations'],
  ['/blog', 'blog'],
];

/** Derives the active PageId from a pathname string. SSR-safe. */
export function getActivePage(pathname: string): PageId {
  const clean = pathname.split('?')[0].split('#')[0];
  if (clean === '/' || clean === '') return 'home';
  for (const [prefix, id] of PAGE_PREFIXES) {
    if (clean === prefix || clean.startsWith(prefix + '/')) return id;
  }
  return 'unknown';
}

/** Nav color tokens derived from the mood palette. */
export interface MoodNavTokens {
  color: string;
  hoverColor: string;
  activeAccent: string;
  opacity: number;
}

/** Extracts nav-friendly tokens from a mood definition. */
export function getMoodNavTokens(mood: MoodDefinition): MoodNavTokens {
  return {
    color: `rgba(${mood.accent_rgb}, 0.75)`,
    hoverColor: mood.accent,
    activeAccent: mood.accent,
    opacity: 0.8,
  };
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testNav(): void {
  console.assert(getActivePage('/') === 'home', 'root → home');
  console.assert(getActivePage('/now') === 'now', '/now');
  console.assert(getActivePage('/now/') === 'now', '/now/');
  console.assert(getActivePage('/wall?q=1') === 'wall', 'query');
  console.assert(getActivePage('/wall#top') === 'wall', 'hash');
  console.assert(getActivePage('/blog/hello') === 'blog', 'blog slug');
  console.assert(getActivePage('/xyz') === 'unknown', 'unknown');
  const tokens = getMoodNavTokens(resolveMood('lo-fi'));
  console.assert(tokens.opacity === 0.8, 'opacity');
  console.assert(tokens.activeAccent === '#D4956A', 'accent');
  console.log('[nav] OK — getActivePage + getMoodNavTokens verified');
}

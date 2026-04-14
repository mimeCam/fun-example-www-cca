/**
 * src/lib/design-tokens.ts
 *
 * Server-side mirror of tokens.css semantic colors.
 * Satori (OG image renderer) cannot resolve CSS custom properties —
 * it needs raw hex. Import from HERE, never hardcode hex in OG layouts.
 *
 * Rule: if you need a color in TypeScript, import from this file.
 * When a token changes in tokens.css, update the hex here too.
 *
 * Architecture: Michael Koch · UX: Tanya Donska · Impl: Sid · 2026-04-14
 */

export const COLORS = {
  surfaceBase:    '#0c0c0e',
  surfaceRaised:  '#1a1a1f',
  surfaceMid:     '#141418',

  gold:           '#F5A623',
  text:           '#e8e8ec',
  dim:            '#6b6b80',

  verdictTrue:    '#22c55e',
  verdictWrong:   '#ef4444',
  verdictEvolved: '#a78bfa',

  tierBronze:     '#C8874B',
  tierSilver:     '#B0B8C8',
  tierGold:       '#F5A623',
  tierDiamond:    '#D8E8F8',
} as const;

export type ColorKey = keyof typeof COLORS;

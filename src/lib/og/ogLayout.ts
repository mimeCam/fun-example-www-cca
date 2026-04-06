// src/lib/og/ogLayout.ts
// Pure function that builds a satori-compatible JSX tree for the OG card.
// Encodes live decay state into visual properties — faded posts look faded.
// No side effects. No DOM. No React. Just a data structure satori consumes.
//
// Layout: 1200×630 with gradient bg, decay overlay, title, footer badges.
// Mood accent tints the background. Decay controls opacity + saturation.

import type { FreshnessTag } from '../decay';
import type { MoodId } from '../mood';
import { resolveMood } from '../mood';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OGImageData {
  title: string;
  description?: string;
  badge?: string;
  mood?: string;
  decay: number;
  freshness: FreshnessTag;
  revivalCount: number;
  pubDate: string;
  siteName: string;
}

// ---------------------------------------------------------------------------
// Color helpers (pure, tiny)
// ---------------------------------------------------------------------------

/** Desaturate a hex color toward gray by a 0–1 amount. */
function desaturate(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const mix = (c: number) => Math.round(c + (gray - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Map decay factor to a title opacity: 1.0 → 0.4. */
function titleOpacity(decay: number): number {
  return Math.max(0.4, 1 - decay * 0.6);
}

/** Map decay to grain overlay opacity: 0 → 0.15. */
function grainOpacity(decay: number): number {
  return +(decay * 0.15).toFixed(2);
}

/** Map decay to description opacity: 0.8 → 0.3. */
function descOpacity(decay: number): number {
  return Math.max(0.3, 0.8 - decay * 0.5);
}

// ---------------------------------------------------------------------------
// Footer badge builders
// ---------------------------------------------------------------------------

function freshnessLabel(tag: FreshnessTag): string {
  return tag;
}

function revivalLabel(count: number): string | null {
  if (count <= 0) return null;
  return `remembered by ${count}`;
}

function footerParts(data: OGImageData): string[] {
  const parts: string[] = [];
  if (data.badge) parts.push(data.badge);
  parts.push(freshnessLabel(data.freshness));
  const rev = revivalLabel(data.revivalCount);
  if (rev) parts.push(rev);
  return parts;
}

// ---------------------------------------------------------------------------
// Layout builder — returns satori JSX tree
// ---------------------------------------------------------------------------

/** Build the satori-compatible element tree for a 1200×630 OG image. */
export function ogLayout(data: OGImageData): Record<string, unknown> {
  const mood = resolveMood(data.mood ?? 'default');
  const bgFrom = desaturate(mood.gradient_from, data.decay * 0.7);
  const bgTo = desaturate(mood.gradient_to, data.decay * 0.7);
  const footer = footerParts(data).join('  ·  ');

  return container(bgFrom, bgTo, data, footer, mood.accent);
}

function container(
  bgFrom: string, bgTo: string,
  data: OGImageData, footer: string, accent: string,
): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: outerStyle(bgFrom, bgTo),
      children: [
        grainOverlay(data.decay),
        siteLabel(data.siteName, data.decay),
        titleBlock(data),
        footerBar(footer, data.decay, accent),
      ],
    },
  };
}

function outerStyle(from: string, to: string) {
  return {
    display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between',
    width: '1200px', height: '630px', padding: '60px',
    background: `linear-gradient(135deg, ${from}, ${to})`,
    fontFamily: 'sans-serif',
  };
}

function grainOverlay(decay: number): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        position: 'absolute', top: '0', left: '0',
        width: '1200px', height: '630px',
        backgroundColor: `rgba(180, 180, 180, ${grainOpacity(decay)})`,
      },
    },
  };
}

function siteLabel(name: string, decay: number): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        fontSize: '22px', fontWeight: 400,
        color: `rgba(255,255,255,${titleOpacity(decay) * 0.6})`,
        letterSpacing: '0.08em',
      },
      children: name.toUpperCase(),
    },
  };
}

function titleBlock(data: OGImageData): Record<string, unknown> {
  const children: Record<string, unknown>[] = [titleText(data)];
  if (data.description) children.push(descText(data));
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: '16px' },
      children,
    },
  };
}

function titleText(data: OGImageData): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        fontSize: '56px', fontWeight: 700, lineHeight: 1.15,
        color: `rgba(255,255,255,${titleOpacity(data.decay)})`,
      },
      children: truncate(data.title, 80),
    },
  };
}

function descText(data: OGImageData): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        fontSize: '24px', fontWeight: 400, lineHeight: 1.4,
        color: `rgba(255,255,255,${descOpacity(data.decay)})`,
      },
      children: truncate(data.description ?? '', 120),
    },
  };
}

function footerBar(
  text: string, decay: number, accent: string,
): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', alignItems: 'center',
        fontSize: '20px', fontWeight: 400,
        color: `rgba(255,255,255,${titleOpacity(decay) * 0.7})`,
        borderTop: `1px solid rgba(255,255,255,${0.15 - decay * 0.1})`,
        paddingTop: '20px',
        gap: '8px',
      },
      children: [accentDot(accent, decay), { type: 'span', props: { children: text } }],
    },
  };
}

function accentDot(
  accent: string, decay: number,
): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: {
        width: '10px', height: '10px', borderRadius: '50%',
        backgroundColor: accent,
        opacity: String(1 - decay * 0.6),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// src/lib/blend.ts
// Weighted Mood Blend Engine — merges reader-selected mood with an
// article's mood via HSL interpolation. Article mood dominates at 65%;
// the reader's chosen mood contributes 35%. Pure functions, zero deps.
//
// Usage:  blendMoodVars(articleVars, readerVars)  → CSSMoodVars
// Weight: blendMoodVars(a, r, 0.35)              → same default

import type { CSSMoodVars } from './mood';

interface HSL { h: number; s: number; l: number }

const READER_WEIGHT = 0.35;

/** Clamp value between min and max. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Parse "#RRGGBB" hex string to HSL (h 0-360, s/l 0-1). */
export function hexToHSL(hex: string): HSL {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** Convert HSL (h 0-360, s/l 0-1) back to "#RRGGBB". */
export function hslToHex(c: HSL): string {
  const { h, s, l } = c;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const val = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(clamp(val, 0, 1) * 255)
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Linearly interpolate between two HSL colors at weight t (0→a, 1→b). */
export function lerpHSL(a: HSL, b: HSL, t: number): HSL {
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    h: ((a.h + dh * t) % 360 + 360) % 360,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

/** Linearly interpolate two numbers. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Blend hex color from article (a) toward reader (b) at weight t. */
function blendHex(a: string, b: string, t: number): string {
  return hslToHex(lerpHSL(hexToHSL(a), hexToHSL(b), t));
}

/** Blend "r, g, b" strings at weight t using simple lerp. */
function blendRGB(a: string, b: string, t: number): string {
  const pa = a.split(',').map(Number);
  const pb = b.split(',').map(Number);
  return pa.map((v, i) =>
    Math.round(lerp(v, pb[i], t))
  ).join(', ');
}

/**
 * Blend two CSSMoodVars maps. Article mood dominates by default (65%).
 * readerWeight: 0.0 = pure article, 1.0 = pure reader.
 */
export function blendMoodVars(
  article: CSSMoodVars,
  reader: CSSMoodVars,
  readerWeight = READER_WEIGHT,
): CSSMoodVars {
  const t = clamp(readerWeight, 0, 1);
  return {
    '--mood-from':       blendHex(article['--mood-from'], reader['--mood-from'], t),
    '--mood-to':         blendHex(article['--mood-to'], reader['--mood-to'], t),
    '--mood-opacity':    String(lerp(+article['--mood-opacity'], +reader['--mood-opacity'], t).toFixed(3)),
    '--mood-speed':      `${lerp(parseFloat(article['--mood-speed']), parseFloat(reader['--mood-speed']), t).toFixed(1)}s`,
    '--mood-shadow-rgb': blendRGB(article['--mood-shadow-rgb'], reader['--mood-shadow-rgb'], t),
    '--mood-accent':     blendHex(article['--mood-accent'], reader['--mood-accent'], t),
    '--mood-accent-rgb': blendRGB(article['--mood-accent-rgb'], reader['--mood-accent-rgb'], t),
  };
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testBlend(): void {
  const a = hexToHSL('#FF0000');
  console.assert(Math.abs(a.h) < 1, 'red hue should be ~0');
  console.assert(a.s > 0.99, 'red saturation should be ~1');

  const rt = hslToHex({ h: 0, s: 1, l: 0.5 });
  console.assert(rt === '#ff0000', `round-trip red: got ${rt}`);

  const mid = lerpHSL({ h: 0, s: 1, l: 0.5 }, { h: 120, s: 1, l: 0.5 }, 0.5);
  console.assert(Math.abs(mid.h - 60) < 1, `midpoint hue: got ${mid.h}`);

  console.log('[blend] sanity OK — hex↔HSL round-trip, lerp midpoint');
}

// src/lib/client/decay-color-lerp.ts
// OKLCH channel lerp: decayFactor 0→1 maps to green → warm-amber → fossil-red.
// Three-stop lerp prevents the grey muddy midpoint that straight green→red produces.
// Segment 1 [0→0.5]: fresh-green → revival-amber (hue 145→70).
// Segment 2 [0.5→1]: revival-amber → fossil-red (hue 70→25).
//
// Credits: Mike Koch (arch spec §3 OKLCH lerp), Tanya §2.1 (decay stage color tokens).

export interface OklchColor { l: number; c: number; h: number; }

// Three design-token anchors (values match tokens.css primitives exactly).
const FRESH  : OklchColor = { l: 64, c: 0.190, h: 145 }; // --clr-green-400
const REVIVAL: OklchColor = { l: 72, c: 0.160, h:  70 }; // warm-amber midpoint
const FOSSIL : OklchColor = { l: 55, c: 0.220, h:  25 }; // --clr-red-500

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: OklchColor, b: OklchColor, t: number): OklchColor {
  return {
    l: lerpNum(a.l, b.l, t),
    c: lerpNum(a.c, b.c, t),
    h: lerpNum(a.h, b.h, t),
  };
}

/**
 * Maps decayFactor [0→1] to an OKLCH color via two-segment lerp.
 * factor 0.0 = fresh green · 0.5 = revival amber · 1.0 = fossil red.
 */
export function decayColorLerp(factor: number): OklchColor {
  if (factor <= 0.5) return lerpColor(FRESH, REVIVAL, factor * 2);
  return lerpColor(REVIVAL, FOSSIL, (factor - 0.5) * 2);
}

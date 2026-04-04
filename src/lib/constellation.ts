// src/lib/constellation.ts
// Shared utilities for the /constellations page — curated reading paths
// visualized as star-field constellations. Each star is a content reference;
// lines connect them into author-curated sequences.
// Positions are deterministic via simple string hash → viewport coords.
// Integrates with mood system via CSS custom properties. Zero dependencies.
//
// TODO: add optional `description` field per star for tooltip overlays
// TODO: wire constellation decay — older paths dim over time like everything else
// TODO: link stars to actual content pages (blog posts, wall entries, etc.)

import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Star {
  id: string;
  label: string;
  href?: string;     // link to content (blog post, wall entry, etc.)
}

export interface Constellation {
  name: string;
  description: string;
  created: string;   // ISO date
  stars: Star[];
}

export interface ComputedStar {
  star: Star;
  x: number;         // 0–100 viewport percent
  y: number;         // 0–100 viewport percent
  brightness: number; // 0–1, derived from position in path
}

export interface ComputedConstellation {
  constellation: Constellation;
  stars: ComputedStar[];
  age: number;        // days since created
}

// ---------------------------------------------------------------------------
// Deterministic positioning — hash a string to a coordinate
// ---------------------------------------------------------------------------

/** Simple string hash → number. Deterministic, no crypto needed. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Map a star ID to a viewport coordinate, padded from edges. */
export function starPosition(id: string, salt: string): { x: number; y: number } {
  const pad = 8;
  const range = 100 - pad * 2;
  const hx = hashCode(id + ':x:' + salt);
  const hy = hashCode(id + ':y:' + salt);
  return { x: pad + (hx % range), y: pad + (hy % range) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compute a single star with position and brightness. */
export function computeStar(
  star: Star, index: number, total: number, salt: string,
): ComputedStar {
  const { x, y } = starPosition(star.id, salt);
  const brightness = 1 - (index / Math.max(1, total - 1)) * 0.4;
  return { star, x, y, brightness };
}

/** Compute all stars in a constellation. */
export function computeConstellation(
  c: Constellation, now = new Date(),
): ComputedConstellation {
  const stars = c.stars.map((s, i) => computeStar(s, i, c.stars.length, c.name));
  return { constellation: c, stars, age: daysSince(c.created, now) };
}

/** Compute all constellations, sorted newest-first. */
export function computeAllConstellations(
  cs: Constellation[], now = new Date(),
): ComputedConstellation[] {
  return cs.map(c => computeConstellation(c, now))
    .sort((a, b) => a.age - b.age);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testConstellationLib(): void {
  const pos = starPosition('test-star', 'salt');
  console.assert(pos.x >= 8 && pos.x <= 92, `x in bounds: ${pos.x}`);
  console.assert(pos.y >= 8 && pos.y <= 92, `y in bounds: ${pos.y}`);

  const pos2 = starPosition('test-star', 'salt');
  console.assert(pos.x === pos2.x && pos.y === pos2.y, 'positions deterministic');

  const stub: Constellation = {
    name: 'test', description: 'A test path', created: '2026-04-01',
    stars: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
  };
  const cc = computeConstellation(stub, new Date('2026-04-04'));
  console.assert(cc.stars.length === 2, 'two stars computed');
  console.assert(cc.age === 3, `age should be 3, got ${cc.age}`);
  console.assert(cc.stars[0].brightness === 1, 'first star is brightest');
  console.assert(cc.stars[1].brightness < 1, 'last star dimmer');

  console.log('[constellation] lib OK — hash, position, compute verified');
}

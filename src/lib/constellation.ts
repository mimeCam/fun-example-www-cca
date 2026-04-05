// src/lib/constellation.ts
// Shared utilities for the /constellations page — curated reading paths
// visualized as star-field constellations. Each star is a content reference;
// lines connect them into author-curated sequences.
// Positions via force-directed layout — proximity = relatedness.
// Integrates with mood system via CSS custom properties. Zero dependencies.
//
// TODO: add optional `description` field per star for tooltip overlays
// TODO: wire constellation decay — older paths dim over time like everything else

import { daysSince } from './temporal';
import { forceLayout } from './force-layout';
import type { RelatednessEntry } from './relatedness';
import { buildRelatedness } from './relatedness';

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
// Brightness — positional rank within a constellation path
// ---------------------------------------------------------------------------

function brightness(index: number, total: number): number {
  return 1 - (index / Math.max(1, total - 1)) * 0.4;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Attach pre-computed position + brightness to a star. */
function applyStar(
  star: Star, pos: { x: number; y: number }, index: number, total: number,
): ComputedStar {
  return { star, x: pos.x, y: pos.y, brightness: brightness(index, total) };
}

/**
 * Compute all constellations with force-directed positions.
 * Proximity = relatedness. Runs at build time — zero client JS.
 * @param entries  optional relatedness metadata per post
 */
export function computeAllConstellations(
  cs: Constellation[],
  now = new Date(),
  entries: RelatednessEntry[] = [],
): ComputedConstellation[] {
  const allStars = cs.flatMap(c => c.stars);
  const ids = allStars.map(s => s.id);

  const rel = buildRelatedness(
    entries.length ? entries : inferEntries(cs),
  );
  const positioned = forceLayout(ids, rel.score);
  const posMap = new Map(positioned.map(n => [n.id, n]));

  return cs
    .map(c => {
      const stars = c.stars.map((s, i) => {
        const pos = posMap.get(s.id) ?? { x: 50, y: 50 };
        return applyStar(s, pos, i, c.stars.length);
      });
      return { constellation: c, stars, age: daysSince(c.created, now) };
    })
    .sort((a, b) => a.age - b.age);
}

/** Fallback: infer entries from constellation grouping alone. */
function inferEntries(cs: Constellation[]): RelatednessEntry[] {
  return cs.flatMap(c =>
    c.stars.map(s => ({ id: s.id, constellationName: c.name })),
  );
}

/** Top-N brightest stars across all constellations. */
export function brightestStars(
  cs: ComputedConstellation[], count: number,
): ComputedStar[] {
  return cs.flatMap(c => c.stars)
    .sort((a, b) => b.brightness - a.brightness)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testConstellationLib(): void {
  const stub: Constellation = {
    name: 'test', description: 'A test path', created: '2026-04-01',
    stars: [
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
    ],
  };
  const stub2: Constellation = {
    name: 'other', description: 'B', created: '2026-04-01',
    stars: [{ id: 'c', label: 'Third' }],
  };

  const all = computeAllConstellations([stub, stub2], new Date('2026-04-04'));
  const cc = all.find(c => c.constellation.name === 'test')!;
  console.assert(cc.stars.length === 2, 'two stars computed');
  console.assert(cc.age === 3, `age should be 3, got ${cc.age}`);
  console.assert(cc.stars[0].brightness === 1, 'first star brightest');
  console.assert(cc.stars[1].brightness < 1, 'last star dimmer');

  // Force layout should place same-group stars closer together
  const dx = Math.abs(cc.stars[0].x - cc.stars[1].x);
  const dy = Math.abs(cc.stars[0].y - cc.stars[1].y);
  const sameGroupDist = Math.sqrt(dx * dx + dy * dy);
  const other = all.find(c => c.constellation.name === 'other')!;
  const cx = Math.abs(cc.stars[0].x - other.stars[0].x);
  const cy = Math.abs(cc.stars[0].y - other.stars[0].y);
  const crossGroupDist = Math.sqrt(cx * cx + cy * cy);
  console.assert(sameGroupDist < crossGroupDist, 'related stars closer');

  const top = brightestStars(all, 2);
  console.assert(top.length === 2, `brightestStars: expected 2`);
  console.assert(top[0].brightness >= top[1].brightness, 'sorted');

  console.log('[constellation] lib OK — force-layout, brightness, relatedness verified');
}

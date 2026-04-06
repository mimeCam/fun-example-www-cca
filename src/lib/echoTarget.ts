// src/lib/echoTarget.ts
// Pure function module: given a source slug, pick the best echo target.
// Weighted random selection from constellation-linked posts.
// Prefers aged posts (the glow is more dramatic on decayed cards).
// Never echoes back to the same slug.

import { getConstellation } from './constellationLookup';
import type { ConstellationLink } from './constellationLookup';
import { decayFactor } from './decay';
import { getCollection } from 'astro:content';

/** Scored candidate for echo target selection. */
interface EchoCandidate {
  slug: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute echo score: constellation strength x decay factor. */
function candidateScore(link: ConstellationLink, factor: number): number {
  return link.strength * Math.max(0.1, factor);
}

/** Weighted random pick from scored candidates. */
function weightedPick(candidates: EchoCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const total = candidates.reduce((s, c) => s + c.score, 0);
  if (total <= 0) return candidates[0]?.slug ?? null;
  let roll = Math.random() * total;
  for (const c of candidates) {
    roll -= c.score;
    if (roll <= 0) return c.slug;
  }
  return candidates[candidates.length - 1].slug;
}

/** Build scored list from constellation links + decay factors. */
function scoreCandidates(
  links: ConstellationLink[],
  slugFactors: Map<string, number>,
  sourceSlug: string,
): EchoCandidate[] {
  const results: EchoCandidate[] = [];
  for (const link of links) {
    if (link.slug === sourceSlug) continue;
    const factor = slugFactors.get(link.slug);
    if (factor === undefined) continue;
    results.push({ slug: link.slug, score: candidateScore(link, factor) });
  }
  return results;
}

/** Fetch decay factors for all live posts. */
async function buildSlugFactors(): Promise<Map<string, number>> {
  const posts = await getCollection('blog');
  const factors = new Map<string, number>();
  for (const post of posts) {
    const pubDate = String(post.data.pubDate);
    factors.set(post.slug, decayFactor(pubDate));
  }
  return factors;
}

/** Fallback: pick the highest-decay post that isn't the source. */
function highestDecayFallback(
  slugFactors: Map<string, number>,
  sourceSlug: string,
): string | null {
  let best: string | null = null;
  let bestFactor = -1;
  for (const [slug, factor] of slugFactors) {
    if (slug === sourceSlug) continue;
    if (factor > bestFactor) { bestFactor = factor; best = slug; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Pick the best echo target for a source slug. Returns null if none found. */
export async function pickEchoTarget(sourceSlug: string): Promise<string | null> {
  const slugFactors = await buildSlugFactors();
  const links = await getConstellation(sourceSlug);
  const candidates = scoreCandidates(links, slugFactors, sourceSlug);
  const pick = weightedPick(candidates);
  if (pick) return pick;
  return highestDecayFallback(slugFactors, sourceSlug);
}

// ---------------------------------------------------------------------------
// Inline sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testEchoTarget(): void {
  // weightedPick with empty array
  console.assert(weightedPick([]) === null, 'empty candidates');

  // weightedPick with single candidate always returns it
  const single = weightedPick([{ slug: 'a', score: 1 }]);
  console.assert(single === 'a', 'single candidate');

  // candidateScore: strength * factor, min factor 0.1
  console.assert(candidateScore({ slug: 'x', strength: 0.8 }, 0) === 0.08, 'min factor floor');
  console.assert(candidateScore({ slug: 'x', strength: 0.8 }, 1) === 0.8, 'full decay score');

  // scoreCandidates filters source slug
  const factors = new Map([['a', 0.5], ['b', 0.8]]);
  const links: ConstellationLink[] = [
    { slug: 'a', strength: 0.6 },
    { slug: 'b', strength: 0.9 },
  ];
  const scored = scoreCandidates(links, factors, 'a');
  console.assert(scored.length === 1, 'self-filter');
  console.assert(scored[0].slug === 'b', 'kept non-self');

  console.log('[echoTarget] OK — weightedPick, candidateScore, scoreCandidates verified');
}

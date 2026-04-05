// src/lib/relatedness.ts
// Computes pairwise relatedness between stars/posts.
// Signals: same constellation (strong), explicit links (custom), default (weak).
// Returns 0–1. Used by force-layout to turn "related" into "nearby".

/** Explicit link declared in post frontmatter. */
interface ExplicitLink {
  slug: string;
  strength: number; // 0–1
}

/** Minimum info needed to judge relatedness. */
export interface RelatednessEntry {
  id: string;                    // post slug
  constellationName?: string;
  links?: ExplicitLink[];        // from frontmatter `constellation` array
}

/** Pre-indexed lookup table for O(1) pair queries. */
export interface RelatednessMap {
  score(a: string, b: string): number;
}

const SAME_GROUP = 0.7;
const DEFAULT_SCORE = 0.05;

/** Build a key for an unordered pair. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Index all entries into a fast lookup map. */
export function buildRelatedness(entries: RelatednessEntry[]): RelatednessMap {
  const scores = new Map<string, number>();
  const groups = new Map<string, string[]>();

  for (const e of entries) {
    if (!e.constellationName) continue;
    const g = groups.get(e.constellationName) ?? [];
    g.push(e.id);
    groups.set(e.constellationName, g);
  }

  // Same constellation → strong base
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        scores.set(pairKey(members[i], members[j]), SAME_GROUP);
      }
    }
  }

  // Explicit links override / boost
  for (const e of entries) {
    for (const link of e.links ?? []) {
      const key = pairKey(e.id, link.slug);
      const cur = scores.get(key) ?? 0;
      scores.set(key, Math.min(1, Math.max(cur, link.strength)));
    }
  }

  return {
    score: (a, b) => a === b ? 1 : (scores.get(pairKey(a, b)) ?? DEFAULT_SCORE),
  };
}

// src/lib/ambientLife.weight.ts
// Weighted random slug selection for phantom pulses.
// Posts closer to death get more phantom attention —
// "other readers are trying to save the dying ones."

export interface WeightedPost {
  slug: string;
  decayFactor: number; // 0 = fresh, 1 = dead
}

// ---------------------------------------------------------------------------
// Weight tiers — dying posts attract more phantom attention
// ---------------------------------------------------------------------------

function weightFor(decay: number): number {
  if (decay >= 0.7) return 3;
  if (decay >= 0.3) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Weighted random selection
// ---------------------------------------------------------------------------

/** Pick one slug via weighted random. Returns null if list is empty. */
export function pickWeightedSlug(posts: WeightedPost[]): string | null {
  if (posts.length === 0) return null;

  const weights = posts.map(p => weightFor(p.decayFactor));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < posts.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return posts[i].slug;
  }

  return posts[posts.length - 1].slug;
}

// ---------------------------------------------------------------------------
// Decay factor computation
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const DECAY_SPAN_DAYS = 365;

/** Compute decay factor (0–1) from publish date. */
export function decayFactor(pubDate: Date, now?: Date): number {
  const elapsed = (now ?? new Date()).getTime() - pubDate.getTime();
  const days = elapsed / DAY_MS;
  return Math.min(1, Math.max(0, days / DECAY_SPAN_DAYS));
}

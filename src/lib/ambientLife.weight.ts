// src/lib/ambientLife.weight.ts
// Weighted random slug selection for phantom pulses.
// Posts closer to death get more phantom attention —
// "other readers are trying to save the dying ones."
//
// Weight thresholds are now adaptive — in a young blog, even
// moderately decayed posts get high weight so phantom attention
// spreads visibly across the small post set.
//
// See: adaptiveDecay.ts for threshold computation.

import { getAdaptiveConfig } from './adaptiveDecay';

export interface WeightedPost {
  slug: string;
  decayFactor: number; // 0 = fresh, 1 = dead
}

// ---------------------------------------------------------------------------
// Weight tiers — adaptive thresholds from adaptive decay config
// ---------------------------------------------------------------------------

function defaultThresholds(): { high: number; mid: number } {
  return { high: 0.7, mid: 0.3 };
}

function activeThresholds(): { high: number; mid: number } {
  const cfg = getAdaptiveConfig();
  if (!cfg) return defaultThresholds();
  return { high: cfg.weightHighDecay, mid: cfg.weightMidDecay };
}

function weightFor(decay: number): number {
  const { high, mid } = activeThresholds();
  if (decay >= high) return 3;
  if (decay >= mid) return 2;
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
// Raw decay factor computation (no revival bonus — ambient layer only)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Compute raw decay factor (0–1) using adaptive maxDays. */
export function decayFactor(pubDate: Date, now?: Date): number {
  const cfg = getAdaptiveConfig();
  const span = cfg?.maxDays ?? 365;
  const elapsed = (now ?? new Date()).getTime() - pubDate.getTime();
  return Math.min(1, Math.max(0, elapsed / DAY_MS / span));
}

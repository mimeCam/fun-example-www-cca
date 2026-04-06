// src/lib/ambientLife.seed.ts
// Deterministic seeder for the Ambient Life Engine.
// Given post slugs and current counts, returns increment operations
// so every post starts with a believable revival baseline.
//
// Determinism: same slug always produces the same jitter value
// via a simple string hash. Restarting the server won't double-seed.
//
// Age-aware: older posts in a young blog get higher seed floors
// to bootstrap the visual contrast that the decay system needs.

export interface SeedOp {
  slug: string;
  incrementBy: number;
}

// ---------------------------------------------------------------------------
// Simple string hash (djb2) — deterministic, fast, good distribution
// ---------------------------------------------------------------------------

function hashSlug(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Jitter from slug hash — always the same for a given slug + jitter cap
// ---------------------------------------------------------------------------

function jitterFor(slug: string, jitter: number): number {
  if (jitter <= 0) return 0;
  return hashSlug(slug) % (jitter + 1);
}

// ---------------------------------------------------------------------------
// Age-aware floor boost — older posts get higher seed floors
// ---------------------------------------------------------------------------

/** Boost seed floor for older posts to create contrast in young blogs. */
function ageBoost(ageDays: number, maxAgeDays: number): number {
  if (maxAgeDays <= 0) return 0;
  const ratio = Math.min(1, ageDays / maxAgeDays);
  return Math.round(ratio * 3);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compute seed operations for posts below the floor. Pure function. */
export function computeSeeds(
  slugs: string[],
  currentCounts: Map<string, number>,
  floor: number,
  jitter: number,
): SeedOp[] {
  return slugs.reduce<SeedOp[]>((ops, slug) => {
    const target = floor + jitterFor(slug, jitter);
    const current = currentCounts.get(slug) ?? 0;
    if (current < target) {
      ops.push({ slug, incrementBy: target - current });
    }
    return ops;
  }, []);
}

/** Age-aware seeds — older posts in a young blog get higher targets. */
export function computeAgeAwareSeeds(
  posts: { slug: string; ageDays: number }[],
  currentCounts: Map<string, number>,
  floor: number,
  jitter: number,
  maxAgeDays: number,
): SeedOp[] {
  return posts.reduce<SeedOp[]>((ops, p) => {
    const boost = ageBoost(p.ageDays, maxAgeDays);
    const target = floor + boost + jitterFor(p.slug, jitter);
    const current = currentCounts.get(p.slug) ?? 0;
    if (current < target) {
      ops.push({ slug: p.slug, incrementBy: target - current });
    }
    return ops;
  }, []);
}

// src/lib/ambientLife.seed.ts
// Deterministic seeder for the Ambient Life Engine.
// Given post slugs and current counts, returns increment operations
// so every post starts with a believable revival baseline.
//
// Determinism: same slug always produces the same jitter value
// via a simple string hash. Restarting the server won't double-seed.

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

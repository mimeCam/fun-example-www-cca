// src/lib/constellationLookup.ts
// Server-side utility: resolves a slug's constellation connections from blog content.
// Caches at module level — content is static in hybrid mode.
// Filters self-references, clamps strength to [0, 1].

import { getCollection } from 'astro:content';

/** A single constellation connection. */
export interface ConstellationLink {
  slug: string;
  strength: number;
}

/** Module-level cache: populated once, reused across requests. */
let cache: Map<string, ConstellationLink[]> | null = null;

/** Clamp a number between min and max. */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Build the cache from blog collection frontmatter. */
async function buildCache(): Promise<Map<string, ConstellationLink[]>> {
  const posts = await getCollection('blog');
  const map = new Map<string, ConstellationLink[]>();

  for (const post of posts) {
    const raw = (post.data as Record<string, unknown>).constellation;
    if (!Array.isArray(raw)) continue;
    const links = filterLinks(raw, post.slug);
    if (links.length > 0) map.set(post.slug, links);
  }

  return map;
}

/** Parse, validate, and filter constellation links. */
function filterLinks(raw: unknown[], selfSlug: string): ConstellationLink[] {
  const results: ConstellationLink[] = [];

  for (const entry of raw) {
    if (!isLinkShape(entry)) continue;
    if (entry.slug === selfSlug) continue;
    results.push({ slug: entry.slug, strength: clamp(entry.strength, 0, 1) });
  }

  return results;
}

/** Type guard for raw frontmatter entries. */
function isLinkShape(v: unknown): v is { slug: string; strength: number } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.slug === 'string' && typeof obj.strength === 'number';
}

/** Get constellation connections for a slug. Returns [] if none. */
export async function getConstellation(slug: string): Promise<ConstellationLink[]> {
  if (!cache) cache = await buildCache();
  return cache.get(slug) ?? [];
}

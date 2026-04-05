// src/lib/postNav.ts
// Prev/next post navigation — pure computation, zero side-effects.
// Posts sorted newest-first. "Newer" = previous, "Older" = next.
// Returns display-ready data consumed by PostNav.astro.

import type { PostDisplayData } from './postMeta';

export interface PostNavLink {
  slug: string;
  title: string;
  href: string;
  freshness: string;
}

export interface PostNavPair {
  newer: PostNavLink | null;
  older: PostNavLink | null;
}

/** Finds the neighbouring posts for a given slug. */
export function getPostNav(
  slug: string,
  sorted: PostDisplayData[],
): PostNavPair {
  const idx = sorted.findIndex(p => p.slug === slug);
  if (idx === -1) return { newer: null, older: null };
  return {
    newer: idx > 0 ? toLink(sorted[idx - 1]) : null,
    older: idx < sorted.length - 1 ? toLink(sorted[idx + 1]) : null,
  };
}

function toLink(p: PostDisplayData): PostNavLink {
  return {
    slug: p.slug,
    title: p.title,
    href: `/blog/${p.slug}`,
    freshness: p.freshness,
  };
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testPostNav(): void {
  const fake = (s: string, t: string) => ({
    slug: s, title: t, freshness: 'recent',
  }) as PostDisplayData;

  const posts = [fake('c', 'C'), fake('b', 'B'), fake('a', 'A')];

  const mid = getPostNav('b', posts);
  console.assert(mid.newer?.slug === 'c', 'newer of b = c');
  console.assert(mid.older?.slug === 'a', 'older of b = a');

  const first = getPostNav('c', posts);
  console.assert(first.newer === null, 'c has no newer');
  console.assert(first.older?.slug === 'b', 'older of c = b');

  const last = getPostNav('a', posts);
  console.assert(last.newer?.slug === 'b', 'newer of a = b');
  console.assert(last.older === null, 'a has no older');

  const missing = getPostNav('z', posts);
  console.assert(missing.newer === null, 'missing → null');
  console.assert(missing.older === null, 'missing → null');

  console.log('[postNav] OK — prev/next pairs verified');
}

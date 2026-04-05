// src/lib/constellation-engine.ts
// Derives constellation data from blog post frontmatter at build time.
// Write a post with constellationName + starName → it becomes a star.
// No manual JSON. Single source of truth = content files.

import type { Constellation, Star } from './constellation';

interface PostEntry {
  slug: string;
  data: {
    title: string;
    pubDate: Date;
    constellationName?: string;
    starName?: string;
    magnitude?: number;
    description?: string;
  };
}

/** Build a Star from a blog post entry. */
function postToStar(post: PostEntry): Star {
  return {
    id: post.slug,
    label: post.data.starName ?? post.data.title,
    href: `/blog/${post.slug}`,
  };
}

/** Group posts by constellation name. */
function groupByConstellation(posts: PostEntry[]): Map<string, PostEntry[]> {
  const groups = new Map<string, PostEntry[]>();
  for (const post of posts) {
    const name = post.data.constellationName;
    if (!name) continue;
    const group = groups.get(name) ?? [];
    group.push(post);
    groups.set(name, group);
  }
  return groups;
}

/** Derive the constellation creation date from its oldest post. */
function oldestPubDate(posts: PostEntry[]): string {
  const sorted = [...posts].sort(
    (a, b) => a.data.pubDate.getTime() - b.data.pubDate.getTime(),
  );
  return sorted[0].data.pubDate.toISOString().slice(0, 10);
}

/** Sort stars by magnitude (brightest first), then by pubDate. */
function sortByMagnitude(posts: PostEntry[]): PostEntry[] {
  return [...posts].sort((a, b) => {
    const magDiff = (a.data.magnitude ?? 3) - (b.data.magnitude ?? 3);
    if (magDiff !== 0) return magDiff; // lower magnitude = brighter
    return a.data.pubDate.getTime() - b.data.pubDate.getTime();
  });
}

/**
 * Transform a blog content collection into Constellation[] format.
 * Drop-in replacement for the old constellations.json import.
 */
export function constellationsFromPosts(posts: PostEntry[]): Constellation[] {
  const groups = groupByConstellation(posts);
  const result: Constellation[] = [];

  for (const [name, members] of groups) {
    const sorted = sortByMagnitude(members);
    result.push({
      name,
      description: `${sorted.length} star${sorted.length === 1 ? '' : 's'} in this path.`,
      created: oldestPubDate(sorted),
      stars: sorted.map(postToStar),
    });
  }

  return result;
}

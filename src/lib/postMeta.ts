// src/lib/postMeta.ts
// Shared post metadata extraction — single source of truth for RSS, OG cards,
// and any future feature that needs structured post data at build time.
// Pure functions, zero dependencies beyond Astro content collections.
//
// TODO: add coverImage once content schema supports it

import type { CollectionEntry } from 'astro:content';
import { canonicalUrl, siteDefaults } from '../config/seo.config';
import { getReadingTime } from './readingTime';
import { hourToPhase } from './timeAmbient';
import type { TimePhase } from './timeAmbient';
import { decayFactor, freshnessTag, decayStyleString } from './decay';
import type { FreshnessTag } from './decay';

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  url: string;
  pubDate: Date;
  pubDateISO: string;
  readingTime: number;
  badge?: string;
}

/** Extracts structured metadata from a blog collection entry. */
export function extractMeta(post: CollectionEntry<'blog'>): PostMeta {
  return {
    slug: post.slug,
    title: post.data.title,
    description: post.data.description ?? '',
    url: canonicalUrl(`/blog/${post.slug}/`),
    pubDate: post.data.pubDate,
    pubDateISO: post.data.pubDate.toISOString(),
    readingTime: getReadingTime(post.body),
    badge: post.data.badge,
  };
}

/** Sorts posts newest-first and extracts metadata for each. */
export function allPostMeta(posts: CollectionEntry<'blog'>[]): PostMeta[] {
  const sorted = [...posts].sort(byNewest);
  return sorted.map(extractMeta);
}

/** Comparator: newest pubDate first. */
function byNewest(a: CollectionEntry<'blog'>, b: CollectionEntry<'blog'>): number {
  return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}

/** Returns the current server-side time phase for OG meta hints. */
export function currentPhase(): TimePhase {
  return hourToPhase(new Date().getHours());
}

// ---------------------------------------------------------------------------
// Unified display data — one call per post, used by homepage + blog pages
// ---------------------------------------------------------------------------

export interface PostDisplayData extends PostMeta {
  decay: number;
  freshness: FreshnessTag;
  decayStyle: string;
}

/** Bundles metadata + decay visuals for a single post. */
export function getPostDisplayData(
  post: CollectionEntry<'blog'>,
  now = new Date(),
): PostDisplayData {
  const meta = extractMeta(post);
  const factor = decayFactor(meta.pubDateISO, 365, now);
  return {
    ...meta,
    decay: factor,
    freshness: freshnessTag(factor),
    decayStyle: decayStyleString(factor),
  };
}

/** Display data for all posts, sorted newest-first. */
export function allPostDisplayData(
  posts: CollectionEntry<'blog'>[],
  now = new Date(),
): PostDisplayData[] {
  const sorted = [...posts].sort(byNewest);
  return sorted.map(p => getPostDisplayData(p, now));
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (leave in place — see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testPostMeta(): void {
  const fake = { slug: 'test', data: { title: 'T', pubDate: new Date(), description: 'D' }, body: 'word '.repeat(300) };
  const meta = extractMeta(fake as any);
  console.assert(meta.readingTime === 2, `expected 2min, got ${meta.readingTime}`);
  console.assert(meta.url.includes('/blog/test/'), 'url missing slug');
  console.assert(meta.pubDateISO.includes('T'), 'ISO date malformed');
  console.log('[postMeta] utility OK');
}

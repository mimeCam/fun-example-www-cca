// src/lib/postMeta.ts
// Shared post metadata extraction — single source of truth for RSS, OG cards,
// and any future feature that needs structured post data at build time.
// Pure functions, zero dependencies beyond Astro content collections.
//
// TODO: add coverImage once content schema supports it

import type { CollectionEntry } from 'astro:content';
import { canonicalUrl, siteDefaults } from '../config/seo.config';
import { getReadingTime } from './readingTime';
import { decayFactor, freshnessTag, decayStyleString, revivalBonus, dominantConviction } from './decay-engine';
import type { FreshnessTag, ConvictionVerdict } from './decay-engine';
import { getRevivalCounts, getRisenTimestamps, getAllReadingSeconds, getEntombedTimestamps, entombPost } from './collectiveMemory';
import { isEntombed, isRecentlyRisen } from './entomb';
import { isEndangered, urgencyLevel, daysUntilEntomb } from './endangered';
import type { UrgencyLevel } from './endangered';
import { daysSince } from './temporal';

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

// ---------------------------------------------------------------------------
// Unified display data — one call per post, used by homepage + blog pages
// ---------------------------------------------------------------------------

export interface PostDisplayData extends PostMeta {
  decay: number;
  freshness: FreshnessTag;
  decayStyle: string;
  revivalCount: number;
  revivalWarm: boolean;
  readingSeconds: number;
  entombed: boolean;
  entombedAt: Date | null;  // ISO timestamp from DB; null until first entombment is recorded
  endangered: boolean;
  endangeredUrgency: UrgencyLevel;
  endangeredDaysLeft: number;
  risenAt: Date | null;
  recentlyRisen: boolean;
  conviction: ConvictionVerdict | null;  // dominant verdict; null when no convictions declared
}

/** Max decay window in days. Hardcoded — adaptive config removed. */
function resolveMaxDays(): number {
  return 365;
}

/** Extracts dominant conviction verdict from a blog post's frontmatter. */
function postConviction(post: CollectionEntry<'blog'>): ConvictionVerdict | null {
  const verdicts = (post.data.convictions ?? []).map(c => c.verdict as ConvictionVerdict);
  return dominantConviction(verdicts);
}

/** Bundles metadata + decay visuals for a single post. */
export function getPostDisplayData(
  post: CollectionEntry<'blog'>,
  now = new Date(),
  revivals = 0,
  risenAt: Date | null = null,
  readingSeconds = 0,
  entombedAt: Date | null = null,
): PostDisplayData {
  const meta = extractMeta(post);
  const maxDays = resolveMaxDays();
  const conviction = postConviction(post);
  const factor = decayFactor(meta.pubDateISO, maxDays, now, revivals, readingSeconds, conviction);
  const warm = revivalBonus(revivals) > 0.15;
  const lastRevivalDays = lastRevivalDaysAgo(risenAt, now);
  const entombed = isEntombed(factor, lastRevivalDays);
  const endangered = isEndangered(factor);
  return {
    ...meta,
    decay: factor,
    freshness: freshnessTag(factor),
    decayStyle: decayStyleString(factor),
    revivalCount: revivals,
    revivalWarm: warm,
    readingSeconds,
    entombed,
    entombedAt,
    endangered,
    endangeredUrgency: urgencyLevel(factor),
    endangeredDaysLeft: daysUntilEntomb(factor),
    risenAt,
    recentlyRisen: isRecentlyRisen(risenAt, now),
    conviction,
  };
}

/** Days since last revival/resurrection, or Infinity if never revived. */
function lastRevivalDaysAgo(risenAt: Date | null, now: Date): number {
  if (!risenAt) return Infinity;
  const ms = now.getTime() - risenAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Display data for all posts, sorted newest-first. Single DB query per table. */
export function allPostDisplayData(
  posts: CollectionEntry<'blog'>[],
  now = new Date(),
): PostDisplayData[] {
  const counts = safeRevivalCounts();
  const risen = safeRisenTimestamps();
  const reading = safeReadingSeconds();
  const tombedAt = safeEntombedTimestamps();
  const sorted = [...posts].sort(byNewest);
  const result = sorted.map(p =>
    getPostDisplayData(
      p, now,
      counts.get(p.slug) ?? 0,
      risen.get(p.slug) ?? null,
      reading.get(p.slug) ?? 0,
      tombedAt.get(p.slug) ?? null,
    ),
  );
  recordNewlyEntombed(result, now);
  return result;
}

/**
 * For any post newly detected as entombed (no DB timestamp yet),
 * record today as entombed_at and patch the in-memory object.
 * Idempotent: entombPost() uses COALESCE — safe to call repeatedly.
 */
function recordNewlyEntombed(posts: PostDisplayData[], now: Date): void {
  for (const p of posts) {
    if (p.entombed && !p.entombedAt) {
      safeEntombPost(p.slug, now);
      p.entombedAt = now;
    }
  }
}

/** Graceful fallback: returns empty map if DB unavailable (e.g. SSG build). */
function safeRevivalCounts(): Map<string, number> {
  try { return getRevivalCounts(); }
  catch { return new Map(); }
}

/** Graceful fallback for risen timestamps. */
function safeRisenTimestamps(): Map<string, Date> {
  try { return getRisenTimestamps(); }
  catch { return new Map(); }
}

/** Graceful fallback for reading seconds. */
function safeReadingSeconds(): Map<string, number> {
  try { return getAllReadingSeconds(); }
  catch { return new Map(); }
}

/** Graceful fallback for entombed_at timestamps. */
function safeEntombedTimestamps(): Map<string, Date> {
  try { return getEntombedTimestamps(); }
  catch { return new Map(); }
}

/** Graceful write: record entombment; swallows errors during SSG builds. */
function safeEntombPost(slug: string, now: Date): void {
  try { entombPost(slug, now); }
  catch { /* DB unavailable at build time — skip silently */ }
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

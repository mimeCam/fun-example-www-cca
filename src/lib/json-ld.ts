// src/lib/json-ld.ts
// JSON-LD structured data — conviction-aware Article, WebSite, BreadcrumbList, ItemList.
// Single source of truth for all schema.org markup in the project.
//
// Design rules (Mike §napkin-plan):
//   - One function per schema type. No inheritance. No strategy pattern.
//   - Conviction state injected via additionalProperty (W3C-legal; Google parses it).
//   - No new npm deps — JSON.stringify only.
//   - Every function ≤ 10 lines. If it grows, extract a helper.
//
// Credits: Mike (napkin plan — architecture, data-flow, points of interest)

import type { PostMeta, PostDisplayData } from './postMeta';
import { canonicalUrl, siteDefaults, ogImageUrl } from '../config/seo.config';
import type { ConvictionVerdict } from './decay-engine';
import { ENTOMB_THRESHOLD } from './decay-engine';
import { ENDANGERED_THRESHOLD } from './endangered';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Author conviction at the moment of sealing — extracted from conviction_ledger. */
export interface ConvictionState {
  score: number;                   // 1–10
  verdict: ConvictionVerdict | null;
  sealedAt: string;                // ISO-8601 timestamp
}

/** Post lifecycle state — derived from decay factor at render time (SSR). */
export interface DecayState {
  lifecycle: 'LIVING' | 'ENDANGERED' | 'DEAD';
  daysRemaining: number;
  decayFactor: number;
}

/** A single breadcrumb navigation item. */
export interface BreadcrumbItem {
  name: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Internal primitives — kept tiny so they compose cleanly
// ---------------------------------------------------------------------------

/** schema.org @context prefix — one call, one shape. */
function ctx(): { '@context': string } {
  return { '@context': 'https://schema.org' };
}

/** A single schema:PropertyValue — the W3C-blessed extension vector (Mike §POI 1). */
function prop(name: string, value: string | number): object {
  return { '@type': 'PropertyValue', name, value };
}

/** Conviction + decay signals as PropertyValue array for additionalProperty. */
function convictionProps(conviction: ConvictionState | null, decay: DecayState): object[] {
  const base = [
    prop('convictionState', decay.lifecycle),
    prop('daysRemaining', decay.daysRemaining),
  ];
  if (!conviction) return base;
  const extra = [prop('convictionScore', conviction.score)];
  if (conviction.verdict) extra.push(prop('authorVerdict', conviction.verdict));
  return [...base, ...extra];
}

/** Core article fields shared by living and dead Article schemas. */
function articleBase(post: PostMeta): object {
  const { siteName } = siteDefaults();
  return {
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url: post.url,
    datePublished: post.pubDateISO,
    image: ogImageUrl(post.slug),
    author: { '@type': 'Person', name: siteName },
    publisher: { '@type': 'Organization', name: siteName, url: siteDefaults().siteUrl },
  };
}

/** Classify a decay factor into a lifecycle string. */
function decayLifecycle(factor: number): DecayState['lifecycle'] {
  if (factor >= ENTOMB_THRESHOLD) return 'DEAD';
  if (factor >= ENDANGERED_THRESHOLD) return 'ENDANGERED';
  return 'LIVING';
}

/** A ListItem entry for use inside ItemList schemas. */
function listItem(pos: number, name: string, url: string): object {
  return { '@type': 'ListItem', position: pos, name, url };
}

// ---------------------------------------------------------------------------
// Public helpers — pages call these, not the primitives above
// ---------------------------------------------------------------------------

/**
 * Derive DecayState from a PostDisplayData object.
 * Free rider on data already computed for UI (Mike §data-flow — no new DB queries).
 */
export function buildDecayState(post: PostDisplayData): DecayState {
  return {
    lifecycle: decayLifecycle(post.decay),
    daysRemaining: post.daysRemaining,
    decayFactor: post.decay,
  };
}

/**
 * Build a ConvictionState from raw ledger values (called in [slug].astro).
 * Returns null when the post has not been sealed yet.
 */
export function buildConvictionState(
  score: number | null,
  verdict: ConvictionVerdict | null,
  timestamp: number | null,
): ConvictionState | null {
  if (score == null || timestamp == null) return null;
  return { score, verdict, sealedAt: new Date(timestamp).toISOString() };
}

// ---------------------------------------------------------------------------
// Schema builders — one per schema type (Mike §modules)
// ---------------------------------------------------------------------------

/**
 * Article schema for a living blog post.
 * `dateModified` = seal timestamp — signals active authorial review to Google (Mike §POI 5).
 */
export function buildArticleSchema(
  post: PostMeta,
  conviction: ConvictionState | null,
  decay: DecayState,
): object {
  const base = articleBase(post) as Record<string, unknown>;
  if (conviction?.sealedAt) base.dateModified = conviction.sealedAt;
  return { ...ctx(), ...base, additionalProperty: convictionProps(conviction, decay) };
}

/**
 * Dead Article schema — same as Article but with dateExpired (valid schema.org property).
 * Used by graveyard tombstone entries (Mike §POI 2).
 */
export function buildTombstoneSchema(
  post: PostDisplayData,
  conviction: ConvictionState | null,
): object {
  const base = articleBase(post) as Record<string, unknown>;
  const expired = post.entombedAt?.toISOString() ?? post.pubDateISO;
  const decay: DecayState = { lifecycle: 'DEAD', daysRemaining: 0, decayFactor: post.decay };
  return { ...ctx(), ...base, dateExpired: expired, additionalProperty: convictionProps(conviction, decay) };
}

/** WebSite schema for the homepage — site-wide rich results (Mike §diagram). */
export function buildWebSiteSchema(): object {
  const site = siteDefaults();
  return {
    ...ctx(),
    '@type': 'WebSite',
    name: site.siteName,
    url: site.siteUrl,
    description: site.description,
  };
}

/**
 * BreadcrumbList schema for individual post pages.
 * Separate <script> tag keeps it easy to validate in Google Rich Results Test (Mike §POI 4).
 */
export function buildBreadcrumbSchema(items: BreadcrumbItem[]): object {
  return {
    ...ctx(),
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => listItem(i + 1, it.name, it.url)),
  };
}

/**
 * ItemList schema for the graveyard — frames dead posts as the honesty archive (Mike §POI 2).
 * Passes only slug + title per item; full tombstone schemas are emitted separately.
 */
export function buildGraveyardItemList(posts: PostDisplayData[]): object {
  return {
    ...ctx(),
    '@type': 'ItemList',
    name: 'Graveyard — Posts Lost to Time',
    description: `${posts.length} posts sealed by conviction, claimed by time.`,
    url: canonicalUrl('/graveyard'),
    numberOfItems: posts.length,
    itemListElement: posts.map((p, i) => listItem(i + 1, p.title, p.url)),
  };
}

// ---------------------------------------------------------------------------
// Serialisation — thin wrapper so callers don't touch JSON.stringify directly
// ---------------------------------------------------------------------------

/** Serialize one or more schema objects to a JSON string ready for <script> injection. */
export function serializeJsonLd(schema: object): string {
  return JSON.stringify(schema);
}

// ---------------------------------------------------------------------------
// Sanity checks (openloop/inplace-testing-howto.md pattern)
// ---------------------------------------------------------------------------

export function _testJsonLd(): void {
  const fakeMeta: PostMeta = {
    slug: 'test-post',
    title: 'Test Post',
    description: 'A test post.',
    url: 'https://persona.blog/blog/test-post/',
    pubDate: new Date('2026-01-01'),
    pubDateISO: '2026-01-01T00:00:00.000Z',
    readingTime: 3,
  };

  const conviction: ConvictionState = {
    score: 8,
    verdict: 'still-true',
    sealedAt: '2026-01-01T12:00:00.000Z',
  };

  const decay: DecayState = { lifecycle: 'LIVING', daysRemaining: 270, decayFactor: 0.12 };

  // Article schema
  const article = buildArticleSchema(fakeMeta, conviction, decay);
  const json = serializeJsonLd(article);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  console.assert(parsed['@context'] === 'https://schema.org', 'context');
  console.assert(parsed['@type'] === 'Article', 'type=Article');
  console.assert(parsed.headline === 'Test Post', 'headline');
  console.assert(parsed.dateModified === '2026-01-01T12:00:00.000Z', 'dateModified=sealedAt');
  const props = parsed.additionalProperty as Array<Record<string, unknown>>;
  console.assert(Array.isArray(props), 'additionalProperty is array');
  console.assert(props.some(p => p.name === 'convictionScore' && p.value === 8), 'convictionScore');
  console.assert(props.some(p => p.name === 'convictionState' && p.value === 'LIVING'), 'lifecycle');
  console.assert(props.some(p => p.name === 'authorVerdict' && p.value === 'still-true'), 'verdict');

  // No conviction — still gets lifecycle + daysRemaining
  const noConv = buildArticleSchema(fakeMeta, null, decay);
  const noConvParsed = JSON.parse(serializeJsonLd(noConv)) as Record<string, unknown>;
  const noConvProps = noConvParsed.additionalProperty as Array<Record<string, unknown>>;
  console.assert(!noConvProps.some(p => p.name === 'convictionScore'), 'no score when null conviction');
  console.assert(noConvProps.some(p => p.name === 'daysRemaining'), 'daysRemaining always present');

  // WebSite schema
  const site = buildWebSiteSchema();
  const siteParsed = JSON.parse(serializeJsonLd(site)) as Record<string, unknown>;
  console.assert(siteParsed['@type'] === 'WebSite', 'WebSite type');
  console.assert(typeof siteParsed.name === 'string', 'site name');

  // Breadcrumb schema
  const crumb = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://persona.blog/' },
    { name: 'Test Post', url: 'https://persona.blog/blog/test-post/' },
  ]);
  const crumbParsed = JSON.parse(serializeJsonLd(crumb)) as Record<string, unknown>;
  console.assert(crumbParsed['@type'] === 'BreadcrumbList', 'BreadcrumbList type');
  const items = crumbParsed.itemListElement as Array<Record<string, unknown>>;
  console.assert(items.length === 2, '2 breadcrumb items');
  console.assert(items[0].position === 1, 'position 1');
  console.assert(items[1].name === 'Test Post', 'post name in crumb');

  // buildDecayState thresholds
  const livingPost = { decay: 0.3, daysRemaining: 200 } as PostDisplayData;
  console.assert(buildDecayState(livingPost).lifecycle === 'LIVING', 'LIVING');
  const endangeredPost = { decay: 0.85, daysRemaining: 20 } as PostDisplayData;
  console.assert(buildDecayState(endangeredPost).lifecycle === 'ENDANGERED', 'ENDANGERED');
  const deadPost = { decay: 0.96, daysRemaining: 0 } as PostDisplayData;
  console.assert(buildDecayState(deadPost).lifecycle === 'DEAD', 'DEAD');

  // buildConvictionState
  console.assert(buildConvictionState(null, null, null) === null, 'null when no score');
  const cs = buildConvictionState(7, 'evolved', 1700000000000);
  console.assert(cs !== null && cs.score === 7, 'score=7');
  console.assert(cs !== null && cs.verdict === 'evolved', 'verdict=evolved');

  console.log('[json-ld] OK — all checks passed');
}

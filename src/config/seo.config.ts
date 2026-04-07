// src/config/seo.config.ts
// Shared SEO defaults and helpers — every page resolves meta through here.
// Single source of truth for site identity, canonical URLs, and OG defaults.
//
// JSON-LD structured data: see src/lib/json-ld.ts — all schema builders live there.
// TODO: add per-mood OG image URL builder once dynamic OG endpoint ships

export interface SiteMeta {
  title: string;
  description: string;
  siteUrl: string;
  siteName: string;
  defaultImage: string;
  locale: string;
  twitterHandle: string;
}

export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedAt?: string;
}

export interface ResolvedMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  type: 'website' | 'article';
  siteName: string;
  locale: string;
  twitterHandle: string;
  publishedAt?: string;
}

const SITE: SiteMeta = {
  title: 'Persona Blog',
  description: 'An atmospheric personal blog that shifts with mood, time, and season.',
  siteUrl: import.meta.env.SITE ?? 'https://persona.blog',
  siteName: 'Persona Blog',
  defaultImage: '/og-default.png',
  locale: 'en_US',
  twitterHandle: '',
};

/** Build a canonical URL from a relative path. */
export function canonicalUrl(path: string): string {
  const base = SITE.siteUrl.replace(/\/+$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

/** Merge page-level overrides with site defaults. */
export function resolveMeta(page: PageMeta): ResolvedMeta {
  return {
    title: page.title ?? SITE.title,
    description: page.description ?? SITE.description,
    image: absoluteImage(page.image ?? SITE.defaultImage),
    url: page.url ?? SITE.siteUrl,
    type: page.type ?? 'website',
    siteName: SITE.siteName,
    locale: SITE.locale,
    twitterHandle: SITE.twitterHandle,
    publishedAt: page.publishedAt,
  };
}

function absoluteImage(src: string): string {
  if (src.startsWith('http')) return src;
  return canonicalUrl(src);
}

/** Expose site defaults for read-only use. */
export function siteDefaults(): Readonly<SiteMeta> {
  return SITE;
}

/** Build the dynamic OG image URL for a blog post slug. */
export function ogImageUrl(slug: string): string {
  return canonicalUrl(`/api/og/${slug}.png`);
}

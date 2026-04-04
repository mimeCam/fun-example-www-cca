// src/pages/feed.xml.ts
// Static RSS 2.0 feed — generated at build time, zero external dependencies.
// Self-hosted, no APIs, no databases. Outputs valid XML that any reader can parse.
//
// Astro prerendering: this runs once at build → /feed.xml in dist/.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { allPostMeta } from '../lib/postMeta';
import { siteDefaults, canonicalUrl } from '../config/seo.config';
import type { PostMeta } from '../lib/postMeta';

export const prerender = true;

/** Escapes XML special characters in text content. */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Renders a single <item> element from PostMeta. */
function renderItem(m: PostMeta): string {
  return [
    `    <item>`,
    `      <title>${escapeXml(m.title)}</title>`,
    `      <link>${m.url}</link>`,
    `      <guid isPermaLink="true">${m.url}</guid>`,
    `      <pubDate>${m.pubDate.toUTCString()}</pubDate>`,
    `      <description>${escapeXml(m.description)}</description>`,
    `    </item>`,
  ].join('\n');
}

/** Renders the full RSS 2.0 XML document. */
function renderFeed(site: { title: string; description: string; siteUrl: string }, items: PostMeta[]): string {
  const feedUrl = canonicalUrl('/feed.xml');
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${escapeXml(site.title)}</title>`,
    `    <link>${site.siteUrl}</link>`,
    `    <description>${escapeXml(site.description)}</description>`,
    `    <language>en-us</language>`,
    `    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>`,
    ...items.map(renderItem),
    `  </channel>`,
    `</rss>`,
  ].join('\n');
}

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const meta = allPostMeta(posts);
  const site = siteDefaults();
  const xml = renderFeed(site, meta);
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

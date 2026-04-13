// src/pages/api/batting-average-embed.ts
// Portable batting average widget — JSON, HTML, or SVG badge.
// The "embeddable credential" for external portability (Elon's insight #2).
//
// GET /api/batting-average-embed?author=ada&format=json  → JSON payload
// GET /api/batting-average-embed?author=ada&format=html  → self-contained HTML widget
// GET /api/batting-average-embed?author=ada&format=svg   → shields.io-style badge
//
// Default format: json. Default author: 'host'.
// Cache: public, max-age=3600, stale-while-revalidate=86400
//
// Credits: Mike (Portability Kit spec), Elon (make BA portable),
//          Paul Kim (OG card IS the invite), Tanya (embed visual spec)

import type { APIRoute } from 'astro';
import {
  getBattingAverageResult,
  type TrophyTier,
} from '../../lib/batting-average';
import { canonicalUrl } from '../../config/seo.config';
import { getCollection } from 'astro:content';

export const prerender = false;

// ---------------------------------------------------------------------------
// Cache + response helpers
// ---------------------------------------------------------------------------

function headers(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: headers('application/json'),
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200, headers: headers('text/html; charset=utf-8'),
  });
}

function svgResponse(body: string): Response {
  return new Response(body, {
    status: 200, headers: headers('image/svg+xml'),
  });
}

function errorJson(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tier display helpers
// ---------------------------------------------------------------------------

const TIER_HEX: Record<TrophyTier, string> = {
  locked:  '#666666',
  bronze:  '#C8874B',
  silver:  '#B0B8C8',
  gold:    '#F5A623',
  diamond: '#D8E8F8',
};

function tierLabel(tier: TrophyTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------

function buildJsonPayload(
  authorSlug: string,
  r: ReturnType<typeof getBattingAverageResult>,
): Record<string, unknown> {
  return {
    author: authorSlug,
    battingAverage: r.battingAverage,
    trophyTier: r.trophyTier,
    resolvedCorrect: r.resolvedCorrect,
    resolvedTotal: r.resolvedTotal,
    selectivityRate: r.selectivityRate,
    eligible: r.eligible,
    verifyUrl: canonicalUrl(`/author/${authorSlug}`),
    ogImageUrl: canonicalUrl(
      `/api/og/batting-average.png?author=${authorSlug}`,
    ),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// HTML format — self-contained widget with inline styles
// ---------------------------------------------------------------------------

function buildHtmlWidget(
  authorSlug: string,
  r: ReturnType<typeof getBattingAverageResult>,
): string {
  const pct = r.eligible && r.battingAverage !== null
    ? `${Math.round(r.battingAverage * 100)}%`
    : '—';
  const tier = r.trophyTier;
  const color = TIER_HEX[tier];
  const url = canonicalUrl(`/author/${authorSlug}`);
  return buildWidgetMarkup(authorSlug, pct, tier, color, url);
}

function buildWidgetMarkup(
  name: string, pct: string, tier: TrophyTier,
  color: string, url: string,
): string {
  return `<div class="ba-embed" style="all:initial;display:inline-flex;align-items:center;gap:12px;padding:12px 16px;background:#0c0c0e;border:1px solid ${color}33;border-radius:12px;font-family:-apple-system,system-ui,sans-serif;color:#e0e0e0;text-decoration:none;">
  <span style="font-size:28px;font-weight:700;color:${color};font-family:ui-monospace,monospace;letter-spacing:-0.02em;">${pct}</span>
  <span style="display:flex;flex-direction:column;gap:2px;">
    <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.88);">${escapeHtml(name)}</span>
    <span style="font-size:11px;color:${color};text-transform:uppercase;letter-spacing:0.08em;">${tier}</span>
  </span>
  <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="font-size:10px;color:rgba(255,255,255,0.45);text-decoration:underline;margin-left:auto;">verify</a>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// SVG format — shields.io-style flat badge
// ---------------------------------------------------------------------------

function buildSvgBadge(
  authorSlug: string,
  r: ReturnType<typeof getBattingAverageResult>,
): string {
  const pct = r.eligible && r.battingAverage !== null
    ? `${Math.round(r.battingAverage * 100)}%`
    : '—';
  const tier = r.trophyTier;
  const color = TIER_HEX[tier];
  return renderBadgeSvg(authorSlug, pct, tier, color);
}

function renderBadgeSvg(
  name: string, pct: string,
  tier: TrophyTier, color: string,
): string {
  const label = escapeHtml(name);
  const value = `${pct} · ${tierLabel(tier)}`;
  const lw = label.length * 7 + 16;
  const vw = value.length * 7 + 16;
  const w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <rect width="${lw}" height="20" fill="#333"/>
  <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
  <g fill="#fff" font-family="Verdana,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14" text-anchor="middle">${label}</text>
    <text x="${lw + vw / 2}" y="14" text-anchor="middle" fill="#000" opacity="0.85">${escapeHtml(value)}</text>
  </g>
</svg>`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ url }) => {
  const authorSlug = url.searchParams.get('author') ?? 'host';
  const format = url.searchParams.get('format') ?? 'json';

  if (!['json', 'html', 'svg'].includes(format)) {
    return errorJson('Invalid format. Use: json, html, svg.');
  }

  const allPosts = await getCollection('blog');
  const result = getBattingAverageResult(authorSlug, allPosts.length);

  if (format === 'html') return htmlResponse(buildHtmlWidget(authorSlug, result));
  if (format === 'svg') return svgResponse(buildSvgBadge(authorSlug, result));
  return jsonResponse(buildJsonPayload(authorSlug, result));
};

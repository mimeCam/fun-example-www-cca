// src/lib/og/accountabilityLayout.ts
// Satori JSX tree builder for accountability OG cards.
// Accountability-first design: batting average is the hero, not decay aesthetics.
// One public export: accountabilityLayout(data) → satori element tree.
//
// Layout: 1200×630 · three variants: cold | post | home
// Colors match Tanya's locked token set (7 tokens, amber as sole trust signal).
//
// Credits: Mike (arch spec §OG-Accountability-Card-v2), Tanya (UX §color-system)

import type { AccountabilityOGData } from './accountabilityData';

// ---------------------------------------------------------------------------
// Design tokens — Tanya's locked set, never diverge
// ---------------------------------------------------------------------------

const C = {
  bg:       '#0c0c0e',
  surface:  '#1a1a1f',
  amber:    '#F5A623',
  text:     '#e8e8ec',
  dim:      '#6b6b80',
  dimFaint: 'rgba(255,255,255,0.08)',
  sealed:   '#22c55e',
} as const;

type El = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Primitive builders — one responsibility, ≤10 lines each
// ---------------------------------------------------------------------------

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

function outerStyle(): Record<string, unknown> {
  return {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    width: '1200px', height: '630px', padding: '60px 70px',
    background: C.bg, fontFamily: 'sans-serif',
  };
}

function outerContainer(children: El[]): El {
  return { type: 'div', props: { style: outerStyle(), children } };
}

function siteName(name: string): El {
  return el('div', { fontSize: '18px', fontWeight: 400, color: C.dim, letterSpacing: '0.12em' }, name.toUpperCase());
}

function sealedPill(label: string, color: string): El {
  return el('div', {
    fontSize: '13px', fontWeight: 700, color: C.bg,
    background: color, borderRadius: '8px', padding: '5px 14px', letterSpacing: '0.08em',
  }, label);
}

function header(name: string, badge?: { label: string; color: string }): El {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      children: [
        siteName(name),
        badge ? sealedPill(badge.label, badge.color) : el('div', {}, undefined),
      ],
    },
  };
}

function heroNumber(pct: number): El {
  return el('div', { fontSize: '96px', fontWeight: 700, color: C.amber, lineHeight: '1', letterSpacing: '-0.02em' }, `${pct}%`);
}

function heroLabel(text: string): El {
  return el('div', { fontSize: '20px', fontWeight: 400, color: C.dim, letterSpacing: '0.06em', marginTop: '4px' }, text);
}

function heroBlock(pct: number, label: string): El {
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'column' }, children: [heroNumber(pct), heroLabel(label)] } };
}

function coldHeroBlock(): El {
  return {
    type: 'div',
    props: { style: { display: 'flex', flexDirection: 'column' }, children: [
      el('div', { fontSize: '80px', fontWeight: 700, color: C.dim, lineHeight: '1' }, '—'),
      el('div', { fontSize: '20px', fontWeight: 400, color: C.dim, marginTop: '4px' }, 'no verdicts sealed yet'),
    ]},
  };
}

function titleText(title: string): El {
  return el('div', { fontSize: '34px', fontWeight: 700, color: C.text, lineHeight: '1.2' }, truncate(title, 58));
}

function descText(desc: string): El {
  return el('div', { fontSize: '19px', fontWeight: 400, color: C.dim, lineHeight: '1.4', marginTop: '10px' }, truncate(desc, 100));
}

function titleBlock(title: string, description?: string): El {
  const children: El[] = [titleText(title)];
  if (description) children.push(descText(description));
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'column' }, children } };
}

// ---------------------------------------------------------------------------
// Footer bar — stat chips separated by mid-dots
// ---------------------------------------------------------------------------

function chip(text: string): El {
  return el('div', { fontSize: '17px', fontWeight: 400, color: C.dim }, text);
}

function midDot(): El {
  return el('div', { fontSize: '17px', color: C.dim, opacity: '0.35' }, '·');
}

function chipRow(parts: string[]): El[] {
  return parts.flatMap((p, i) => i < parts.length - 1 ? [chip(p), midDot()] : [chip(p)]);
}

function footerBar(parts: string[]): El {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px',
        borderTop: `1px solid ${C.dimFaint}`, paddingTop: '20px',
      },
      children: chipRow(parts),
    },
  };
}

// ---------------------------------------------------------------------------
// Per-variant footer part builders
// ---------------------------------------------------------------------------

type PostData = Extract<AccountabilityOGData, { variant: 'post' }>;
type HomeData = Extract<AccountabilityOGData, { variant: 'home' }>;

function postFooterParts(d: PostData): string[] {
  const parts: string[] = [];
  if (d.correct > 0) parts.push(`${d.correct} correct`);
  if (d.pending > 0) parts.push(`${d.pending} pending`);
  if (d.overdue > 0) parts.push(`${d.overdue} overdue`);
  parts.push(d.freshness);
  return parts.length > 1 ? parts : ['no predictions', d.freshness];
}

function homeFooterParts(d: HomeData): string[] {
  const parts: string[] = [`${d.correct} correct`];
  if (d.wrong > 0)   parts.push(`${d.wrong} wrong`);
  if (d.pending > 0) parts.push(`${d.pending} pending`);
  parts.push(`${d.sealedCount} sealed`);
  return parts;
}

// ---------------------------------------------------------------------------
// Per-variant layout assemblers
// ---------------------------------------------------------------------------

type ColdData = Extract<AccountabilityOGData, { variant: 'cold' }>;

function coldLayout(d: ColdData): El {
  const showTitle = d.title !== d.siteName;
  return outerContainer([
    header(d.siteName),
    coldHeroBlock(),
    showTitle ? titleBlock(d.title, d.description) : el('div', {}, undefined),
    footerBar(['seal predictions to activate']),
  ]);
}

function postLayout(d: PostData): El {
  const sealLabel = d.isSealed ? (d.anchored ? '⚓ ANCHORED' : 'SEALED') : 'OPEN';
  const sealColor = d.isSealed ? C.sealed : C.amber;
  return outerContainer([
    header(d.siteName, { label: sealLabel, color: sealColor }),
    heroBlock(d.battingPct, 'batting average'),
    titleBlock(d.title, d.description),
    footerBar(postFooterParts(d)),
  ]);
}

function homeLayout(d: HomeData): El {
  return outerContainer([
    header(d.siteName),
    heroBlock(d.battingPct, 'batting average'),
    el('div', { fontSize: '26px', fontWeight: 400, color: C.dim }, 'public accountability scoreboard'),
    footerBar(homeFooterParts(d)),
  ]);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}\u2026`;
}

// ---------------------------------------------------------------------------
// Public API — single entry point
// ---------------------------------------------------------------------------

/** Build a satori-compatible element tree for a 1200×630 accountability OG card. */
export function accountabilityLayout(data: AccountabilityOGData): El {
  if (data.variant === 'cold') return coldLayout(data);
  if (data.variant === 'post') return postLayout(data);
  return homeLayout(data);
}

// src/lib/og/battingAverageLayout.ts
// Satori JSX tree builder for the dedicated batting average OG share card.
// Design spec: Tanya §20 — 1200×630, amber pct hero, progress bar, HMAC badge.
// Separate from accountabilityLayout to allow independent evolution.
// Pure function; zero side-effects; no DB access.
//
// Credits: Tanya (UX spec §20), Mike (arch spec — battingAverageLayout)

import type { BattingAverage } from '../batting-average';

// ---------------------------------------------------------------------------
// Design tokens — Tanya's locked amber system, §24
// ---------------------------------------------------------------------------

const C = {
  bg:    '#0c0c0e',
  amber: '#F5A623',
  dim:   'rgba(255,255,255,0.55)',
  faint: 'rgba(255,255,255,0.28)',
  quiet: 'rgba(255,255,255,0.08)',
  grey:  'rgba(255,255,255,0.45)',
  green: 'rgba(80,200,100,0.85)',
  red:   'rgba(230,100,100,0.85)',
} as const;

type El = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Primitive — single shared element builder
// ---------------------------------------------------------------------------

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

function outerStyle(): Record<string, unknown> {
  return {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    width: '1200px', height: '630px', padding: '60px 70px',
    background: C.bg, fontFamily: 'sans-serif',
  };
}

function outerWrap(children: El[]): El {
  return { type: 'div', props: { style: outerStyle(), children } };
}

// ---------------------------------------------------------------------------
// Header row: site name (left) + optional HMAC badge (right)
// ---------------------------------------------------------------------------

function namePlate(siteName: string): El {
  return el('div', { fontSize: '18px', color: C.grey, letterSpacing: '0.12em' }, siteName.toUpperCase());
}

function hmacBadge(): El {
  return el('div', {
    fontSize: '12px', fontWeight: 700, color: C.amber, padding: '5px 14px',
    borderRadius: '6px', border: '1px solid rgba(245,166,35,0.3)',
    background: 'rgba(245,166,35,0.08)', letterSpacing: '0.06em',
  }, 'HMAC SEALED');
}

function headerRow(siteName: string, showBadge: boolean): El {
  const rowStyle = { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' };
  return { type: 'div', props: { style: rowStyle, children: [namePlate(siteName), showBadge ? hmacBadge() : el('div', {}, undefined)] } };
}

// ---------------------------------------------------------------------------
// Hero block: large pct number + subtitle
// ---------------------------------------------------------------------------

function pctNumber(pct: number): El {
  return el('div', { fontSize: '96px', fontWeight: 700, color: C.amber, lineHeight: '1', letterSpacing: '-0.02em' }, `${pct}%`);
}

function pctSubtitle(): El {
  return el('div', { fontSize: '24px', fontWeight: 400, color: C.dim }, 'of sealed bets held true');
}

function pctHero(pct: number): El {
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [pctNumber(pct), pctSubtitle()] } };
}

// ---------------------------------------------------------------------------
// Cold state hero: em dash + "no verdicts" label
// ---------------------------------------------------------------------------

function coldNumber(): El {
  return el('div', { fontSize: '96px', fontWeight: 700, color: 'rgba(255,255,255,0.15)', lineHeight: '1' }, '\u2014');
}

function coldSubtitle(): El {
  return el('div', { fontSize: '24px', fontWeight: 400, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }, 'No resolved bets yet \u2014 clock running.');
}

function coldHero(): El {
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [coldNumber(), coldSubtitle()] } };
}

// ---------------------------------------------------------------------------
// Progress bar: amber fill over quiet track (Tanya §20)
// ---------------------------------------------------------------------------

function barFill(pct: number): El {
  return el('div', { width: `${pct}%`, height: '8px', background: C.amber, borderRadius: '4px 0 0 4px' }, undefined);
}

function progressBar(correct: number, total: number): El {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const track = { display: 'flex', height: '8px', borderRadius: '4px', background: C.quiet };
  return { type: 'div', props: { style: track, children: [barFill(pct)] } };
}

// ---------------------------------------------------------------------------
// Stats row: correct · wrong · pending chips
// ---------------------------------------------------------------------------

function statChip(label: string, color: string): El {
  return el('div', { fontSize: '18px', fontWeight: 400, color, fontFamily: 'monospace' }, label);
}

function midDot(): El {
  return el('div', { fontSize: '18px', color: 'rgba(255,255,255,0.22)' }, '\u00b7');
}

function statsRow(correct: number, wrong: number, pending: number): El {
  const items = [
    statChip(`${correct} correct`, C.green), midDot(),
    statChip(`${wrong} wrong`, C.red),       midDot(),
    statChip(`${pending} pending`, C.grey),
  ];
  return { type: 'div', props: { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' }, children: items } };
}

// ---------------------------------------------------------------------------
// Footer row: fine print (left) + site domain (right)
// ---------------------------------------------------------------------------

function footerRow(siteName: string): El {
  const style = { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' };
  return {
    type: 'div',
    props: {
      style,
      children: [
        el('div', { fontSize: '16px', color: C.faint }, 'Conviction sealed before publication. Score anchored to GitHub. Tamper-evident.'),
        el('div', { fontSize: '20px', color: C.grey }, siteName.toLowerCase()),
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Per-variant assemblers
// ---------------------------------------------------------------------------

function liveLayout(avg: Extract<BattingAverage, { status: 'live' }>, siteName: string): El {
  const total = avg.correct + avg.wrong + avg.pending;
  return outerWrap([
    headerRow(siteName, true),
    pctHero(avg.pct),
    progressBar(avg.correct, total),
    statsRow(avg.correct, avg.wrong, avg.pending),
    footerRow(siteName),
  ]);
}

function coldLayout(siteName: string): El {
  return outerWrap([
    headerRow(siteName, false),
    coldHero(),
    el('div', {}, undefined),
    el('div', { fontSize: '16px', color: 'rgba(255,255,255,0.22)' }, 'The clock is running.'),
    footerRow(siteName),
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build a satori-compatible element tree for the 1200×630 batting average share card. */
export function battingAverageLayout(avg: BattingAverage, siteName: string): El {
  if (avg.status === 'live') return liveLayout(avg, siteName);
  return coldLayout(siteName);
}

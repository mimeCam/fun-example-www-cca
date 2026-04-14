// src/lib/og/auditLayout.ts
// Satori element tree for the conviction audit OG card.
// Single-panel layout (simpler than split-panel batting average card).
// Design: evidence exhibit — title, score, verdict outcome, proof anchors.
// Colors: locked token set from accountabilityLayout.ts — never diverge.
// Credits: Mike (napkin plan §api/og/audit/[slug].png), Tanya (UX §11)

import type { VerdictDisplay } from '../verdict-display';
import { COLORS } from '../design-tokens';

// ---------------------------------------------------------------------------
// Design tokens — derived from shared design-tokens.ts (single source)
// ---------------------------------------------------------------------------

const C = {
  bg:       COLORS.surfaceBase,
  surface:  COLORS.surfaceRaised,
  amber:    COLORS.gold,
  text:     COLORS.text,
  dim:      COLORS.dim,
  dimFaint: 'rgba(255,255,255,0.08)',
  green:    COLORS.verdictTrue,
  red:      COLORS.verdictWrong,
  violet:   COLORS.verdictEvolved,
} as const;

type El = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Primitive builders — one responsibility, ≤ 10 lines each
// ---------------------------------------------------------------------------

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

function outerContainer(children: El[]): El {
  return el('div', {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    width: '1200px', height: '630px', padding: '60px 70px',
    background: C.bg, fontFamily: 'sans-serif',
  }, children);
}

function eyebrow(text: string): El {
  return el('div', { fontSize: '16px', fontWeight: 400, color: C.dim, letterSpacing: '0.14em' }, text);
}

function titleText(title: string): El {
  const t = title.length > 52 ? `${title.slice(0, 51)}\u2026` : title;
  return el('div', { fontSize: '38px', fontWeight: 700, color: C.text, lineHeight: '1.2', marginTop: '8px' }, t);
}

function scoreRow(score: number | null, sealedAt: number | null): El {
  const scoreStr = score !== null ? `${score}/10` : '—/10';
  const dateStr  = sealedAt ? new Date(sealedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const parts    = [scoreStr, dateStr].filter(Boolean).join('   ·   ');
  return el('div', { fontSize: '22px', fontWeight: 400, color: C.dim, marginTop: '12px' }, parts);
}

function verdictColor(vd: VerdictDisplay | null): string {
  if (!vd || !vd.verdict) return C.dim;
  if (vd.verdict === 'still-true') return C.green;
  if (vd.verdict === 'wrong' || vd.verdict === 'abandoned') return C.red;
  return C.violet; // evolved
}

function verdictPill(vd: VerdictDisplay | null): El {
  const label   = vd ? vd.verdictLabel.toUpperCase() : 'NOT YET SEALED';
  const color   = verdictColor(vd);
  const prefix  = vd?.isContested ? '⚠ ' : vd?.verdict === 'still-true' ? '✓ ' : vd?.verdict ? '✗ ' : '';
  return el('div', {
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', marginTop: '28px',
  }, [
    el('div', {
      fontSize: '15px', fontWeight: 700, color: C.bg, background: color,
      borderRadius: '8px', padding: '6px 18px', letterSpacing: '0.08em',
    }, `${prefix}${label}`),
    scoreContribChip(vd),
  ]);
}

function scoreContribChip(vd: VerdictDisplay | null): El {
  if (!vd || !vd.verdict) return el('div', {}, undefined);
  const labels: Record<VerdictDisplay['scoreContrib'], string> = {
    correct: '✓ correct',  wrong: '✗ wrong',
    neutral: '~ neutral',  contested: '⊘ excluded',  pending: '◌ pending',
  };
  return el('div', { fontSize: '15px', fontWeight: 400, color: C.dim }, labels[vd.scoreContrib]);
}

function divider(): El {
  return el('div', { width: '48px', height: '1px', background: C.dimFaint, marginTop: '24px' }, undefined);
}

function footer(sealed: boolean): El {
  const parts = sealed ? ['RFC 3161', 'Bitcoin Anchored'] : ['Not yet sealed'];
  const text  = parts.join('   ·   ');
  return el('div', {
    fontSize: '15px', fontWeight: 400, color: C.dim,
    borderTop: `1px solid ${C.dimFaint}`, paddingTop: '20px',
  }, text);
}

// ---------------------------------------------------------------------------
// Public types + API
// ---------------------------------------------------------------------------

export interface AuditOGData {
  title:    string;
  score:    number | null;
  sealedAt: number | null;
  verdict:  VerdictDisplay | null;
}

/** Build a satori-compatible element tree for the 1200×630 audit OG card. */
export function auditLayout(data: AuditOGData): El {
  return outerContainer([
    eyebrow('CONVICTION AUDIT'),
    el('div', { display: 'flex', flexDirection: 'column' }, [
      titleText(data.title),
      scoreRow(data.score, data.sealedAt),
      verdictPill(data.verdict),
      divider(),
    ]),
    footer(data.score !== null),
  ]);
}

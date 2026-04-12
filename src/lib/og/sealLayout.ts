// src/lib/og/sealLayout.ts
// Satori element tree for the conviction seal OG share card — 1200×630.
// Shows: title, score bar, sealed date, HMAC fingerprint, batting average.
// Design tokens mirrored from auditLayout.ts — no divergence (Tanya §9 gold discipline).
// Credits: Mike (napkin plan §api/og/seal/[slug].png), Tanya (§5 shareable card spec)

// ---------------------------------------------------------------------------
// Design tokens — locked amber system
// ---------------------------------------------------------------------------

const C = {
  bg:      '#0c0c0e',
  surface: '#141418',
  amber:   '#F5A623',
  amberDim:'rgba(245,166,35,0.55)',
  amberBg: 'rgba(245,166,35,0.08)',
  text:    '#e8e8ec',
  dim:     '#6b6b80',
  faint:   'rgba(255,255,255,0.08)',
  border:  'rgba(245,166,35,0.25)',
} as const;

type El = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Primitive — single shared element builder
// ---------------------------------------------------------------------------

function el(type: string, style: Record<string, unknown>, children?: unknown): El {
  return { type, props: { style, children } };
}

// ---------------------------------------------------------------------------
// Section builders — each ≤ 10 lines
// ---------------------------------------------------------------------------

function shell(children: El[]): El {
  return el('div', {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    width: '1200px', height: '630px', padding: '56px 72px',
    background: C.bg, fontFamily: 'sans-serif',
  }, children);
}

function eyebrow(sealedAt: number | null): El {
  const label = 'CONVICTION SEALED';
  const date  = sealedAt
    ? new Date(sealedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const text  = date ? `${label}  ·  ${date}` : label;
  return el('div', { fontSize: '15px', fontWeight: 400, color: C.amberDim, letterSpacing: '0.14em' }, text);
}

function titleBlock(title: string): El {
  const t = title.length > 68 ? `${title.slice(0, 67)}\u2026` : title;
  return el('div', {
    fontSize: '42px', fontWeight: 700, color: C.text,
    lineHeight: '1.22', maxWidth: '800px',
  }, t);
}

function scoreBar(score: number): El {
  const filled  = score / 10;
  const barW    = 480;
  const fillPx  = Math.round(barW * filled);
  return el('div', { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }, [
    el('div', { display: 'flex', alignItems: 'baseline', gap: '8px' }, [
      el('div', { fontSize: '28px', fontWeight: 700, color: C.amber }, `${score}/10`),
      el('div', { fontSize: '15px', fontWeight: 400, color: C.dim }, 'conviction score'),
    ]),
    el('div', { width: `${barW}px`, height: '6px', background: C.faint, borderRadius: '3px' }, [
      el('div', { width: `${fillPx}px`, height: '6px', background: C.amber, borderRadius: '3px' }, undefined),
    ]),
  ]);
}

function metaRow(label: string, value: string): El {
  return el('div', { display: 'flex', gap: '16px', alignItems: 'baseline' }, [
    el('div', { fontSize: '14px', color: C.dim, minWidth: '120px' }, label),
    el('div', { fontSize: '14px', color: C.amberDim }, value),
  ]);
}

function metaBlock(hmacHint: string | null, battingPct: number | null): El {
  const hmacText = hmacHint ? `${hmacHint}…` : null;
  const avgText  = battingPct !== null ? `${Math.round(battingPct * 100)}% track record` : null;
  const rows: El[] = [];
  if (hmacText) rows.push(metaRow('Fingerprint', hmacText));
  if (avgText)  rows.push(metaRow('Author avg', avgText));
  return el('div', { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '20px' }, rows);
}

function tagline(): El {
  return el('div', {
    fontSize: '18px', fontWeight: 400, color: C.dim, fontStyle: 'italic',
    borderTop: `1px solid ${C.faint}`, paddingTop: '20px',
  }, 'I staked my credibility on this. Dispute me.');
}

// ---------------------------------------------------------------------------
// Public types + API
// ---------------------------------------------------------------------------

export interface SealOGData {
  title:      string;
  score:      number | null;
  sealedAt:   number | null;
  hmacHint:   string | null;
  battingPct: number | null;
}

/** Build a satori-compatible element tree for the 1200×630 seal share card. */
export function sealLayout(data: SealOGData): El {
  const body: El[] = [titleBlock(data.title)];
  if (data.score !== null) body.push(scoreBar(data.score));
  body.push(metaBlock(data.hmacHint, data.battingPct));
  return shell([
    eyebrow(data.sealedAt),
    el('div', { display: 'flex', flexDirection: 'column' }, body),
    tagline(),
  ]);
}

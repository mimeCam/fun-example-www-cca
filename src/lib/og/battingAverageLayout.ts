// src/lib/og/battingAverageLayout.ts
// Satori JSX tree builder for the batting average OG share card.
// Supports both sitewide and per-author cards.
// Design spec: Tanya §20/§SS24 — 1200×630, amber pct hero, progress bar, HMAC badge.
// Pure function; zero side-effects; no DB access.
//
// Credits: Tanya (UX spec §20, §SS24), Mike (arch spec — Portability Kit)

import type { BattingAverage, TrophyTier } from '../batting-average';
import type { RecordStage } from '../record-stage';
import { COLORS } from '../design-tokens';
import {
  STAGE_TEXT_PRIMARY_OPACITY,
  STAGE_TITLE_WEIGHT,
} from '../stage-tokens.generated';

// ---------------------------------------------------------------------------
// Author identity — optional context for per-author OG cards
// ---------------------------------------------------------------------------

export interface OGAuthor {
  slug: string;
  name: string;
  tier: TrophyTier;
  selectivity: number | null;
  /** Record-age stage — drives the v143 inversion on the OG card too.
   *  Optional; omission is treated as `'fresh'`. Parity with the live page
   *  is the whole point (Mike napkin §7.3, Paul polish-ship §7.2). */
  recordStage?: RecordStage;
}

// ---------------------------------------------------------------------------
// Record-age typography — Satori cannot read CSS custom props, so the two
// stage tables ship via codegen in `stage-tokens.generated.ts` (sourced
// from `src/styles/tokens.css`). Editing the TS mirror is forbidden; the
// guard fails the build if it drifts from the CSS truth.
//
// Surface transform: the OG card is rgba-over-dark, so stage opacity is
// composited with 0.88 (= --text-primary base alpha). Cap at 0.88 = the
// endangered ceiling; DOM does not need this because CSS opacity applies
// post-paint on top of the :root text-primary ramp. Keep the multiplier
// out of the generated file (Mike §6.3 / Elon §5) — it is a surface
// transform, not a grammar value.
// ---------------------------------------------------------------------------

/** Satori composite max: the :root `--text-primary` alpha. */
const SATORI_TEXT_PRIMARY_ALPHA = 0.88;

function nameColorForStage(stage: RecordStage): string {
  const opacity = STAGE_TEXT_PRIMARY_OPACITY[stage];
  const composite = Math.min(opacity, 1) * SATORI_TEXT_PRIMARY_ALPHA;
  return `rgba(255,255,255,${composite.toFixed(3)})`;
}

// ---------------------------------------------------------------------------
// Design tokens — derived from shared design-tokens.ts (single source)
// Layout-specific alpha composites kept local (Satori needs raw rgba).
// ---------------------------------------------------------------------------

const C = {
  bg:    COLORS.surfaceBase,
  amber: COLORS.gold,
  dim:   'rgba(255,255,255,0.55)',    // --text-secondary
  faint: 'rgba(255,255,255,0.28)',    // ~--text-ghost + slight lift
  quiet: 'rgba(255,255,255,0.08)',    // --surface-hover
  grey:  'rgba(255,255,255,0.45)',    // between --text-ghost and --text-secondary
  green: 'rgba(80,200,100,0.85)',     // semantic: verdict-correct
  red:   'rgba(230,100,100,0.85)',    // semantic: verdict-wrong
  ghost: 'rgba(255,255,255,0.22)',    // --text-ghost
  white: 'rgba(255,255,255,0.88)',    // --text-primary
} as const;

// Trophy tier color map — mirrors --ba-tier-* in tokens.css
const TIER_COLOR: Record<TrophyTier, string> = {
  locked:  'rgba(255,255,255,0.38)',
  bronze:  COLORS.tierBronze,
  silver:  COLORS.tierSilver,
  gold:    COLORS.tierGold,
  diamond: COLORS.tierDiamond,
};

// Trophy tier symbols — simple chars that render in all Satori fonts
const TIER_GLYPH: Record<TrophyTier, string> = {
  locked:  '○',
  bronze:  '●',
  silver:  '◈',
  gold:    '◆',
  diamond: '◇',
};

type El = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Primitive — single shared element builder
// ---------------------------------------------------------------------------

function el(
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): El {
  return { type, props: { style, children } };
}

// ---------------------------------------------------------------------------
// Layout shell — 1200×630 dark card
// ---------------------------------------------------------------------------

function outerWrap(children: El[]): El {
  const style = {
    display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between',
    width: '1200px', height: '630px', padding: '60px 70px',
    background: C.bg, fontFamily: 'sans-serif',
  };
  return { type: 'div', props: { style, children } };
}

// ---------------------------------------------------------------------------
// Header row: site name (left) + optional HMAC badge (right)
// ---------------------------------------------------------------------------

function namePlate(siteName: string): El {
  const style = {
    fontSize: '18px', color: C.grey,
    letterSpacing: '0.12em',
  };
  return el('div', style, siteName.toUpperCase());
}

function hmacBadge(): El {
  return el('div', {
    fontSize: '12px', fontWeight: 700, color: C.amber,
    padding: '5px 14px', borderRadius: '6px',
    border: '1px solid rgba(245,166,35,0.3)',
    background: 'rgba(245,166,35,0.08)',
    letterSpacing: '0.06em',
  }, 'HMAC SEALED');
}

function headerRow(siteName: string, showBadge: boolean): El {
  const style = {
    display: 'flex', flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  };
  const right = showBadge ? hmacBadge() : el('div', {});
  return { type: 'div', props: { style, children: [namePlate(siteName), right] } };
}

// ---------------------------------------------------------------------------
// Author name row — only rendered for per-author cards
// ---------------------------------------------------------------------------

function authorNameRow(author: OGAuthor): El {
  const tierColor = TIER_COLOR[author.tier];
  const glyph = TIER_GLYPH[author.tier];
  const stage: RecordStage = author.recordStage ?? 'fresh';
  // v143 inversion: author *voice* softens with record age (Mike napkin §7).
  const nameColor = nameColorForStage(stage);
  const style = {
    display: 'flex', flexDirection: 'row',
    alignItems: 'center', gap: '14px',
  };
  return { type: 'div', props: { style, children: [
    el('div', { fontSize: '14px', color: tierColor }, glyph),
    el('div', {
      fontSize: '28px', fontWeight: 600,
      color: nameColor, letterSpacing: '-0.01em',
    }, author.name),
    tierBadge(author.tier),
  ] } };
}

function tierBadge(tier: TrophyTier): El {
  const color = TIER_COLOR[tier];
  return el('div', {
    fontSize: '13px', fontWeight: 700,
    color, padding: '3px 12px',
    borderRadius: '6px',
    border: `1px solid ${color}`,
    background: 'rgba(255,255,255,0.04)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  }, tier);
}

// ---------------------------------------------------------------------------
// Hero block: large pct number + subtitle
// ---------------------------------------------------------------------------

function pctNumber(
  pct: number, tier?: TrophyTier, stage: RecordStage = 'fresh',
): El {
  const color = tier ? TIER_COLOR[tier] : C.amber;
  // Weight now reads from the generated STAGE_TITLE_WEIGHT (sourced from
  // --stage-*-title-weight in tokens.css). One table, every surface.
  const fontWeight = STAGE_TITLE_WEIGHT[stage];
  const letterSpacing = stage === 'fossil' ? '-0.04em'
                      : stage === 'ghost'  ? '-0.03em'
                      :                      '-0.02em';
  return el('div', {
    fontSize: '96px', fontWeight,
    color, lineHeight: '1', letterSpacing,
  }, `${pct}%`);
}

function pctSubtitle(author?: OGAuthor): El {
  const text = author
    ? 'of sealed bets held true'
    : 'of sealed bets held true';
  return el('div', {
    fontSize: '24px', fontWeight: 400, color: C.dim,
  }, text);
}

function pctHero(pct: number, author?: OGAuthor): El {
  const tier = author?.tier;
  const stage = author?.recordStage ?? 'fresh';
  const style = {
    display: 'flex', flexDirection: 'column', gap: '4px',
  };
  return { type: 'div', props: { style, children: [
    pctNumber(pct, tier, stage), pctSubtitle(author),
  ] } };
}

// ---------------------------------------------------------------------------
// Cold state hero: em dash + "no verdicts" label
// ---------------------------------------------------------------------------

function coldNumber(): El {
  return el('div', {
    fontSize: '96px', fontWeight: 700,
    color: 'rgba(255,255,255,0.15)', lineHeight: '1',
  }, '\u2014');
}

function coldSubtitle(author?: OGAuthor): El {
  const text = author
    ? '5 verdicts to unlock batting average'
    : 'No resolved bets yet \u2014 clock running.';
  return el('div', {
    fontSize: '24px', fontWeight: 400,
    color: 'rgba(255,255,255,0.3)', fontStyle: 'italic',
  }, text);
}

function coldHero(author?: OGAuthor): El {
  const style = {
    display: 'flex', flexDirection: 'column', gap: '4px',
  };
  return { type: 'div', props: { style, children: [
    coldNumber(), coldSubtitle(author),
  ] } };
}

// ---------------------------------------------------------------------------
// Progress bar: amber fill over quiet track (Tanya §20)
// ---------------------------------------------------------------------------

function barFill(pct: number, tier?: TrophyTier): El {
  const color = tier ? TIER_COLOR[tier] : C.amber;
  return el('div', {
    width: `${pct}%`, height: '8px',
    background: color, borderRadius: '4px 0 0 4px',
  });
}

function progressBar(
  correct: number, total: number, tier?: TrophyTier,
): El {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const style = {
    display: 'flex', height: '8px',
    borderRadius: '4px', background: C.quiet,
  };
  return { type: 'div', props: { style, children: [barFill(pct, tier)] } };
}

// ---------------------------------------------------------------------------
// Stats row: correct · wrong · pending chips
// ---------------------------------------------------------------------------

function statChip(label: string, color: string): El {
  return el('div', {
    fontSize: '18px', fontWeight: 400,
    color, fontFamily: 'monospace',
  }, label);
}

function midDot(): El {
  return el('div', { fontSize: '18px', color: C.ghost }, '\u00b7');
}

function statsRow(
  correct: number, wrong: number, pending: number,
): El {
  const items = [
    statChip(`${correct} correct`, C.green), midDot(),
    statChip(`${wrong} wrong`, C.red),       midDot(),
    statChip(`${pending} pending`, C.grey),
  ];
  const style = {
    display: 'flex', flexDirection: 'row',
    alignItems: 'center', gap: '10px',
  };
  return { type: 'div', props: { style, children: items } };
}

// ---------------------------------------------------------------------------
// Selectivity chip — "sealed 8 of 12 posts — 67% skin in the game"
// ---------------------------------------------------------------------------

function selectivityChip(author: OGAuthor): El | null {
  if (author.selectivity === null) return null;
  const pct = Math.round(author.selectivity * 100);
  const text = `${pct}% selectivity · skin in the game`;
  return el('div', {
    fontSize: '14px', color: C.grey,
    fontFamily: 'monospace', letterSpacing: '0.02em',
  }, text);
}

// ---------------------------------------------------------------------------
// Footer row: fine print (left) + site domain (right)
// ---------------------------------------------------------------------------

function footerRow(siteName: string): El {
  const style = {
    display: 'flex', flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'flex-end',
  };
  const fine = 'Conviction sealed before publication. Tamper-evident.';
  return { type: 'div', props: { style, children: [
    el('div', { fontSize: '16px', color: C.faint }, fine),
    el('div', { fontSize: '20px', color: C.grey }, siteName.toLowerCase()),
  ] } };
}

// ---------------------------------------------------------------------------
// Per-variant assemblers
// ---------------------------------------------------------------------------

function liveLayout(
  avg: Extract<BattingAverage, { status: 'live' }>,
  siteName: string,
  author?: OGAuthor,
): El {
  const total = avg.correct + avg.wrong + avg.pending;
  const children: El[] = [headerRow(siteName, true)];
  if (author) children.push(authorNameRow(author));
  children.push(pctHero(avg.pct, author));
  children.push(progressBar(avg.correct, total, author?.tier));
  children.push(statsRow(avg.correct, avg.wrong, avg.pending));
  if (author) {
    const chip = selectivityChip(author);
    if (chip) children.push(chip);
  }
  children.push(footerRow(siteName));
  return outerWrap(children);
}

function coldLayout(siteName: string, author?: OGAuthor): El {
  const children: El[] = [headerRow(siteName, false)];
  if (author) children.push(authorNameRow(author));
  children.push(coldHero(author));
  children.push(el('div', {}));
  const hint = author
    ? 'The clock is running.'
    : 'The clock is running.';
  children.push(el('div', { fontSize: '16px', color: C.ghost }, hint));
  children.push(footerRow(siteName));
  return outerWrap(children);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a satori-compatible element tree for the 1200×630 batting average card.
 * When `author` is provided, renders a per-author card with name, tier, selectivity.
 * Falls back to the sitewide card when `author` is omitted.
 */
export function battingAverageLayout(
  avg: BattingAverage,
  siteName: string,
  author?: OGAuthor,
): El {
  if (avg.status === 'live') return liveLayout(avg, siteName, author);
  return coldLayout(siteName, author);
}

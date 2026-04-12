// src/lib/batting-average-chip.ts
// Per-author chip display adapter — resolves batting average into a 3-state shape.
// cold = 0 resolved verdicts | provisional = 1–4 | live = ≥5 (Elon n-mandate).
// Gold appears ONLY in live+strong. IBM Plex Mono enforced by chip CSS.
//
// Credits: Mike Koch (arch spec §BattingAverageChip), Elon (n≥5 confidence mandate)

import { getSealsByAuthor, getVerdictEventsForSlugs } from './conviction-ledger';
import { tallyVerdicts, toPercent } from './batting-average';
import type { Counts } from './batting-average';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChipState    = 'cold' | 'provisional' | 'live';
export type ChipColorMod = 'cold' | 'provisional' | 'strong' | 'mid' | 'weak';

export interface BattingAverageChipData {
  state:    ChipState;
  pct:      string;     // "82%" | "—"
  count:    number;     // resolved verdict count (correct + wrong + evolved)
  total:    number;     // total sealed posts for this author
  colorMod: ChipColorMod;
  label:    string;     // "5 verdicts" | "provisional" | ""
  countStr: string;     // "(3/4)" provisional only | "" otherwise
}

// Elon's mandate: n<5 statistically meaningless — show provisional label.
const LIVE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Pure classifiers — no DB, no side effects
// ---------------------------------------------------------------------------

function resolveState(resolved: number): ChipState {
  if (resolved === 0) return 'cold';
  return resolved < LIVE_THRESHOLD ? 'provisional' : 'live';
}

function resolveColorMod(state: ChipState, pct: number): ChipColorMod {
  if (state !== 'live') return state;
  if (pct >= 80) return 'strong';
  if (pct >= 60) return 'mid';
  return 'weak';
}

function formatLabel(state: ChipState, count: number): string {
  if (state === 'cold') return '';
  if (state === 'provisional') return 'provisional';
  return `${count} verdict${count !== 1 ? 's' : ''}`;
}

function formatCountStr(state: ChipState, count: number, total: number): string {
  return state === 'provisional' ? `(${count}/${total})` : '';
}

// ---------------------------------------------------------------------------
// Builder — pure after DB calls are done
// ---------------------------------------------------------------------------

function buildChipData(counts: Counts, totalSeals: number): BattingAverageChipData {
  const resolved = counts.correct + counts.wrong + counts.evolved;
  const state    = resolveState(resolved);
  const pctNum   = state === 'cold' ? 0 : toPercent(counts.correct, counts.wrong, counts.evolved);
  return {
    state,
    pct:      state === 'cold' ? '—' : `${pctNum}%`,
    count:    resolved,
    total:    totalSeals,
    colorMod: resolveColorMod(state, pctNum),
    label:    formatLabel(state, resolved),
    countStr: formatCountStr(state, resolved, totalSeals),
  };
}

function coldChip(): BattingAverageChipData {
  return { state: 'cold', pct: '—', count: 0, total: 0, colorMod: 'cold', label: '', countStr: '' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resolves per-author batting average into chip display shape. DB-safe (returns cold). */
export function getBattingAverageChipData(authorSlug: string): BattingAverageChipData {
  try {
    const seals  = getSealsByAuthor(authorSlug);
    if (!seals.length) return coldChip();
    const slugs  = seals.map(s => s.post_slug);
    const events = getVerdictEventsForSlugs(slugs);
    const counts = tallyVerdicts(events, seals.length);
    return buildChipData(counts, seals.length);
  } catch { return coldChip(); }
}

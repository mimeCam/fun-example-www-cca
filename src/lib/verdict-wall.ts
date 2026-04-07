// src/lib/verdict-wall.ts
// Pure sort + categorization for the Verdict Wall (/verdict).
// No DB calls — consumes PostDisplayData[] + StanceDistribution map.
// Pure functions, O(n log n), no side effects, trivially testable.
//
// VerdictFilter now uses conviction outcome (correct/wrong/pending) per
// Tanya §VerdictPage — single filter row, equal visual weight for wrong.
//
// Credits: Michael Koch (arch spec — Verdict Wall napkin plan),
//          Tanya Donska (UX spec — filter states, sort order, outcome filter)

import type { PostDisplayData } from './postMeta';
import type { StanceDistribution } from './stance-ledger';
import type { TensionLabel } from './tension-score';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerdictState     = 'living' | 'endangered' | 'revived' | 'fossil';
export type ConvictionOutcome = 'correct' | 'wrong' | 'pending';
export type VerdictFilter    = 'all' | ConvictionOutcome;

export interface VerdictPost extends PostDisplayData {
  verdictState:  VerdictState;
  agreeCount:    number;
  tornCount:     number;
  disagreeCount: number;
  agreePct:      number;
  tornPct:       number;
  disagreePct:   number;
  stanceTotal:   number;
}

export interface VerdictWallStats {
  total:      number;
  // conviction-outcome counts (drive filter tabs — Tanya §VerdictPage)
  correct:    number;
  wrong:      number;
  pending:    number;
  // decay-state counts (still used for stats bar + VerdictCard badge)
  living:     number;
  endangered: number;
  revived:    number;
  fossil:     number;
  contested:  number;
}

export interface VerdictWall {
  posts: VerdictPost[];
  stats: VerdictWallStats;
}

// ---------------------------------------------------------------------------
// State derivation — discriminated, no polymorphism
// ---------------------------------------------------------------------------

/** Fossil beats revived beats endangered beats living. Order matters. */
function resolveState(p: PostDisplayData): VerdictState {
  if (p.entombed)      return 'fossil';
  if (p.recentlyRisen) return 'revived';
  if (p.endangered)    return 'endangered';
  return 'living';
}

/**
 * Maps runtime verdict → conviction outcome for filter matching.
 * Mirrors index.astro matchesFilter logic — single source of truth.
 * 'correct' = still-true; 'wrong' = wrong|abandoned; 'pending' = everything else.
 */
function resolveOutcome(p: PostDisplayData): ConvictionOutcome {
  const v = p.runtimeVerdict ?? p.conviction;
  if (v === 'still-true') return 'correct';
  if (v === 'wrong' || v === 'abandoned') return 'wrong';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Sort keys
// ---------------------------------------------------------------------------

/** Contested posts surface first within each state group. */
function tensionRank(label: TensionLabel | undefined): number {
  if (label === 'contested') return 0;
  if (label === 'consensus') return 1;
  return 2; // indifferent / no data
}

/** Living → Endangered → Revived → Fossil. */
function stateRank(s: VerdictState): number {
  return ['living', 'endangered', 'revived', 'fossil'].indexOf(s);
}

/** Primary: state. Secondary: tension. Tertiary: most decayed first. */
function compareVerdictPosts(a: VerdictPost, b: VerdictPost): number {
  const sd = stateRank(a.verdictState) - stateRank(b.verdictState);
  if (sd !== 0) return sd;
  const td = tensionRank(a.tensionResult?.label) - tensionRank(b.tensionResult?.label);
  if (td !== 0) return td;
  return b.decay - a.decay;
}

// ---------------------------------------------------------------------------
// Stance percentage helpers
// ---------------------------------------------------------------------------

/** Safe integer percentage — never NaN, never >100. */
function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/** Extracts display-ready stance counts + percentages from a distribution. */
function stanceFields(dist: StanceDistribution | undefined) {
  if (!dist) {
    return { agreeCount: 0, tornCount: 0, disagreeCount: 0,
             agreePct: 0, tornPct: 0, disagreePct: 0, stanceTotal: 0 };
  }
  return {
    agreeCount:    dist.agree,
    tornCount:     dist.torn,
    disagreeCount: dist.disagree,
    stanceTotal:   dist.total,
    agreePct:      pct(dist.agree,    dist.total),
    tornPct:       pct(dist.torn,     dist.total),
    disagreePct:   pct(dist.disagree, dist.total),
  };
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/** Merges display data + distribution into a VerdictPost. */
function toVerdictPost(
  p: PostDisplayData,
  dists: Map<string, StanceDistribution>,
): VerdictPost {
  return { ...p, verdictState: resolveState(p), ...stanceFields(dists.get(p.slug)) };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Aggregate wall-level counts from enriched posts. */
function buildStats(posts: VerdictPost[]): VerdictWallStats {
  const s: VerdictWallStats = {
    total: posts.length,
    correct: 0, wrong: 0, pending: 0,
    living: 0, endangered: 0, revived: 0, fossil: 0,
    contested: 0,
  };
  for (const p of posts) {
    s[p.verdictState]++;
    s[resolveOutcome(p)]++;
    if (p.tensionResult?.label === 'contested') s.contested++;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build sorted, enriched verdict wall from display data + raw stance counts. */
export function buildVerdictWall(
  displayData: PostDisplayData[],
  dists: Map<string, StanceDistribution>,
): VerdictWall {
  const posts = displayData.map(p => toVerdictPost(p, dists)).sort(compareVerdictPosts);
  return { posts, stats: buildStats(posts) };
}

/** Filter posts by conviction outcome. 'all' returns everything. */
export function filterPosts(posts: VerdictPost[], filter: VerdictFilter): VerdictPost[] {
  if (filter === 'all') return posts;
  return posts.filter(p => resolveOutcome(p) === filter);
}

/** Validates an untrusted filter string from query params. */
export function parseFilter(raw: string | null): VerdictFilter {
  const valid: VerdictFilter[] = ['all', 'correct', 'wrong', 'pending'];
  return valid.includes(raw as VerdictFilter) ? (raw as VerdictFilter) : 'all';
}

// ---------------------------------------------------------------------------
// Isolated sanity check
// ---------------------------------------------------------------------------

export function _testVerdictWall(): void {
  const empty = buildVerdictWall([], new Map());
  console.assert(empty.posts.length === 0,  'empty posts');
  console.assert(empty.stats.total === 0,   'empty stats');
  console.assert(parseFilter(null)      === 'all',     'null → all');
  console.assert(parseFilter('xyz')     === 'all',     'unknown → all');
  console.assert(parseFilter('correct') === 'correct', 'correct passthrough');
  console.assert(parseFilter('wrong')   === 'wrong',   'wrong passthrough');
  console.assert(parseFilter('pending') === 'pending', 'pending passthrough');
  console.assert(parseFilter('fossil')  === 'all',     'fossil no longer valid');
  console.log('[verdict-wall] OK');
}

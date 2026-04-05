// src/lib/now.ts
// Shared utilities for the /now page.
// Reads the hand-edited now.json, computes staleness from the update date,
// and returns display-ready data. Zero side-effects, zero dependencies.
//
// The "staleness" mechanic is the soul of this module: neglect the page
// long enough and it starts talking back to your visitors.
//
// TODO: wire _testNowLib() into a build sanity step

import type { MoodId } from './mood';
import { daysSince as _daysSince, decay } from './temporal';

// Re-export for backward compat — canonical home is temporal.ts
export const daysSince = _daysSince;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NowEntry {
  emoji: string;
  text: string;
}

/** Legacy flat shape — kept for type compat. */
export interface NowData {
  mood: MoodId;
  updated: string;
  doing: NowEntry[];
  thinking: string;
  location?: string;
}

/** A single item in the three-tier now structure. */
export interface NowItem {
  emoji: string;
  text: string;
  updated: string;       // ISO date
  thinking?: string;     // only rightNow uses this
}

/** An archived item — residue that crossed the PURGE threshold. */
export interface ArchiveItem {
  emoji: string;
  text: string;
  updated: string;          // ISO date — when originally active
  changed_mind?: string;    // optional retrospective note
}

/** Three-tier data shape stored in now.json. */
export interface NowTiered {
  mood: MoodId;
  rightNow: NowItem;
  season: NowItem[];
  residue: NowItem[];
  archive?: ArchiveItem[];  // fourth tier — memory
  location?: string;
}

/** Tier label for each now item after partition logic runs. */
export type NowTier = 'hero' | 'season' | 'residue' | 'archive' | 'empty';

/** A computed now item ready for rendering. */
export interface ComputedNowItem {
  item: NowItem;
  tier: NowTier;
  decay: number;         // 0–1 continuous
  freshness: FreshnessInfo;
}

export type Freshness = 'fresh' | 'recent' | 'stale' | 'dormant';

export interface FreshnessInfo {
  level: Freshness;
  days: number;
  label: string;
  quip: string;         // personality line shown on page
}

// ---------------------------------------------------------------------------
// Staleness thresholds (days)
// ---------------------------------------------------------------------------

const FRESH_MAX  = 7;
const RECENT_MAX = 30;
const STALE_MAX  = 90;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Map a day count to a Freshness level. */
export function freshnessLevel(days: number): Freshness {
  if (days <= FRESH_MAX)  return 'fresh';
  if (days <= RECENT_MAX) return 'recent';
  if (days <= STALE_MAX)  return 'stale';
  return 'dormant';
}

/** Human-friendly label for a freshness level. */
export function freshnessLabel(level: Freshness): string {
  const labels: Record<Freshness, string> = {
    fresh:   'Updated just now',
    recent:  'Updated recently',
    stale:   'A while ago…',
    dormant: 'Gone quiet',
  };
  return labels[level];
}

/** The snarky quip that gives the staleness mechanic personality. */
export function freshnessQuip(level: Freshness): string {
  const quips: Record<Freshness, string> = {
    fresh:   'This page is piping hot.',
    recent:  'Still reasonably accurate, probably.',
    stale:   'The author wandered off. This is what they were last seen doing.',
    dormant: "If this page were milk, you'd smell it from here.",
  };
  return quips[level];
}

/** One-call convenience: turn an update date into full FreshnessInfo. */
export function computeFreshness(updated: string, now = new Date()): FreshnessInfo {
  const days  = daysSince(updated, now);
  const level = freshnessLevel(days);
  return { level, days, label: freshnessLabel(level), quip: freshnessQuip(level) };
}

/** Continuous decay value: 0 = just updated, 1 = fully dormant. */
export function computeDecay(updated: string, now = new Date()): number {
  const days = daysSince(updated, now);
  return Math.min(1, days / STALE_MAX);
}

// ---------------------------------------------------------------------------
// Three-tier partition logic
// ---------------------------------------------------------------------------

const HERO_MAX_DAYS  = 90;   // hero decay ceiling
const SEASON_MAX_DAYS = 60;  // season items decay faster
const HERO_DEMOTE_DAYS = 30; // auto-demote hero after this

/** Max items per tier — constraints ARE the design. */
const MAX_SEASON  = 4;
const MAX_RESIDUE = 8;
const PURGE_DAYS  = 180;

/** Quips specific to the "empty hero" state. */
export function emptyHeroQuip(): string {
  return 'The author is somewhere, doing something. Probably.';
}

/** Compute a single NowItem into a renderable ComputedNowItem. */
export function computeNowItem(
  item: NowItem, tier: NowTier, maxDays: number, now = new Date(),
): ComputedNowItem {
  const d = decay(item.updated, maxDays, now);
  const freshness = computeFreshness(item.updated, now);
  return { item, tier, decay: d, freshness };
}

/**
 * Partition a NowTiered data object into render-ready tiers.
 * Auto-demotes hero if stale. Purges residue older than 180 days.
 * Returns { hero, season, residue } arrays of ComputedNowItem.
 */
export function partitionNow(data: NowTiered, now = new Date()) {
  const heroDays = daysSince(data.rightNow.updated, now);
  const heroActive = heroDays <= HERO_DEMOTE_DAYS;

  const hero = heroActive
    ? [computeNowItem(data.rightNow, 'hero', HERO_MAX_DAYS, now)]
    : [];

  const demoted = heroActive ? [] : [data.rightNow];
  const seasonSrc = [...demoted, ...data.season].slice(0, MAX_SEASON);
  const season = seasonSrc.map(
    i => computeNowItem(i, 'season', SEASON_MAX_DAYS, now),
  );

  const residue = data.residue
    .filter(i => daysSince(i.updated, now) <= PURGE_DAYS)
    .slice(0, MAX_RESIDUE)
    .map(i => computeNowItem(i, 'residue', STALE_MAX, now));

  return { hero, season, residue };
}

// ---------------------------------------------------------------------------
// Archive (fourth tier) — geological memory eras
// ---------------------------------------------------------------------------

export type ArchiveEra = 'recent' | 'distant' | 'fossil';

const ERA_DISTANT_DAYS = 365;
const ERA_FOSSIL_DAYS  = 730;

/** Classify an archive item into a geological era by age. */
export function archiveEra(updated: string, now = new Date()): ArchiveEra {
  const d = daysSince(updated, now);
  if (d < ERA_DISTANT_DAYS) return 'recent';
  if (d < ERA_FOSSIL_DAYS)  return 'distant';
  return 'fossil';
}

/** Opacity for each era — memory fades but never fully vanishes. */
export function archiveOpacity(era: ArchiveEra): number {
  const map: Record<ArchiveEra, number> = {
    recent: 0.55, distant: 0.35, fossil: 0.2,
  };
  return map[era];
}

/** Partition archive items into eras, sorted newest-first. */
export function partitionArchive(items: ArchiveItem[], now = new Date()) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
  );
  return sorted.map(item => ({
    item,
    era: archiveEra(item.updated, now),
    opacity: archiveOpacity(archiveEra(item.updated, now)),
  }));
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testNowLib(): void {
  const d = daysSince('2026-01-01', new Date('2026-04-04'));
  console.assert(d === 93, `daysSince expected 93 got ${d}`);

  console.assert(freshnessLevel(0)   === 'fresh',   'day 0 should be fresh');
  console.assert(freshnessLevel(7)   === 'fresh',   'day 7 should be fresh');
  console.assert(freshnessLevel(8)   === 'recent',  'day 8 should be recent');
  console.assert(freshnessLevel(30)  === 'recent',  'day 30 should be recent');
  console.assert(freshnessLevel(31)  === 'stale',   'day 31 should be stale');
  console.assert(freshnessLevel(91)  === 'dormant', 'day 91 should be dormant');

  const info = computeFreshness('2026-04-04', new Date('2026-04-04'));
  console.assert(info.level === 'fresh', 'same-day should be fresh');
  console.assert(info.quip.length > 0,   'quip should not be empty');

  const decay0 = computeDecay('2026-04-04', new Date('2026-04-04'));
  console.assert(decay0 === 0, `same-day decay should be 0, got ${decay0}`);
  const decay1 = computeDecay('2026-01-01', new Date('2026-04-04'));
  console.assert(decay1 >= 1, `93-day decay should be 1, got ${decay1}`);
  const decayMid = computeDecay('2026-03-05', new Date('2026-04-04'));
  console.assert(decayMid > 0 && decayMid < 1, `30-day decay should be mid-range`);

  // --- Three-tier partition tests ---
  const tiered: NowTiered = {
    mood: 'lo-fi',
    rightNow: { emoji: '🛠️', text: 'building', updated: '2026-04-01' },
    season: [{ emoji: '📖', text: 'reading', updated: '2026-03-20' }],
    residue: [{ emoji: '🧪', text: 'shaders', updated: '2026-01-15' }],
  };

  const p = partitionNow(tiered, new Date('2026-04-04'));
  console.assert(p.hero.length === 1, 'hero should have 1 item');
  console.assert(p.season.length === 1, 'season should have 1 item');
  console.assert(p.residue.length === 1, 'residue should have 1 item');
  console.assert(p.hero[0].tier === 'hero', 'hero tier label');

  // Stale hero demotes
  const stale: NowTiered = { ...tiered,
    rightNow: { ...tiered.rightNow, updated: '2026-02-01' },
  };
  const ps = partitionNow(stale, new Date('2026-04-04'));
  console.assert(ps.hero.length === 0, 'stale hero should demote');
  console.assert(ps.season.length === 2, 'demoted hero joins season');

  // Purge old residue
  const ancient: NowTiered = { ...tiered,
    residue: [{ emoji: '💀', text: 'old', updated: '2025-01-01' }],
  };
  const pa = partitionNow(ancient, new Date('2026-04-04'));
  console.assert(pa.residue.length === 0, 'ancient residue should purge');

  // --- Archive era tests ---
  const refDate = new Date('2026-04-04');
  console.assert(archiveEra('2026-01-01', refDate) === 'recent', 'recent era');
  console.assert(archiveEra('2025-01-01', refDate) === 'distant', 'distant era');
  console.assert(archiveEra('2023-01-01', refDate) === 'fossil', 'fossil era');
  console.assert(archiveOpacity('recent') > archiveOpacity('fossil'), 'opacity ordering');

  const archived = partitionArchive([
    { emoji: '📝', text: 'old', updated: '2025-01-01' },
    { emoji: '🔥', text: 'newer', updated: '2026-01-01' },
  ], refDate);
  console.assert(archived[0].item.text === 'newer', 'archive sorted newest-first');

  console.log('[now] lib OK — staleness, quips, decay, partitions, archive verified');
}

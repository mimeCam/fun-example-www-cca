// src/lib/track-record.ts
// Assembles the authoritative track record from existing ledger + verdict data.
// No new DB tables. No new dependencies. O(n) Map lookups per Mike's spec.
// Every function ≤ 10 lines — pure computation separated from DB I/O.
//
// Credits: Mike (arch spec §track-record napkin plan, §anchor-url, §cold-trajectory),
//          Tanya (UX spec — status semantics, color grammar, §15 cold trajectory)

import type { CollectionEntry } from 'astro:content';
import { getSealEntry, getAnchorData } from './conviction-ledger';
import { getVerdictRecord } from './verdict-resolver';
import { computeBattingAverage } from './batting-average';
import type { LedgerEntry } from './conviction-ledger';
import type { VerdictRecord, VerdictOutcome } from './verdict-resolver';
import type { BattingAverage } from './batting-average';

// Days from seal timestamp until a verdict window opens (mirrors decay engine).
const VERDICT_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrackRecordStatus = 'correct' | 'wrong' | 'pending';

export interface TrackRecordEntry {
  slug:      string;
  title:     string;
  score:     number;         // conviction score /10
  sealedAt:  number;         // unix ms — seal timestamp
  verdict:   VerdictOutcome | null;
  verdictAt: number | null;  // unix ms — verdict timestamp, null if pending
  anchorUrl: string | null;  // GitHub Gist URL, null if not anchored
  status:    TrackRecordStatus;
}

/** One data point in the running accuracy sparkline. */
export interface RunningPoint {
  index:  number;
  slug:   string;
  pct:    number;           // running batting average at this point (0–100)
  status: TrackRecordStatus;
}

/** Trajectory data shown in cold state — honest forward momentum, not emptiness. */
export interface ColdTrajectory {
  sealedCount:  number;  // total sealed posts
  pendingCount: number;  // sealed but no verdict yet
  daysToFirst:  number | null;  // null when a verdict is already past-due
}

export interface TrackRecord {
  entries:         TrackRecordEntry[];
  avg:             BattingAverage;
  runningHistory:  RunningPoint[];
  firstSealDate:   number | null;    // timestamp of earliest seal
  primaryAnchorUrl: string | null;   // first entry with an anchor URL, for hero display
  coldTrajectory:  ColdTrajectory;   // forward trajectory shown during cold start
}

// ---------------------------------------------------------------------------
// Status resolution
// ---------------------------------------------------------------------------

function outcomeToStatus(v: VerdictOutcome): TrackRecordStatus {
  if (v === 'still-true') return 'correct';
  if (v === 'wrong' || v === 'abandoned') return 'wrong';
  return 'pending'; // 'evolved' = neutral; excluded from denominator, shown as pending
}

function entryStatus(verdict: VerdictRecord | null): TrackRecordStatus {
  if (!verdict) return 'pending';
  return outcomeToStatus(verdict.verdict);
}

// ---------------------------------------------------------------------------
// Entry construction
// ---------------------------------------------------------------------------

function toEntry(slug: string, title: string, seal: LedgerEntry, verdict: VerdictRecord | null, anchor: { url: string } | null): TrackRecordEntry {
  return { slug, title,
    score: seal.conviction_score ?? 0, sealedAt: seal.timestamp,
    verdict: verdict?.verdict ?? null, verdictAt: verdict?.sealedAt ?? null,
    anchorUrl: anchor?.url ?? null, status: entryStatus(verdict) };
}

// ---------------------------------------------------------------------------
// DB lookups — isolated from pure computation
// ---------------------------------------------------------------------------

function buildSealsMap(slugs: string[]): Map<string, LedgerEntry> {
  const m = new Map<string, LedgerEntry>();
  for (const slug of slugs) { const s = getSealEntry(slug); if (s) m.set(slug, s); }
  return m;
}

function buildVerdictsMap(slugs: string[]): Map<string, VerdictRecord> {
  const m = new Map<string, VerdictRecord>();
  for (const slug of slugs) { const v = getVerdictRecord(slug); if (v) m.set(slug, v); }
  return m;
}

function buildAnchorsMap(slugs: string[]): Map<string, { url: string }> {
  const m = new Map<string, { url: string }>();
  for (const slug of slugs) { const a = getAnchorData(slug); if (a) m.set(slug, a); }
  return m;
}

// ---------------------------------------------------------------------------
// Collection assembly — pure after Maps are built
// ---------------------------------------------------------------------------

function buildEntries(posts: CollectionEntry<'blog'>[], seals: Map<string, LedgerEntry>, verdicts: Map<string, VerdictRecord>, anchors: Map<string, { url: string }>): TrackRecordEntry[] {
  return posts
    .filter(p => seals.has(p.slug))
    .map(p => toEntry(p.slug, p.data.title, seals.get(p.slug)!, verdicts.get(p.slug) ?? null, anchors.get(p.slug) ?? null))
    .sort((a, b) => a.sealedAt - b.sealedAt);
}

// ---------------------------------------------------------------------------
// Sparkline — running batting average trajectory, verdict-order chronological
// ---------------------------------------------------------------------------

function buildRunningHistory(entries: TrackRecordEntry[]): RunningPoint[] {
  const resolved = entries
    .filter(e => e.status === 'correct' || e.status === 'wrong')
    .sort((a, b) => (a.verdictAt ?? 0) - (b.verdictAt ?? 0));
  let correct = 0, wrong = 0;
  return resolved.map((e, i) => {
    if (e.status === 'correct') correct++; else wrong++;
    return { index: i + 1, slug: e.slug, pct: Math.round(correct / (correct + wrong) * 100), status: e.status };
  });
}

// ---------------------------------------------------------------------------
// Cold trajectory — days until first verdict window opens
// ---------------------------------------------------------------------------

function daysToFirstVerdict(entries: TrackRecordEntry[]): number | null {
  const pending = entries.filter(e => e.status === 'pending');
  if (pending.length === 0) return null;
  const oldestSeal = Math.min(...pending.map(e => e.sealedAt));
  const eligibleAt = oldestSeal + VERDICT_WINDOW_DAYS * 86_400_000;
  const remaining  = eligibleAt - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 86_400_000) : null;
}

function buildColdStartTrajectory(entries: TrackRecordEntry[]): ColdTrajectory {
  return {
    sealedCount:  entries.length,
    pendingCount: entries.filter(e => e.status === 'pending').length,
    daysToFirst:  daysToFirstVerdict(entries),
  };
}

// ---------------------------------------------------------------------------
// Public API — single entry point; safe at SSR time (try/catch wraps DB)
// ---------------------------------------------------------------------------

/** Assemble the full track record from the conviction + verdict ledgers.
 *  Returns empty entries array + cold avg when DB is unavailable. */
export function buildTrackRecord(posts: CollectionEntry<'blog'>[]): TrackRecord {
  try {
    const slugs    = posts.map(p => p.slug);
    const seals    = buildSealsMap(slugs);
    const verdicts = buildVerdictsMap(slugs);
    const anchors  = buildAnchorsMap(slugs);
    const entries  = buildEntries(posts, seals, verdicts, anchors);
    const avg      = computeBattingAverage();
    return {
      entries,
      avg,
      runningHistory:   buildRunningHistory(entries),
      firstSealDate:    entries[0]?.sealedAt ?? null,
      primaryAnchorUrl: entries.find(e => e.anchorUrl)?.anchorUrl ?? null,
      coldTrajectory:   buildColdStartTrajectory(entries),
    };
  } catch {
    return {
      entries: [], avg: { status: 'cold', total: 0 }, runningHistory: [],
      firstSealDate: null, primaryAnchorUrl: null,
      coldTrajectory: { sealedCount: 0, pendingCount: 0, daysToFirst: null },
    };
  }
}

// src/lib/og/accountabilityData.ts
// Data contract for accountability OG cards.
// Discriminated unions over nullable fields — no runtime crashes from missing data.
// Builders isolate DB access so layout stays pure.
//
// Credits: Mike (arch spec §OG-Accountability-Card-v2)

import type { FreshnessTag } from '../decay-engine';
import { computeBattingAverage, getSealedSlugs } from '../batting-average';
import { flattenPredictions, computeStats } from '../prediction-engine';
import type { Prediction } from '../prediction-engine';
import { getAnchorData } from '../conviction-ledger';

// ---------------------------------------------------------------------------
// Public types — discriminated union, one variant per context
// ---------------------------------------------------------------------------

export type AccountabilityOGData =
  | { variant: 'cold';  title: string; description?: string; siteName: string }
  | {
      variant: 'post';
      title: string; description?: string; siteName: string;
      isSealed: boolean; anchored: boolean; battingPct: number;
      correct: number; pending: number; overdue: number;
      freshness: FreshnessTag;
    }
  | {
      variant: 'home';
      siteName: string; battingPct: number;
      correct: number; wrong: number; pending: number; sealedCount: number;
    };

/** Minimal post shape required by the builder — avoids astro:content import in lib/. */
export interface PostInput {
  slug: string;
  title: string;
  description?: string;
  predictions?: Prediction[];
  freshness: FreshnessTag;
}

// ---------------------------------------------------------------------------
// Internal helpers — each does one thing
// ---------------------------------------------------------------------------

function postPredictionStats(input: PostInput) {
  const posts = [{ slug: input.slug, data: { title: input.title, predictions: input.predictions } }];
  return computeStats(flattenPredictions(posts, new Date()));
}

function coldPost(input: PostInput, siteName: string): AccountabilityOGData {
  return { variant: 'cold', title: input.title, description: input.description, siteName };
}

function livePost(input: PostInput, siteName: string, pct: number): AccountabilityOGData {
  const sealed  = getSealedSlugs();
  const stats   = postPredictionStats(input);
  const anchor  = getAnchorData(input.slug);
  return {
    variant:    'post',
    title:       input.title,
    description: input.description,
    siteName,
    isSealed:    sealed.includes(input.slug),
    anchored:    anchor !== null,
    battingPct:  pct,
    correct:     stats.correct,
    pending:     stats.pending,
    overdue:     stats.overdue,
    freshness:   input.freshness,
  };
}

// ---------------------------------------------------------------------------
// Public builders — called by API routes
// ---------------------------------------------------------------------------

/** Build accountability OG data for a single post. Safe at build time (falls back to cold). */
export function buildPostAccountabilityData(input: PostInput, siteName: string): AccountabilityOGData {
  try {
    const avg = computeBattingAverage();
    return avg.status === 'cold' ? coldPost(input, siteName) : livePost(input, siteName, avg.pct);
  } catch { return coldPost(input, siteName); }
}

/** Build accountability OG data for the sitewide home card. */
export function buildHomeAccountabilityData(siteName: string): AccountabilityOGData {
  try {
    const avg = computeBattingAverage();
    if (avg.status === 'cold') return { variant: 'cold', title: siteName, siteName };
    return { variant: 'home', siteName, battingPct: avg.pct, correct: avg.correct, wrong: avg.wrong, pending: avg.pending, sealedCount: avg.total };
  } catch { return { variant: 'cold', title: siteName, siteName }; }
}

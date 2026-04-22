// src/lib/record-stage.ts
//
// Pure stateless classifier for the age of an *author record* (the time since
// their first seal). Reuses the five-stage decay ontology on a new time axis:
// posts decay on a TTL clock (decay-engine.ts); authors harden on a record
// clock. Same ontology, different axis — typography inverts between them:
//
//   • voice  softens with record age (via --stage-*-text-primary opacity)
//   • record hardens  with record age (via weight ramp — climbs to 700/800)
//
// This module is the single source of truth for the age-band table. Thresholds
// come from Mike's napkin (§5.1) and Tanya's spec (§6). Keep DB access out:
// record-stage is a pure function of (firstSealMs, now). Callers at the page/
// API boundary are responsible for fetching firstSealDate.
//
// Credits: Michael Koch (napkin spec §5.1, §6), Tanya Donska (UX §6 table),
//          Paul Kim (polish ship §7.1), Elon Musk (first-principles §4 atom).

import type { DecayStage } from './decay-engine';

/** Same ontology as DecayStage — different clock, same five-stage grammar. */
export type RecordStage = DecayStage;

/** Upper-exclusive bounds (in days) for each record-age band.
 *  `fossil` has no upper bound — it is everything beyond `ghost`.
 *  Exported for tests and for any caller that needs the raw table. */
export const RECORD_STAGE_DAYS = {
  fresh:      30,       // < 1 month: brand-new voice, quiet record
  fading:     180,      // < 6 months: still warm
  endangered: 365,      // < 1 year: year-mark on the horizon
  ghost:      365 * 3,  // < 3 years: voice receding, record hardening
  // fossil: everything beyond ghost (no upper bound).
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Classify an author's record age into a decay stage.
 *
 * Null/undefined `firstSealMs` (author with zero seals) renders as `fresh` —
 * never throws, never hides the page. Future timestamps (clock skew) also
 * render as `fresh` to avoid nonsensical "ageMs < 0" classifications.
 *
 * @param firstSealMs UNIX ms of earliest seal (from `buildTrackRecord`)
 * @param now         Optional clock override (defaults to `Date.now()`)
 */
export function recordStage(
  firstSealMs: number | null | undefined,
  now: number = Date.now(),
): RecordStage {
  if (firstSealMs == null) return 'fresh';
  const ageMs = now - firstSealMs;
  if (ageMs < 0) return 'fresh';
  return stageForAgeDays(ageMs / MS_PER_DAY);
}

/** Internal: map a non-negative age in days to a RecordStage. */
function stageForAgeDays(days: number): RecordStage {
  if (days < RECORD_STAGE_DAYS.fresh)      return 'fresh';
  if (days < RECORD_STAGE_DAYS.fading)     return 'fading';
  if (days < RECORD_STAGE_DAYS.endangered) return 'endangered';
  if (days < RECORD_STAGE_DAYS.ghost)      return 'ghost';
  return 'fossil';
}

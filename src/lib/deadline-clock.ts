// src/lib/deadline-clock.ts
// Pure time math for resolution deadline display. Zero DB, zero side-effects.
// Input: two Dates and a "now". Output: display primitives only.
// Credits: Mike (architecture spec §deadline-clock)

import { nowDate } from './clock';

export type UrgencyBand = 'safe' | 'watch' | 'warning' | 'critical' | 'overdue';

export interface DeadlineDisplay {
  label: string;           // "14 days left" | "1 day left" | "OVERDUE"
  urgencyBand: UrgencyBand;
  daysRemaining: number;   // negative when past deadline
  percentConsumed: number; // 0–100 — drives progress bar fill
}

// ---------------------------------------------------------------------------
// Pure helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function daysDiff(deadline: Date, now: Date): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_DAY);
}

function toUrgencyBand(days: number): UrgencyBand {
  if (days < 0)  return 'overdue';
  if (days < 2)  return 'critical';
  if (days < 7)  return 'warning';
  if (days < 30) return 'watch';
  return 'safe';
}

function toLabel(days: number): string {
  if (days < 0)   return 'OVERDUE';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function toPercent(publishDate: Date, deadline: Date, now: Date): number {
  const total = deadline.getTime() - publishDate.getTime();
  if (total <= 0) return 100;
  const elapsed = now.getTime() - publishDate.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build display primitives for a deadline countdown widget. */
export function buildDeadlineDisplay(
  publishDate: Date,
  deadline: Date,
  now: Date = nowDate(),
): DeadlineDisplay {
  const days = daysDiff(deadline, now);
  return {
    label:           toLabel(days),
    urgencyBand:     toUrgencyBand(days),
    daysRemaining:   days,
    percentConsumed: toPercent(publishDate, deadline, now),
  };
}

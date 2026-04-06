// src/lib/death-clock.ts
// Death Clock — human-readable countdown to post entombment.
// Pure functions, zero state, zero side effects.
// One number drives every visual state: daysRemaining.
//
// Credits: Mike (architecture, napkin plan), Elon (cold-start diagnosis),
//          Tanya (UX §6 — visible countdown converts cold-start into tension)

import { decayFactor, ENTOMB_THRESHOLD } from './decay-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClockUrgency =
  | 'immortal' | 'thriving' | 'aging' | 'endangered' | 'critical' | 'dying';

// Match postMeta.ts resolveMaxDays() — posts live on a 365-day clock.
export const CLOCK_MAX_DAYS = 365;

// ---------------------------------------------------------------------------
// Core countdown math
// ---------------------------------------------------------------------------

/** Days until decay hits ENTOMB_THRESHOLD. Returns 0 when already entombed. */
export function daysUntilEntombment(
  pubDate: string,
  revivalCount: number,
  readingSeconds: number,
  maxDays = CLOCK_MAX_DAYS,
  now = new Date(),
): number {
  const factor = decayFactor(pubDate, maxDays, now, revivalCount, readingSeconds);
  const remaining = ENTOMB_THRESHOLD - factor;
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining * maxDays));
}

// ---------------------------------------------------------------------------
// Urgency classification — single flat discriminant, no boolean flags
// ---------------------------------------------------------------------------

/** Six tiers. All visual and text states branch from this one union. */
export function clockUrgency(daysRemaining: number): ClockUrgency {
  if (daysRemaining > 150) return 'immortal';
  if (daysRemaining > 60)  return 'thriving';
  if (daysRemaining > 30)  return 'aging';
  if (daysRemaining > 14)  return 'endangered';
  if (daysRemaining > 3)   return 'critical';
  return 'dying';
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Numeric display: "17", "<1", "—". */
export function deathClockDayDisplay(daysRemaining: number, urgency: ClockUrgency): string {
  if (daysRemaining === 0) return '—';
  if (urgency === 'dying' && daysRemaining <= 1) return '<1';
  return String(daysRemaining);
}

/** Unit display: "days left", "hrs left", "entombed". */
export function deathClockUnitDisplay(daysRemaining: number): string {
  if (daysRemaining === 0) return 'entombed';
  if (daysRemaining <= 1)  return 'hrs left';
  return 'days left';
}

/** Short display label — used for aria-title and compact summary. */
export function deathClockLabel(daysRemaining: number, urgency: ClockUrgency): string {
  if (daysRemaining === 0) return 'entombed';
  if (urgency === 'dying' && daysRemaining <= 1) return 'hours remaining';
  if (daysRemaining === 1) return '1 day left';
  return `${daysRemaining} days left`;
}

/** Full a11y string for screen readers. */
export function deathClockA11yLabel(daysRemaining: number): string {
  if (daysRemaining === 0) return 'This post has been archived';
  if (daysRemaining <= 1)  return 'This post will be archived within hours';
  return `This post will be archived in ${daysRemaining} days`;
}

// ---------------------------------------------------------------------------
// CSS custom properties — server-side, no JS required for visuals
// ---------------------------------------------------------------------------

const URGENCY_HUE: Record<ClockUrgency, number> = {
  immortal: 230, thriving: 220, aging: 160,
  endangered: 45, critical: 20,  dying: 4,
};

const URGENCY_PULSE: Record<ClockUrgency, string> = {
  immortal: '0s', thriving: '8s',  aging: '6s',
  endangered: '4s', critical: '2s', dying: '0.8s',
};

/**
 * SVG ring dashoffset.
 * 0 = full ring (post is alive and new).
 * 176 = empty ring (post is entombed).
 */
export function clockDashoffset(daysRemaining: number, maxDays = CLOCK_MAX_DAYS): number {
  const maxLife = Math.ceil(ENTOMB_THRESHOLD * maxDays);
  const fraction = Math.min(daysRemaining / maxLife, 1);
  return Math.round(176 * (1 - fraction));
}

export interface ClockCSSVars {
  '--clock-urgency-hue': string;
  '--clock-pulse-speed': string;
  '--clock-dashoffset':  string;
}

/** CSS custom properties for inline style binding. */
export function clockCSSVars(urgency: ClockUrgency, daysRemaining: number): ClockCSSVars {
  return {
    '--clock-urgency-hue': String(URGENCY_HUE[urgency]),
    '--clock-pulse-speed': URGENCY_PULSE[urgency],
    '--clock-dashoffset':  String(clockDashoffset(daysRemaining)),
  };
}

/** Converts clock CSS vars to an inline style string. */
export function clockStyleString(urgency: ClockUrgency, daysRemaining: number): string {
  const vars = clockCSSVars(urgency, daysRemaining);
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testDeathClock(): void {
  const now = new Date('2026-04-06');

  const newDays = daysUntilEntombment('2026-04-06', 0, 0, 365, now);
  console.assert(newDays >= 300, `new post: expected ≥300 days, got ${newDays}`);

  const oldDays = daysUntilEntombment('2020-01-01', 0, 0, 365, now);
  console.assert(oldDays === 0, `old post: expected 0, got ${oldDays}`);

  // clockUrgency — all tiers
  console.assert(clockUrgency(200) === 'immortal',   '200d = immortal');
  console.assert(clockUrgency(100) === 'thriving',   '100d = thriving');
  console.assert(clockUrgency(45)  === 'aging',      '45d = aging');
  console.assert(clockUrgency(20)  === 'endangered', '20d = endangered');
  console.assert(clockUrgency(10)  === 'critical',   '10d = critical');
  console.assert(clockUrgency(2)   === 'dying',      '2d = dying');
  console.assert(clockUrgency(0)   === 'dying',      '0d = dying');

  // Labels
  console.assert(deathClockLabel(17, 'critical')  === '17 days left',    'label 17');
  console.assert(deathClockLabel(1,  'dying')     === 'hours remaining', 'label dying 1');
  console.assert(deathClockLabel(0,  'dying')     === 'entombed',        'label 0');
  console.assert(deathClockLabel(1,  'critical')  === '1 day left',      'label 1 day');

  console.assert(deathClockA11yLabel(17).includes('17'), 'a11y includes days');
  console.assert(deathClockA11yLabel(0).includes('archived'), 'a11y entombed');

  // Display helpers
  console.assert(deathClockDayDisplay(17, 'critical') === '17',      'day display 17');
  console.assert(deathClockDayDisplay(1,  'dying')    === '<1',      'day display dying 1');
  console.assert(deathClockDayDisplay(0,  'dying')    === '—',       'day display 0');
  console.assert(deathClockUnitDisplay(17) === 'days left',          'unit 17');
  console.assert(deathClockUnitDisplay(1)  === 'hrs left',           'unit 1');
  console.assert(deathClockUnitDisplay(0)  === 'entombed',           'unit 0');

  // Ring dashoffset
  const maxLife = Math.ceil(ENTOMB_THRESHOLD * 365); // 347
  console.assert(clockDashoffset(maxLife) === 0,   `full life → dashoffset 0, got ${clockDashoffset(maxLife)}`);
  console.assert(clockDashoffset(0) === 176,        `0 days → dashoffset 176`);

  // CSS vars
  const vars = clockCSSVars('critical', 10);
  console.assert(vars['--clock-urgency-hue'] === '20',  'critical hue = 20');
  console.assert(vars['--clock-pulse-speed'] === '2s',  'critical pulse = 2s');

  const style = clockStyleString('dying', 1);
  console.assert(style.includes('--clock-urgency-hue:4'), 'dying hue in style');

  console.log('[death-clock] OK — all checks passed');
}

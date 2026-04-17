// src/lib/client/stage-transitions.ts
// Decay Stage Transition Orchestrator — choreographs visual transitions
// between the 5 decay stages.
//
// Responsibilities:
//   1. Detect stage boundary crossings from decay:stage-change CustomEvent
//   2. Trigger CSS transition classes (.stage-entering-*) on .decay-card
//   3. Schedule urgency-mapped ambient pulse for endangered cards
//   4. Clean up transition classes after animationend
//   5. Respect prefers-reduced-motion — static fallback, no animation
//   6. Battery saver: skip ambient loops when <20%
//
// Architecture: Mike Koch §Orchestrator · UX: Tanya Donska §3
// Rule: Never call requestAnimationFrame() directly — use frame-scheduler.
// Rule: Does NOT recompute decay — the engine owns the math, this owns choreography.
// Rule: Each card is isolated — class scoped to the card element.
//
// Credits: Mike Koch (arch), Tanya Donska (UX spec), DevBrain (ambient anim)

import scheduler, { FramePriority } from './frame-scheduler';

// ── Types ─────────────────────────────────────────────────────────────────────

type DecayStage = 'fresh' | 'fading' | 'endangered' | 'ghost' | 'fossil';

interface StageCrossing {
  from: DecayStage;
  to: DecayStage;
  card: HTMLElement;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTERING_PREFIX = 'stage-entering-';
const AMBIENT_CLASS   = 'stage-ambient-endangered';
const BATTERY_LOW     = 0.2;

/** Duration per crossing (ms) — mirrors tokens.css --motion-stage-* */
const CROSSING_MS: Record<DecayStage, number> = {
  fresh:      600,
  fading:     800,
  endangered: 600,
  ghost:      1200,
  fossil:     800,
};

/** Days-remaining boundaries for endangered pulse ramp */
const PULSE_DAYS_MAX = 14;
const PULSE_PERIOD_SLOW_S = 8;
const PULSE_PERIOD_FAST_S = 0.8;

// ── Pure helpers (<=10 lines each) ────────────────────────────────────────────

/** Computes the ambient pulse period from days remaining. */
function pulsePeriod(daysLeft: number): string {
  const t = Math.min(1, Math.max(0, daysLeft / PULSE_DAYS_MAX));
  const period = PULSE_PERIOD_FAST_S + t * (PULSE_PERIOD_SLOW_S - PULSE_PERIOD_FAST_S);
  return period.toFixed(2) + 's';
}

/** Returns true if prefers-reduced-motion is active. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Strips all stage-entering-* classes from an element. */
function stripEnteringClasses(el: HTMLElement): void {
  const toRemove = Array.from(el.classList).filter(c => c.startsWith(ENTERING_PREFIX));
  toRemove.forEach(c => el.classList.remove(c));
}

/** Returns the entering class name for a stage. */
function enteringClass(stage: DecayStage): string {
  return ENTERING_PREFIX + stage;
}

/** Parse days remaining from card dataset. */
function parseDaysRemaining(card: HTMLElement): number {
  return parseFloat(card.dataset.daysRemaining ?? '30') || 30;
}

// ── Battery saver (async, non-blocking) ────────────────────────────────────

type BatteryManager = EventTarget & { level: number; charging: boolean };
let batterySaver = false;

async function watchBattery(): Promise<void> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;
    const bat = await nav.getBattery();
    const check = (): void => { batterySaver = !bat.charging && bat.level < BATTERY_LOW; };
    check();
    bat.addEventListener('levelchange', check);
    bat.addEventListener('chargingchange', check);
  } catch { /* Battery API absent — degrade silently */ }
}

// ── Transition cleanup ────────────────────────────────────────────────────────

/** Removes transition class after animation completes. */
function cleanupTransition(card: HTMLElement, className: string): void {
  const handler = (): void => {
    card.classList.remove(className);
    card.removeEventListener('animationend', handler);
  };
  card.addEventListener('animationend', handler, { once: true });
  // Safety: remove class after max duration even if animationend misses
  setTimeout(() => card.classList.remove(className), CROSSING_MS[className.replace(ENTERING_PREFIX, '') as DecayStage] + 200 || 1400);
}

// ── Ambient pulse scheduler ───────────────────────────────────────────────────

const ambientCards = new Set<HTMLElement>();

/** Starts the persistent endangered pulse on a card. */
function startAmbientPulse(card: HTMLElement): void {
  if (prefersReducedMotion() || batterySaver) return;
  if (ambientCards.has(card)) return;
  const days = parseDaysRemaining(card);
  card.style.setProperty('--st-pulse-period', pulsePeriod(days));
  card.classList.add(AMBIENT_CLASS);
  ambientCards.add(card);
}

/** Stops the ambient pulse on a card. */
function stopAmbientPulse(card: HTMLElement): void {
  card.classList.remove(AMBIENT_CLASS);
  card.style.removeProperty('--st-pulse-period');
  ambientCards.delete(card);
}

/** Periodic ambient update — refreshes pulse period as days tick down. */
function tickAmbientPulse(): void {
  if (batterySaver) {
    ambientCards.forEach(card => stopAmbientPulse(card));
    return;
  }
  ambientCards.forEach(card => {
    const days = parseDaysRemaining(card);
    card.style.setProperty('--st-pulse-period', pulsePeriod(days));
  });
}

// ── Stage transition trigger ──────────────────────────────────────────────────

/** Returns true when animation should be skipped entirely. */
function shouldSkip(to: DecayStage): boolean {
  return prefersReducedMotion() || (batterySaver && to !== 'fresh');
}

/** Applies the entering CSS class and schedules cleanup. */
function applyEnteringAnimation(card: HTMLElement, to: DecayStage): void {
  const cls = enteringClass(to);
  card.classList.add(cls);
  cleanupTransition(card, cls);
}

/** Schedules ambient pulse after the endangered entry animation. */
function scheduleEndangeredPulse(card: HTMLElement): void {
  const delay = CROSSING_MS.endangered + 50;
  setTimeout(() => startAmbientPulse(card), delay);
}

/** Dispatches a bubbling stage:transition event for external listeners. */
function dispatchTransition(card: HTMLElement, from: DecayStage, to: DecayStage): void {
  card.dispatchEvent(new CustomEvent('stage:transition', {
    bubbles: true, detail: { from, to },
  }));
}

/** Orchestrates the visual transition for a stage boundary crossing. */
function triggerStageTransition(crossing: StageCrossing): void {
  const { card, from, to } = crossing;
  if (shouldSkip(to)) return;
  stripEnteringClasses(card);
  if (from === 'endangered') stopAmbientPulse(card);
  applyEnteringAnimation(card, to);
  if (to === 'endangered') scheduleEndangeredPulse(card);
  dispatchTransition(card, from, to);
}

// ── Event handler ─────────────────────────────────────────────────────────────

function handleStageChange(e: Event): void {
  const card = e.currentTarget as HTMLElement;
  if (!card?.classList.contains('decay-card')) return;
  const detail = (e as CustomEvent<{ stage: string }>).detail;
  if (!detail?.stage) return;
  const newStage = detail.stage as DecayStage;
  const prevStage = (card.dataset.prevStage as DecayStage) || 'fresh';
  if (prevStage === newStage) return;  // no-op: same stage
  card.dataset.prevStage = newStage;
  triggerStageTransition({ from: prevStage, to: newStage, card });
}

// ── Revival listener ──────────────────────────────────────────────────────────

function handleRevival(e: Event): void {
  const detail = (e as CustomEvent<{ slug?: string }>).detail;
  if (!detail?.slug) return;
  const card = document.querySelector<HTMLElement>(
    `.decay-card[data-slug="${detail.slug}"]`
  );
  if (!card) return;
  const prevStage = (card.dataset.decayStage as DecayStage) || 'fading';
  triggerStageTransition({ from: prevStage, to: 'fresh', card });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const GUARD_KEY = '__stageTransitionsInit' as const;

/** Seeds data-prev-stage attrs; boots ambient pulse for endangered cards. */
function seedCardStates(): void {
  document.querySelectorAll<HTMLElement>('.decay-card').forEach(card => {
    const stage = (card.dataset.decayStage as DecayStage) || 'fresh';
    card.dataset.prevStage = stage;
    if (stage === 'endangered' && !prefersReducedMotion()) startAmbientPulse(card);
  });
}

/** Binds stage-change + revival event listeners to all cards. */
function bindListeners(): void {
  document.querySelectorAll<HTMLElement>('.decay-card').forEach(card =>
    card.addEventListener('decay:stage-change', handleStageChange),
  );
  document.addEventListener('revival:confirmed', handleRevival);
}

/**
 * Initializes the stage transition orchestrator.
 * Idempotent — safe to call multiple times (guards via window flag).
 * prefers-reduced-motion: sets prev-stage attrs only, no animations.
 */
export function initStageTransitions(): void {
  if ((window as Record<string, unknown>)[GUARD_KEY]) return;
  (window as Record<string, unknown>)[GUARD_KEY] = true;
  void watchBattery();
  seedCardStates();
  bindListeners();
  if (!prefersReducedMotion()) {
    scheduler.register('stage-ambient-tick', tickAmbientPulse, FramePriority.BACKGROUND);
  }
}

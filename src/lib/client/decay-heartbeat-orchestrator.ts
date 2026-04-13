// src/lib/client/decay-heartbeat-orchestrator.ts
// Per-clock decay orchestrator — one instance per DecayClock ring on the page.
//
// Responsibilities:
//   1. Bootstrap each clock from data-* attributes (server snapshot)
//   2. Compute live decay delta (1Hz via frame-scheduler LOW bucket)
//   3. Write --live-decay + --pulse-interval CSS vars per element
//   4. Detect stage transitions → update data-stage, fire CustomEvent, haptic
//   5. IntersectionObserver: pause off-screen clocks (perf — river page has 20+)
//   6. MutationObserver: cleanup on DOM removal
//
// Architecture: Mike Koch (DecayClock spec §2 "The Engine")
// Rule: Never call requestAnimationFrame() directly — always use frame-scheduler.
// Rule: Trust the server render — only compute DELTA since data-computed-at.
// Rule: Each clock is isolated — use el.querySelector(), never document.querySelector().
//
// Credits: Mike Koch (arch spec), Tanya Donska (stage thresholds §2.1),
//          haptics.ts (warning pattern), frame-scheduler.ts (RAF singleton)

import scheduler, { FramePriority } from './frame-scheduler';
import { haptic } from './haptics';

// ── Types ─────────────────────────────────────────────────────────────────────

type DecayStage = 'fresh' | 'fading' | 'endangered' | 'ghost' | 'fossil';

interface ClockState {
  el:             HTMLElement;
  baseFactor:     number;    // decay factor at server render time
  computedAtMs:   number;    // when server rendered (epoch ms)
  verdictModifier: number;   // conviction multiplier: 0.7/0.9/1.0/1.4
  stage:          DecayStage;
  unobserve:      () => void;
}

// ── Constants (mirror decay-engine.ts — do not import to avoid SSR bundle) ───

const LOG_K      = 0.065;
const MAX_DAYS   = 365;
const LOG_DENOM  = Math.log(1 + MAX_DAYS * LOG_K);  // precomputed: ≈3.207
const FOSSIL_THRESHOLD = 0.95;
const MS_PER_DAY = 86_400_000;

// ── Pure helpers (≤10 lines each — Sid's law) ─────────────────────────────────

function factorToStage(f: number): DecayStage {
  if (f < 0.25) return 'fresh';
  if (f < 0.50) return 'fading';
  if (f < 0.75) return 'endangered';
  if (f < 0.95) return 'ghost';
  return 'fossil';
}

function stageToInterval(stage: DecayStage): number {
  if (stage === 'fresh')      return 4000;
  if (stage === 'fading')     return 3000;
  if (stage === 'endangered') return 1200;
  if (stage === 'ghost')      return 2500;
  return 0;  // fossil = silence
}

/**
 * Advance decay by deltaDays using the same logarithmic formula as decay-engine.ts.
 * Inverts the log curve to find base time-position, adds delta, re-applies.
 */
function computeDeltaDecay(baseFactor: number, deltaDays: number): number {
  if (baseFactor >= 1) return 1;
  const baseTimeDays = (Math.exp(baseFactor * LOG_DENOM) - 1) / LOG_K;
  const newTime = baseTimeDays + deltaDays;
  return Math.min(1, Math.log(1 + newTime * LOG_K) / LOG_DENOM);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ── CSS var writers ────────────────────────────────────────────────────────────

function writeDecayVars(el: HTMLElement, factor: number, interval: number): void {
  el.style.setProperty('--live-decay',      factor.toFixed(4));
  el.style.setProperty('--pulse-interval',  interval + 'ms');
}

// ── Stage transition handler ───────────────────────────────────────────────────

function onStageChange(clock: ClockState, newStage: DecayStage): void {
  clock.el.dataset.stage      = newStage;
  clock.el.dataset.decayStage = newStage;  // keep legacy attr in sync
  clock.stage = newStage;
  const interval = stageToInterval(newStage);
  writeDecayVars(clock.el, parseFloat(clock.el.style.getPropertyValue('--live-decay') || '0'), interval);
  clock.el.dispatchEvent(new CustomEvent('decay:stage-change', {
    bubbles: true,
    detail: { stage: newStage },
  }));
  if (newStage === 'endangered') haptic([25, 15, 60]);  // warning pattern — once, not continuous
}

// ── Per-clock 1Hz tick ────────────────────────────────────────────────────────

function tick(clock: ClockState, now: number): void {
  const deltaDays    = ((now - clock.computedAtMs) / MS_PER_DAY) * clock.verdictModifier;
  const liveFactor   = clamp01(computeDeltaDecay(clock.baseFactor, deltaDays));
  const interval     = stageToInterval(clock.stage);
  writeDecayVars(clock.el, liveFactor, interval);
  const newStage = factorToStage(liveFactor);
  if (newStage !== clock.stage) onStageChange(clock, newStage);
}

// ── Bootstrap a single clock element ──────────────────────────────────────────

function bootstrapClock(el: HTMLElement): ClockState | null {
  const baseFactor   = clamp01(parseFloat(el.dataset.decayFactor ?? '0'));
  const computedAtMs = el.dataset.computedAt ? Date.parse(el.dataset.computedAt) : Date.now();
  const verdictModifier = clamp01(parseFloat(el.dataset.verdictModifier ?? '1'));
  if (isNaN(baseFactor) || isNaN(computedAtMs)) return null;
  const stage = factorToStage(baseFactor);
  // Write immediately — no waiting for first tick (prevents FOUC)
  writeDecayVars(el, baseFactor, stageToInterval(stage));
  el.dataset.stage      = stage;
  el.dataset.decayStage = stage;
  return { el, baseFactor, computedAtMs, verdictModifier: verdictModifier || 1, stage, unobserve: () => {} };
}

// ── IntersectionObserver + MutationObserver wiring ────────────────────────────

function wireObservers(clock: ClockState, taskId: string): void {
  let active = true;

  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !active) {
      active = true;
      scheduler.register(taskId, ts => tick(clock, ts), FramePriority.LOW);
    } else if (!entry.isIntersecting && active) {
      active = false;
      scheduler.unregister(taskId);
    }
  }, { rootMargin: '100px' });

  io.observe(clock.el);

  const mo = new MutationObserver(() => {
    if (!document.contains(clock.el)) { io.disconnect(); mo.disconnect(); scheduler.unregister(taskId); }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  clock.unobserve = () => { io.disconnect(); mo.disconnect(); scheduler.unregister(taskId); };
}

// ── Public initializer ────────────────────────────────────────────────────────

const GUARD_KEY = '__decayHeartbeatInit' as const;

/**
 * Finds all [data-computed-at] clock elements and starts per-clock orchestration.
 * Idempotent — safe to call multiple times (guards via window flag).
 * prefers-reduced-motion: sets static vars only, no RAF registered.
 */
export function initDecayHeartbeat(): void {
  if ((window as Record<string, unknown>)[GUARD_KEY]) return;
  (window as Record<string, unknown>)[GUARD_KEY] = true;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clocks  = document.querySelectorAll<HTMLElement>('[data-computed-at]');

  clocks.forEach((el, i) => {
    const clock = bootstrapClock(el);
    if (!clock) return;
    if (reduced) return;  // static vars already written in bootstrapClock — done
    if (clock.baseFactor >= FOSSIL_THRESHOLD) return;  // fossil: static, silent
    const taskId = `decay-clock-${i}`;
    scheduler.register(taskId, ts => tick(clock, ts), FramePriority.LOW);
    wireObservers(clock, taskId);
  });
}

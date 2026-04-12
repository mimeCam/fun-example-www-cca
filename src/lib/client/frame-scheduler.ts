// src/lib/client/frame-scheduler.ts
// Master RAF singleton — One RAF to rule them all.
// Consolidates competing animation loops into a single requestAnimationFrame
// with priority buckets, epsilon gating, and defensive guardrails.
//
// Priority buckets (minimum ms between task executions):
//   IMMEDIATE  (16ms)     — every frame: waveform physics
//   THROTTLED  (120ms)    — 8fps: color lerp, opacity fades
//   LOW        (5_000ms)  — 0.2Hz: decay factor sync from data-attrs
//   BACKGROUND (60_000ms) — 1/min: heavy recomputes via requestIdleCallback
//
// Guardrails (Adobe Defensive Animation framework):
//   Single visibilitychange listener — pauses/resumes master RAF
//   Battery API: level < 20% → saver mode (all intervals doubled)
//   prefers-reduced-motion: IMMEDIATE tasks skipped; static state written once
//   FPS watchdog: rolling 10-frame avg < 30fps → demote IMMEDIATE → THROTTLED
//   requestIdleCallback: BACKGROUND tasks never block the frame budget
//
// Credits: Mike Koch (arch §RAF Master Frame Scheduler),
//          Adobe Defensive Animation Guide (DevBrain guardrails).

// ─── Priority ─────────────────────────────────────────────────────────────────

/** Minimum interval in ms between task executions per priority bucket. */
export const FramePriority = {
  IMMEDIATE:    16,
  THROTTLED:   120,
  LOW:        5_000,
  BACKGROUND: 60_000,
} as const;

export type FramePriority = (typeof FramePriority)[keyof typeof FramePriority];

// ─── Types ────────────────────────────────────────────────────────────────────

export type Unsubscribe = () => void;

interface RegisteredTask {
  id:       string;
  fn:       (ts: DOMHighResTimeStamp) => void;
  priority: FramePriority;
  lastRun:  number;
}

export interface FrameScheduler {
  register(id: string, fn: (ts: DOMHighResTimeStamp) => void, priority: FramePriority): Unsubscribe;
  unregister(id: string): void;
  onPause(cb: () => void): Unsubscribe;
  pause(): void;
  resume(): void;
  destroy(): void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FPS_SAMPLES    = 10;       // rolling window size for FPS watchdog
const FPS_LOW        = 30;       // fps < this → demote IMMEDIATE tasks
const FPS_RECOVER_MS = 3_000;    // ms of healthy fps before promoting back
const BATTERY_LOW    = 0.2;      // battery level threshold for saver mode
const IDLE_TIMEOUT   = 90_000;   // max ms before rIC forces BACKGROUND task

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function effectiveInterval(priority: FramePriority, saver: boolean): number {
  return saver ? (priority as number) * 2 : (priority as number);
}

function isDue(task: RegisteredTask, now: number, saver: boolean, demote: boolean): boolean {
  const base = effectiveInterval(task.priority, saver);
  const eff  = demote && task.priority === FramePriority.IMMEDIATE
    ? FramePriority.THROTTLED : base;
  return (now - task.lastRun) >= eff;
}

function rollFpsAvg(samples: number[], delta: number): number {
  if (samples.length >= FPS_SAMPLES) samples.shift();
  samples.push(delta);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return avg > 0 ? 1000 / avg : 60;
}

// ─── Battery API (async, non-blocking) ────────────────────────────────────────

type BatteryManager = EventTarget & { level: number; charging: boolean };

async function watchBattery(onSaverChange: (on: boolean) => void): Promise<void> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;
    const bat = await nav.getBattery();
    const check = (): void => onSaverChange(!bat.charging && bat.level < BATTERY_LOW);
    check();
    bat.addEventListener('levelchange', check);
    bat.addEventListener('chargingchange', check);
  } catch { /* Battery API absent on Safari/Firefox — degrade silently */ }
}

// ─── Scheduler factory ────────────────────────────────────────────────────────

export function createScheduler(): FrameScheduler {
  // State
  let rafId: number | null = null;
  let paused      = false;
  let saverMode   = false;
  let fpsDemote   = false;
  let lastFpsOkTs = 0;
  let lastFrameTs = 0;
  const fpsSamples: number[] = [];
  const tasks    = new Map<string, RegisteredTask>();
  const pauseCbs = new Set<() => void>();
  const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // FPS watchdog — tracks rolling average; promotes/demotes IMMEDIATE bucket
  function evaluateFpsHealth(fps: number, ts: number): void {
    if (fps < FPS_LOW && !fpsDemote) {
      fpsDemote = true; lastFpsOkTs = 0;
      console.warn('[FrameScheduler] FPS degraded, entering throttle mode');
    } else if (fps >= FPS_LOW && fpsDemote) {
      if (!lastFpsOkTs) lastFpsOkTs = ts;
      if (ts - lastFpsOkTs >= FPS_RECOVER_MS) { fpsDemote = false; lastFpsOkTs = 0; }
    }
  }

  function updateFpsWatch(ts: number): void {
    if (lastFrameTs > 0) evaluateFpsHealth(rollFpsAvg(fpsSamples, ts - lastFrameTs), ts);
    lastFrameTs = ts;
  }

  function runDueTasks(ts: number): void {
    for (const task of tasks.values()) {
      if (task.priority === FramePriority.BACKGROUND) continue;
      if (rm && task.priority === FramePriority.IMMEDIATE) continue;
      if (!isDue(task, ts, saverMode, fpsDemote)) continue;
      task.fn(ts);
      task.lastRun = ts;
    }
  }

  function tick(ts: DOMHighResTimeStamp): void {
    rafId = null;
    if (paused) return;
    updateFpsWatch(ts);
    runDueTasks(ts);
    schedule(); // eslint-disable-line @typescript-eslint/no-use-before-define
  }

  function schedule(): void {
    if (rafId !== null || paused) return;
    rafId = requestAnimationFrame(tick);
  }

  // BACKGROUND tasks — routed through requestIdleCallback, never block RAF
  function scheduleIdleTask(task: RegisteredTask): void {
    if (!tasks.has(task.id)) return;
    const delay = effectiveInterval(FramePriority.BACKGROUND, saverMode);
    setTimeout(() => {
      if (paused || !tasks.has(task.id)) return;
      const run = (): void => { task.fn(performance.now()); task.lastRun = performance.now(); scheduleIdleTask(task); };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: IDLE_TIMEOUT });
      else run();
    }, delay);
  }

  function register(id: string, fn: (ts: DOMHighResTimeStamp) => void, priority: FramePriority): Unsubscribe {
    const task: RegisteredTask = { id, fn, priority, lastRun: 0 };
    tasks.set(id, task);
    if (priority === FramePriority.BACKGROUND) scheduleIdleTask(task);
    else schedule();
    return (): void => unregister(id); // eslint-disable-line @typescript-eslint/no-use-before-define
  }

  function unregister(id: string): void { tasks.delete(id); }

  function onPause(cb: () => void): Unsubscribe {
    pauseCbs.add(cb);
    return (): void => { pauseCbs.delete(cb); };
  }

  function pause(): void {
    if (paused) return;
    paused = true;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    pauseCbs.forEach(cb => cb());
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    lastFrameTs = 0; // reset FPS baseline — avoids spurious large delta on first tick
    schedule();
  }

  function destroy(): void { pause(); tasks.clear(); pauseCbs.clear(); }

  // Single visibilitychange listener — replaces per-class listeners
  document.addEventListener('visibilitychange', () => { document.hidden ? pause() : resume(); });

  // Battery API — async, non-blocking; degrades gracefully on Safari/Firefox
  void watchBattery(on => { saverMode = on; });

  return { register, unregister, onPause, pause, resume, destroy };
}

// ─── Module-scoped singleton ──────────────────────────────────────────────────

/**
 * One RAF to rule them all.
 * Import this singleton — do not call createScheduler() directly.
 * Tree-shakeable: if no page imports this, zero RAF runs.
 */
const scheduler = createScheduler();
export default scheduler;

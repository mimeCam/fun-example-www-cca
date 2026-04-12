// src/lib/client/heartbeat-orchestrator.ts
// RAF loop that computes a biological heartbeat waveform and broadcasts it as
// CSS custom properties on :root. Every decay-sensitive element listens passively
// — no direct coupling between components.
//
// Waveform shape (3 phases per beat cycle):
//   Pressure  (t 0→0.50): slow squeeze — tension builds via quadratic ramp.
//   Thump     (t 0.50→0.62): fast spring-shaped peak — weight, not bounce.
//   Release   (t 0.62→1.0): critically-damped exponential decay.
//
// BPM model: 72 (fresh) → 55 (fading) → 38 (critical) → 22 (ghost + jitter).
// Fossil (≥0.97): RAF stops; static state written once. Stillness = death.
//
// Circuit breaker: RAF suspends on tab-hidden; resumes phase-correct.
// prefers-reduced-motion: static OKLCH color written once, RAF never starts.
//
// Credits: Mike Koch (arch spec §Decay Pulse Orchestrator), Tanya §2.1 (color),
//          existing spring-easing.ts + decay-color-lerp.ts utilities.

import { springFrame }   from '../spring-easing';
import { decayColorLerp } from './decay-color-lerp';
import type { OklchColor } from './decay-color-lerp';

// ── Constants ─────────────────────────────────────────────────────────────────

const BPM_FRESH    = 72;
const BPM_FADING   = 55;
const BPM_CRITICAL = 38;
const BPM_GHOST    = 22;

const FOSSIL_THRESHOLD = 0.97;  // DOD §4: no pulse above this
const GHOST_THRESHOLD  = 0.85;  // arrhythmic jitter zone

const JITTER_EVERY  = 8;        // jitter every N beats
const JITTER_BOUND  = 0.028;    // ±10° in normalized phase space
const JITTER_DELTA  = 0.032;    // maximum per-event phase nudge

// ── Pure helpers ──────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function bpmForFactor(f: number): number {
  if (f >= FOSSIL_THRESHOLD) return 0;
  if (f >= 0.75)  return BPM_GHOST;
  if (f >= 0.50)  return BPM_CRITICAL;
  if (f >= 0.25)  return BPM_FADING;
  return BPM_FRESH;
}

function periodMs(bpm: number): number {
  return bpm > 0 ? (60_000 / bpm) : Infinity;
}

// ── Heartbeat waveform (3-phase biological shape) ─────────────────────────────

/** Slow quadratic squeeze — tension before the thump. */
function pressurePhase(t: number): number {
  return Math.pow(t / 0.5, 2) * 0.7;
}

/** Spring-shaped thump peak with slight overshoot — the weight of conviction. */
function thumpPhase(t: number): number {
  const local = clamp01((t - 0.5) / 0.12);
  return 0.7 + springFrame(local) * 0.45;
}

/** Critically-damped exponential decay — the heart relaxes. */
function releasePhase(t: number): number {
  const local = (t - 0.62) / 0.38;
  return Math.max(0, Math.exp(-local * 5));
}

/** Full cardiac waveform: maps t∈[0,1] to intensity∈[0,~1.15] then clamped. */
function heartbeatWave(tNorm: number): number {
  if (tNorm < 0.50) return pressurePhase(tNorm);
  if (tNorm < 0.62) return thumpPhase(tNorm);
  return releasePhase(tNorm);
}

// ── CSS var writers ───────────────────────────────────────────────────────────

/** Writes the 4 physics vars that drive scale / opacity / glow per frame. */
function writePhysics(intensity: number, bpm: number): void {
  const r = document.documentElement;
  r.style.setProperty('--hb-intensity',    intensity.toFixed(3));
  r.style.setProperty('--hb-scale',        (1 - intensity * 0.03).toFixed(4));
  r.style.setProperty('--hb-opacity',      (0.45 + intensity * 0.55).toFixed(3));
  r.style.setProperty('--hb-shadow-alpha', (intensity * 0.18).toFixed(3));
  r.style.setProperty('--hb-bpm',          String(Math.round(bpm)));
  r.style.setProperty('--hb-bar-duration', `${Math.round(periodMs(bpm))}ms`);
}

/** Writes the 3 OKLCH channel vars that drive fill color on ring + bar. */
function writeColor(color: OklchColor): void {
  const r = document.documentElement;
  r.style.setProperty('--hb-color-l', color.l.toFixed(2) + '%');
  r.style.setProperty('--hb-color-c', color.c.toFixed(3));
  r.style.setProperty('--hb-color-h', color.h.toFixed(1));
}

/** Full static state — used by reduced-motion path and fossil stage. */
function writeStaticState(factor: number): void {
  writePhysics(0, bpmForFactor(factor));
  writeColor(decayColorLerp(factor));
}

// ── Orchestrator class ────────────────────────────────────────────────────────

export class HeartbeatOrchestrator {
  private rafId: number | null = null;
  private startTs = 0;
  private phaseOffset = 0;
  private beatCount = 0;
  private prevTNorm = 0;
  private factor: number;
  private readonly reducedMotion: boolean;

  constructor(private readonly cardEl: HTMLElement) {
    this.factor = clamp01(parseFloat(cardEl.dataset.decayFactor ?? '0'));
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  start(): void {
    if (this.reducedMotion) { writeStaticState(this.factor); return; }
    if (this.factor >= FOSSIL_THRESHOLD) { writeStaticState(this.factor); return; }
    this.addVisibilityListener();
    this.startTs = performance.now();
    this.schedule();
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private tick(now: number): void {
    this.syncFactor();
    if (this.factor >= FOSSIL_THRESHOLD) { writeStaticState(this.factor); return; }
    const bpm    = bpmForFactor(this.factor);
    const period = periodMs(bpm);
    const tRaw   = (((now - this.startTs) % period) / period + this.phaseOffset) % 1;
    const tNorm  = clamp01(tRaw);
    this.checkBeatJitter(tNorm);
    this.prevTNorm = tNorm;
    writePhysics(clamp01(heartbeatWave(tNorm)), bpm);
    writeColor(decayColorLerp(this.factor));
    this.schedule();
  }

  private schedule(): void {
    this.rafId = requestAnimationFrame(now => this.tick(now));
  }

  /** Re-reads --decay-factor from the card element (live-decay updates it 1×/min). */
  private syncFactor(): void {
    const raw = parseFloat(this.cardEl.dataset.decayFactor ?? String(this.factor));
    if (!isNaN(raw)) this.factor = clamp01(raw);
  }

  /** Applies arrhythmic phase jitter for ghost-stage posts (decayFactor > 0.85). */
  private checkBeatJitter(tNorm: number): void {
    if (this.factor < GHOST_THRESHOLD) return;
    const cycleWrapped = this.prevTNorm > 0.8 && tNorm < 0.2;
    if (!cycleWrapped) return;
    this.beatCount++;
    if (this.beatCount % JITTER_EVERY !== 0) return;
    const delta = (Math.random() - 0.5) * JITTER_DELTA;
    this.phaseOffset = Math.max(-JITTER_BOUND, Math.min(JITTER_BOUND, this.phaseOffset + delta));
  }

  /** Suspends RAF when tab is hidden; resumes phase-correct on reveal. */
  private addVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.stop(); return; }
      const period = periodMs(bpmForFactor(this.factor));
      this.startTs = performance.now() - (this.phaseOffset * period);
      this.schedule();
    });
  }
}

// ── Public initializer (call once per page, guards against duplicates) ────────

/**
 * Finds the first element with [data-decay-factor] and starts the orchestrator.
 * Safe to call multiple times — idempotent guard via window.__hbOrchestrator.
 */
export function initHeartbeatOrchestrator(cardEl?: HTMLElement): void {
  if ((window as Window & { __hbOrchestrator?: HeartbeatOrchestrator }).__hbOrchestrator) return;
  const target = cardEl ?? document.querySelector<HTMLElement>('[data-decay-factor]');
  if (!target) return;
  const orc = new HeartbeatOrchestrator(target);
  (window as Window & { __hbOrchestrator?: HeartbeatOrchestrator }).__hbOrchestrator = orc;
  orc.start();
}

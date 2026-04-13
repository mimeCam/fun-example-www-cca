// src/lib/client/ba-unlock-progress.ts
// Dot-fill ceremony orchestrator — wires SSE verdict:declared to the 5-dot
// progress track rendered by BattingAverageUnlockProgress.astro.
//
// DOM contract (SSR-stamped by BattingAverageUnlockProgress):
//   [data-ba-dot-track][data-resolved="N"]  — container; this module reads/writes N
//   [data-dot-index="0"…"4"]               — individual dots
//   [data-filled]                          — present on resolved dots
//
// Events consumed from /api/heartbeat EventSource:
//   'verdict:declared' → { trophyTier, newBattingAvg, correct, wrong, pending }
//
// Events emitted on document:
//   CustomEvent('bah:unlock', { detail: { newBattingAvg, trophyTier } })
//   — fired when resolvedTotal crosses MIN_VERDICTS; picked up by BattingAverageHero
//
// Credits: Mike Koch (napkin spec §ba-unlock-progress.ts)

import scheduler, { FramePriority } from './frame-scheduler';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_VERDICTS    = 5;    // must match batting-average.ts — single source is there
const CASCADE_STAGGER = 50;   // ms stagger between cascade dots on unlock
const BLOOM_DELAY     = 300;  // ms before bah:unlock fires (after cascade visual)
const BLOOM_HOLD_MS   = 600;  // ms before [data-bloom] is removed

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerdictPayload {
  newBattingAvg: number | null;
  trophyTier?:  string;
  correct?:     number;
  wrong?:       number;
  pending?:     number;
}

// ── Reduced-motion guard ──────────────────────────────────────────────────────

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Element selectors ─────────────────────────────────────────────────────────

function getDotTrack(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-ba-dot-track]');
}

function getDots(track: HTMLElement): HTMLElement[] {
  return Array.from(track.querySelectorAll<HTMLElement>('[data-dot-index]'));
}

function resolvedCount(track: HTMLElement): number {
  return parseInt(track.dataset.resolved ?? '0', 10);
}

// ── Dot fill helpers ──────────────────────────────────────────────────────────

function fillDot(dot: HTMLElement): void {
  dot.setAttribute('data-filled', '');
}

function fillDotAnimated(dot: HTMLElement): void {
  dot.removeAttribute('data-filled');
  void dot.offsetWidth; // force reflow to restart animation
  fillDot(dot);
}

function fillNextDot(track: HTMLElement): void {
  const dots    = getDots(track);
  const current = resolvedCount(track);
  if (current >= MIN_VERDICTS || current >= dots.length) return;
  const dot = dots[current];
  if (!dot) return;
  isReducedMotion() ? fillDot(dot) : fillDotAnimated(dot);
  track.dataset.resolved = String(current + 1);
}

// ── Bloom helpers ─────────────────────────────────────────────────────────────

function bloomDot(dot: HTMLElement, delay: number): void {
  setTimeout(() => {
    dot.setAttribute('data-bloom', '');
    setTimeout(() => dot.removeAttribute('data-bloom'), BLOOM_HOLD_MS);
  }, delay);
}

function cascadeBloom(dots: HTMLElement[]): void {
  dots.forEach((d, i) => bloomDot(d, i * CASCADE_STAGGER));
}

// ── Unlock ceremony ───────────────────────────────────────────────────────────

function fireUnlockEvent(payload: VerdictPayload): void {
  document.dispatchEvent(new CustomEvent('bah:unlock', {
    detail: { newBattingAvg: payload.newBattingAvg, trophyTier: payload.trophyTier },
  }));
}

function unlockCeremonyReduced(track: HTMLElement, payload: VerdictPayload): void {
  getDots(track).forEach(fillDot);
  fireUnlockEvent(payload);
}

function unlockCeremonyAnimated(track: HTMLElement, payload: VerdictPayload): void {
  const dots = getDots(track);
  dots.forEach((d, i) => setTimeout(() => fillDotAnimated(d), i * CASCADE_STAGGER));
  setTimeout(() => cascadeBloom(dots), dots.length * CASCADE_STAGGER);
  setTimeout(() => fireUnlockEvent(payload), BLOOM_DELAY);
}

function unlockCeremony(track: HTMLElement, payload: VerdictPayload): void {
  if (isReducedMotion()) { unlockCeremonyReduced(track, payload); return; }
  unlockCeremonyAnimated(track, payload);
}

// ── Verdict handler ───────────────────────────────────────────────────────────

function handleVerdict(payload: VerdictPayload): void {
  const track = getDotTrack();
  if (!track) return;
  const current = resolvedCount(track);
  if (current >= MIN_VERDICTS) return; // already unlocked
  fillNextDot(track);
  if (current + 1 >= MIN_VERDICTS) unlockCeremony(track, payload);
}

// ── SSE stream ────────────────────────────────────────────────────────────────

declare global { interface Window { __heartbeat?: EventSource; } }

function getStream(): EventSource {
  if (window.__heartbeat?.readyState !== EventSource.CLOSED) return window.__heartbeat!;
  return (window.__heartbeat = new EventSource('/api/heartbeat'));
}

function onVerdictEvent(e: Event): void {
  try { handleVerdict(JSON.parse((e as MessageEvent).data as string)); } catch { /* ignore */ }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

function boot(): void {
  if (!getDotTrack()) return; // not in cold state — nothing to wire
  getStream().addEventListener('verdict:declared', onVerdictEvent);
  // Keep the RAF singleton warm during cold state (no-op LOW task)
  scheduler.register('ba-unlock-progress', () => {}, FramePriority.LOW);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

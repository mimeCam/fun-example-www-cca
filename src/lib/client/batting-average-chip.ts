// src/lib/client/batting-average-chip.ts
// Client ceremony layer for BattingAverageChip.
// Concerns: count-up entrance (IntersectionObserver), tier-crossing flash, live SSE updates.
//
// Design decisions:
//   - Module singleton IntersectionObserver: N chips, 1 observer (cheap, correct).
//   - SSR renders final value; JS replaces with 0%, animates on viewport entry.
//   - Reduced-motion: snap to final value, zero animation, zero replacement.
//   - All mutations deferred to DOMContentLoaded — zero DOM access at module scope.
//
// Credits: Mike Koch (arch spec §5 count-up entrance, §3 SSE lifecycle),
//          Tanya Donska (UX §6.3 batting average update, 1200ms counter tick)

import { countUp } from '../spring-easing';

declare global { interface Window { __heartbeat?: EventSource; } }

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerdictPayload {
  authorSlug?: string;
  newBattingAvg: number | null;
  trophyTier?: string;
}

// ── Guard ─────────────────────────────────────────────────────────────────────

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Element selectors (co-locate query logic) ─────────────────────────────────

function pctEl(chip: HTMLElement): HTMLElement | null {
  return chip.querySelector<HTMLElement>('.bac__pct[data-live-pct]');
}

function chipScore(chip: HTMLElement): number {
  return parseInt(chip.dataset.score ?? '0', 10);
}

// ── Count-up entrance ─────────────────────────────────────────────────────────

function snapToScore(chip: HTMLElement): void {
  const el = pctEl(chip);
  const to = chipScore(chip);
  if (el && to > 0) el.textContent = `${to}%`;
}

function animateCountUp(chip: HTMLElement): void {
  const el = pctEl(chip);
  const to = chipScore(chip);
  if (!el || to === 0) return;
  el.textContent = '0%';
  countUp(0, to,
    v    => { el.textContent = `${v}%`; },
    ()   => { el.textContent = `${to}%`; },
  );
}

function onIntersect(entries: IntersectionObserverEntry[], obs: IntersectionObserver): void {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const chip = entry.target as HTMLElement;
    obs.unobserve(chip); // fire exactly once
    isReducedMotion() ? snapToScore(chip) : animateCountUp(chip);
  }
}

// ── Observer singleton ────────────────────────────────────────────────────────

let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  return (sharedObserver ??= new IntersectionObserver(onIntersect, { threshold: 0.5 }));
}

// ── Tier-crossing flash ceremony ──────────────────────────────────────────────

function isTierChange(chip: HTMLElement, newTier: string): boolean {
  return !!newTier && chip.dataset.baTier !== newTier;
}

function removeTierFlash(chip: HTMLElement): void {
  chip.classList.remove('bac--tier-flash');
}

function applyTierFlash(chip: HTMLElement, newTier: string): void {
  chip.dataset.baTier = newTier;
  chip.classList.add('bac--tier-flash');
  chip.addEventListener('animationend', () => removeTierFlash(chip), { once: true });
}

function maybeTierFlash(chip: HTMLElement, newTier: string): void {
  if (!isReducedMotion() && isTierChange(chip, newTier)) {
    applyTierFlash(chip, newTier);
  } else if (newTier) {
    chip.dataset.baTier = newTier;
  }
}

// ── Live score delta update ───────────────────────────────────────────────────

function applySnapScore(chip: HTMLElement, el: HTMLElement, pct: number): void {
  el.textContent     = `${pct}%`;
  chip.dataset.score = String(pct);
}

function applyAnimatedScore(chip: HTMLElement, el: HTMLElement, from: number, pct: number): void {
  countUp(from, pct,
    v  => { el.textContent = `${v}%`; },
    () => { el.textContent = `${pct}%`; chip.dataset.score = String(pct); },
  );
}

function applyLiveScore(chip: HTMLElement, pct: number, tier: string): void {
  const el  = pctEl(chip);
  const old = chipScore(chip);
  if (!el || old === pct) return;
  maybeTierFlash(chip, tier);
  if (isReducedMotion()) { applySnapScore(chip, el, pct); return; }
  applyAnimatedScore(chip, el, old, pct);
}

// ── SSE verdict event ─────────────────────────────────────────────────────────

function handleVerdict(payload: VerdictPayload): void {
  if (payload.newBattingAvg === null) return;
  const pct  = Math.round(payload.newBattingAvg * 100);
  const tier = payload.trophyTier ?? '';
  const sel  = payload.authorSlug ? `[data-bac-slug="${payload.authorSlug}"]` : '.bac';
  document.querySelectorAll<HTMLElement>(sel).forEach(chip => applyLiveScore(chip, pct, tier));
}

// ── Heartbeat SSE stream ──────────────────────────────────────────────────────

function getStream(): EventSource {
  if (window.__heartbeat?.readyState !== EventSource.CLOSED) return window.__heartbeat!;
  return (window.__heartbeat = new EventSource('/api/heartbeat'));
}

function onVerdictEvent(e: Event): void {
  try { handleVerdict(JSON.parse((e as MessageEvent).data as string)); } catch { /* ignore */ }
}

function bindSseToLiveChips(): void {
  const live = document.querySelectorAll<HTMLElement>('[data-bac-live]');
  if (!live.length) return;
  getStream().addEventListener('verdict:declared', onVerdictEvent);
}

// ── Registration ──────────────────────────────────────────────────────────────

function registerCountUpChips(): void {
  document.querySelectorAll<HTMLElement>('.bac[data-score]').forEach(chip => {
    if (chipScore(chip) > 0) getObserver().observe(chip);
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

function init(): void {
  registerCountUpChips();
  bindSseToLiveChips();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

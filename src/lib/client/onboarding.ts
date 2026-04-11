// src/lib/client/onboarding.ts
// Conviction Onboarding — client-side state machine.
// Controls a 3-step full-screen overlay explaining the post lifecycle.
//
// State persistence: localStorage ov_seen + cookie (server-set via API).
// URL override: ?onboarding=1 forces display regardless of stored state.
// Keyboard: Escape=dismiss, →=next, ←=prev.
// Touch: swipe-left=next, swipe-right=prev.
//
// Credits: Mike Koch (arch spec 2026-04-11)

const LS_KEY = 'ov_seen';
const TOTAL_STEPS = 3;

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(LS_KEY) === '1'; }
  catch { return false; }
}

export function markSeen(): void {
  try { localStorage.setItem(LS_KEY, '1'); }
  catch { /* private browsing — ignore */ }
}

function isForced(): boolean {
  return new URLSearchParams(location.search).get('onboarding') === '1';
}

export function shouldShow(): boolean {
  return isForced() || !hasSeenOnboarding();
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function getOverlay(): HTMLElement | null {
  return document.getElementById('onboarding-overlay');
}

function getStep(el: HTMLElement): number {
  return parseInt(el.dataset.step ?? '1', 10);
}

function setStep(el: HTMLElement, n: number): void {
  el.dataset.step = String(Math.min(TOTAL_STEPS, Math.max(1, n)));
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function nextStep(): void {
  const el = getOverlay();
  if (!el) return;
  const cur = getStep(el);
  if (cur >= TOTAL_STEPS) { dismiss('complete'); return; }
  setStep(el, cur + 1);
}

export function prevStep(): void {
  const el = getOverlay();
  if (!el) return;
  setStep(el, getStep(el) - 1);
}

// ---------------------------------------------------------------------------
// Dismiss
// ---------------------------------------------------------------------------

function exitOverlay(el: HTMLElement): void {
  el.classList.add('ov--exit');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function postDismiss(step: number | 'complete'): void {
  fetch('/api/onboarding-dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
  }).catch(() => { /* analytics best-effort */ });
}

export function dismiss(step: number | 'complete'): void {
  markSeen();
  const el = getOverlay();
  if (el) exitOverlay(el);
  postDismiss(step);
}

// ---------------------------------------------------------------------------
// Input wiring
// ---------------------------------------------------------------------------

function initKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    const el = getOverlay();
    if (!el) return;
    if (e.key === 'Escape')      dismiss(getStep(el));
    if (e.key === 'ArrowRight')  nextStep();
    if (e.key === 'ArrowLeft')   prevStep();
  }, { passive: true });
}

function initSwipe(el: HTMLElement): void {
  let startX = 0;
  el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (dx < -50) nextStep();
    if (dx > 50)  prevStep();
  }, { passive: true });
}

function wireNavButtons(el: HTMLElement): void {
  el.querySelector('[data-ov-next]')?.addEventListener('click', nextStep);
  el.querySelector('[data-ov-prev]')?.addEventListener('click', prevStep);
  el.querySelector('[data-ov-dismiss]')?.addEventListener('click', () => {
    dismiss(getStep(el) === TOTAL_STEPS ? 'complete' : getStep(el));
  });
}

function wireDots(el: HTMLElement): void {
  el.querySelectorAll('[data-ov-dot]').forEach((dot) => {
    const n = parseInt((dot as HTMLElement).dataset.ovDot ?? '1', 10);
    dot.addEventListener('click', () => setStep(el, n));
  });
}

// ---------------------------------------------------------------------------
// Entry point — called at idle via requestIdleCallback
// ---------------------------------------------------------------------------

export function init(): void {
  if (!shouldShow()) return;
  const el = getOverlay();
  if (!el) return;
  el.removeAttribute('hidden');
  el.classList.add('ov--enter');
  wireNavButtons(el);
  wireDots(el);
  initSwipe(el);
  initKeyboard();
}

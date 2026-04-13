// src/lib/client/ba-unlock-ceremony.ts
// BA Unlock Ceremony — phase state machine for the 5th verdict milestone.
//
// Triggered via onUnlockTriggered() hook from ba-unlock-progress.ts.
// Drives DOM phases on #ba-unlock-ceremony (BattingAverageUnlockCeremony.astro).
// Uses frame-scheduler.ts singleton (mandatory — never raw rAF for ambient loops).
// One-shot countup uses spring-easing.ts countUp (consistent with existing code).
//
// Phase choreography (Mike napkin spec §ceremony-phases):
//   0ms   shattering  lock pulses gold, clip-path dissolve starts     200ms
//   200ms counting    BA % counts 0 → real value                      800ms
//   1000ms dropping   tier badge springs in                           400ms
//   1400ms settling   heartbeat starts, overlay begins to fade        ∞
//   1900ms (cleanup)  overlay hidden; inert; frame-scheduler cleared
//
// Guards:
//   sessionStorage 'ba-ceremony-fired' — replay-proof across page reloads
//   prefers-reduced-motion — instant swap, no animation
//
// Credits: Mike Koch (napkin spec §BACeremony, §points-of-interest)
//          Tanya Donska (UX §4.4 trophy spring, §8 motion system)

import { onUnlockTriggered } from './ba-unlock-progress';
import { countUp } from '../spring-easing';
import scheduler, { FramePriority } from './frame-scheduler';

// ── Phase timing constants (ms from unlock trigger) ───────────────────────────

const T_COUNTING  = 200;   // lock dissolves; countup begins
const T_DROPPING  = 1000;  // badge springs in (countup done at 200+800=1000ms)
const T_SETTLING  = 1400;  // badge settled; heartbeat starts
const T_FADE_OUT  = 1900;  // overlay fade begins
const T_CLEANUP   = 2400;  // overlay hidden + scheduler cleared

const CEREMONY_KEY  = 'ba-ceremony-fired';
const SCHEDULER_ID  = 'ba-ceremony';

// ── Tier icon + label maps ────────────────────────────────────────────────────

const TIER_ICONS: Record<string, string> = {
  bronze: '🏅', silver: '🥈', gold: '🏆', diamond: '💎',
};

const TIER_LABELS: Record<string, string> = {
  bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond',
};

// ── DOM helpers ───────────────────────────────────────────────────────────────

function getOverlay(): HTMLElement | null {
  return document.getElementById('ba-unlock-ceremony');
}

function getCountEl(overlay: HTMLElement): HTMLElement | null {
  return overlay.querySelector<HTMLElement>('.bauc-pct');
}

function getFillEl(overlay: HTMLElement): HTMLElement | null {
  return overlay.querySelector<HTMLElement>('.bauc-fill');
}

function getBadgeWrap(overlay: HTMLElement): HTMLElement | null {
  return overlay.querySelector<HTMLElement>('.bauc-badge-wrap');
}

// ── Phase setters ─────────────────────────────────────────────────────────────

function setPhase(overlay: HTMLElement, phase: string): void {
  overlay.dataset.phase = phase;
}

function revealOverlay(overlay: HTMLElement): void {
  overlay.removeAttribute('inert');
  overlay.classList.add('bauc--visible');
  setPhase(overlay, 'shattering');
}

function populateBadge(overlay: HTMLElement, tier: string): void {
  const wrap = getBadgeWrap(overlay);
  if (!wrap) return;
  const icon  = wrap.querySelector<HTMLElement>('.bauc-tier-icon');
  const label = wrap.querySelector<HTMLElement>('.bauc-tier-name');
  if (icon)  icon.textContent  = TIER_ICONS[tier] ?? '🏅';
  if (label) label.textContent = TIER_LABELS[tier] ?? tier;
  wrap.dataset.baTier = tier;
}

// ── Count-up + fill bar ───────────────────────────────────────────────────────

function animateCount(overlay: HTMLElement, pct: number): void {
  const countEl = getCountEl(overlay);
  const fillEl  = getFillEl(overlay);
  if (countEl) {
    countUp(0, pct, val => { countEl.textContent = `${val}%`; }, () => {
      countEl.dataset.cmPct = String(pct);
    });
  }
  // CSS-driven fill bar via @property --ba-count-progress (tokens.css)
  if (fillEl) {
    fillEl.style.setProperty('--ba-count-progress', String(pct));
  }
}

// ── Reduced-motion path ───────────────────────────────────────────────────────

function instantReveal(overlay: HTMLElement, pct: number, tier: string): void {
  revealOverlay(overlay);
  populateBadge(overlay, tier);
  const countEl = getCountEl(overlay);
  if (countEl) countEl.textContent = `${pct}%`;
  setPhase(overlay, 'settling');
  setTimeout(() => dismissOverlay(overlay), 800); // eslint-disable-line @typescript-eslint/no-use-before-define
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function dismissOverlay(overlay: HTMLElement): void {
  overlay.classList.add('bauc--fading');
  setTimeout(() => {
    overlay.setAttribute('inert', '');
    overlay.style.display = 'none';
    scheduler.unregister(SCHEDULER_ID);
  }, 500);
}

// ── Main ceremony runner ──────────────────────────────────────────────────────

function runCeremony(ba: number | null, tier: string | undefined): void {
  if (sessionStorage.getItem(CEREMONY_KEY)) return; // replay guard
  sessionStorage.setItem(CEREMONY_KEY, '1');

  const overlay = getOverlay();
  if (!overlay) return;

  const pct     = ba !== null ? Math.round(ba * 100) : 0;
  const tierKey = tier ?? 'bronze';

  // Register with frame-scheduler (keeps singleton warm; cleanup hooks here)
  scheduler.register(SCHEDULER_ID, () => {}, FramePriority.LOW);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    instantReveal(overlay, pct, tierKey);
    return;
  }

  // ── Animated path ────────────────────────────────────────────────────────
  revealOverlay(overlay);
  populateBadge(overlay, tierKey);

  setTimeout(() => {
    setPhase(overlay, 'counting');
    animateCount(overlay, pct);
  }, T_COUNTING);

  setTimeout(() => setPhase(overlay, 'dropping'), T_DROPPING);
  setTimeout(() => setPhase(overlay, 'settling'), T_SETTLING);
  setTimeout(() => dismissOverlay(overlay), T_FADE_OUT);
  // Scheduler cleanup happens inside dismissOverlay after T_CLEANUP-T_FADE_OUT ms
}

// ── Boot — register only if ceremony DOM is present ──────────────────────────

function boot(): void {
  if (!document.getElementById('ba-unlock-ceremony')) return;
  onUnlockTriggered(runCeremony);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

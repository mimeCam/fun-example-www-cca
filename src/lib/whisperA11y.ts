// src/lib/whisperA11y.ts
// Accessibility utilities for the FirstVisitWhisper component.
// Separated concern: reduced-motion detection, live-region announce,
// focus management. Pure functions, no DOM state.

// ---------------------------------------------------------------------------
// Reduced motion detection
// ---------------------------------------------------------------------------

/** True when user prefers reduced motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Live region announcements
// ---------------------------------------------------------------------------

/** Announce text to screen readers via an aria-live region. */
export function announceToScreenReader(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('role', 'status');
}

/** Clear the live region after announcement has been consumed. */
export function clearAnnouncement(el: HTMLElement): void {
  el.textContent = '';
}

// ---------------------------------------------------------------------------
// Dismiss tracking
// ---------------------------------------------------------------------------

const WHISPER_KEY = 'whisper_seen';

/** True when the whisper was already shown in a prior visit. */
export function wasWhisperSeen(): boolean {
  try { return localStorage.getItem(WHISPER_KEY) === '1'; }
  catch { return false; }
}

/** Mark whisper as seen so it never replays. */
export function markWhisperSeen(): void {
  try { localStorage.setItem(WHISPER_KEY, '1'); }
  catch { /* private browsing */ }
}

// ---------------------------------------------------------------------------
// Timing constants (single source of truth)
// ---------------------------------------------------------------------------

/** Delay before whisper appears (let visitor scan the page). */
export const WHISPER_DELAY_MS = 3000;

/** How long whisper step 1 is visible before auto-advancing. */
export const STEP1_DURATION_MS = 5000;

/** How long whisper step 2 (graveyard hint) is visible. */
export const STEP2_DURATION_MS = 4000;

/** Fade-in animation duration. */
export const FADE_IN_MS = 800;

/** Fade-out animation duration. */
export const FADE_OUT_MS = 600;

/** Reduced-motion: static display time before auto-dismiss. */
export const REDUCED_STATIC_MS = 4000;

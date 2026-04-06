// src/lib/whisperSequence.ts
// Sequence engine for the FirstVisitWhisper component.
// Handles: card targeting, step transitions, timing, dismiss logic.
// Exported as pure functions consumed by the component's inline script.
//
// Zero DOM state held here — callers pass elements in, get results out.

import {
  wasWhisperSeen,
  markWhisperSeen,
  prefersReducedMotion,
  announceToScreenReader,
  clearAnnouncement,
  WHISPER_DELAY_MS,
  STEP1_DURATION_MS,
  STEP2_DURATION_MS,
  REDUCED_STATIC_MS,
} from './whisperA11y';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhisperStep = 'idle' | 'step1' | 'step2' | 'done';

export interface WhisperElements {
  container: HTMLElement;
  step1: HTMLElement;
  step2: HTMLElement;
  liveRegion: HTMLElement;
}

export interface WhisperHandle {
  destroy: () => void;
}

// ---------------------------------------------------------------------------
// Card targeting — find the most-decayed visible card
// ---------------------------------------------------------------------------

const CARD_SEL = '.decay-card[data-decay-factor]';
const DECAY_THRESHOLD = 0.3;

/** Collect all decay cards currently in the DOM. */
function allDecayCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CARD_SEL));
}

/** Sort cards by decay factor descending (most decayed first). */
function sortByDecay(cards: HTMLElement[]): HTMLElement[] {
  return cards.sort((a, b) => {
    const da = parseFloat(a.dataset.decayFactor ?? '0');
    const db = parseFloat(b.dataset.decayFactor ?? '0');
    return db - da;
  });
}

/** Filter to cards with noticeable decay (above threshold). */
function noticeablyDecayed(cards: HTMLElement[]): HTMLElement[] {
  return cards.filter(c =>
    parseFloat(c.dataset.decayFactor ?? '0') > DECAY_THRESHOLD
  );
}

/** Fallback: pick the oldest card by pub date. */
function oldestCard(cards: HTMLElement[]): HTMLElement | null {
  if (cards.length === 0) return null;
  return cards.reduce((oldest, c) => {
    const d1 = oldest.dataset.pubDate ?? '';
    const d2 = c.dataset.pubDate ?? '';
    return d2 < d1 ? c : oldest;
  });
}

/**
 * Find the best card to whisper about: most-decayed visible card,
 * or oldest card if none are visibly decayed yet (fresh blog).
 */
export function findWhisperTarget(
  visibleCards: Set<HTMLElement>,
): HTMLElement | null {
  const visible = allDecayCards().filter(c => visibleCards.has(c));
  const decayed = noticeablyDecayed(visible);

  if (decayed.length > 0) return sortByDecay(decayed)[0];
  return oldestCard(visible);
}

// ---------------------------------------------------------------------------
// Intersection observer — tracks which cards are in viewport
// ---------------------------------------------------------------------------

/** Set up an IntersectionObserver tracking visible decay cards. */
export function observeCards(
  onVisible: (card: HTMLElement) => void,
  onHidden: (card: HTMLElement) => void,
): IntersectionObserver {
  const observer = new IntersectionObserver(
    (entries) => dispatchVisibility(entries, onVisible, onHidden),
    { threshold: 0.3 },
  );
  allDecayCards().forEach(c => observer.observe(c));
  return observer;
}

function dispatchVisibility(
  entries: IntersectionObserverEntry[],
  onVisible: (el: HTMLElement) => void,
  onHidden: (el: HTMLElement) => void,
): void {
  for (const entry of entries) {
    const el = entry.target as HTMLElement;
    entry.isIntersecting ? onVisible(el) : onHidden(el);
  }
}

// ---------------------------------------------------------------------------
// Step transitions
// ---------------------------------------------------------------------------

/** Show step 1: "this post is fading..." */
function showStep1(els: WhisperElements): void {
  els.container.classList.add('whisper--visible');
  els.step1.classList.add('whisper-step--active');
  announceToScreenReader(
    els.liveRegion,
    'Posts fade over time. Your attention keeps them alive.',
  );
}

/** Transition from step 1 to step 2: graveyard hint. */
function showStep2(els: WhisperElements): void {
  els.step1.classList.remove('whisper-step--active');
  els.step1.classList.add('whisper-step--exiting');
  els.step2.classList.add('whisper-step--active');
  announceToScreenReader(
    els.liveRegion,
    'Gone posts rest in the graveyard.',
  );
}

/** Dismiss: fade everything out and mark as seen. */
function dismissWhisper(els: WhisperElements): void {
  els.container.classList.add('whisper--exiting');
  els.container.classList.remove('whisper--visible');
  markWhisperSeen();
  clearAnnouncement(els.liveRegion);
}

// ---------------------------------------------------------------------------
// Gate check
// ---------------------------------------------------------------------------

/** True when the whisper should run (first visit, not seen). */
export function shouldWhisper(): boolean {
  if (typeof window === 'undefined') return false;
  return !wasWhisperSeen();
}

// ---------------------------------------------------------------------------
// Sequence orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full whisper sequence.
 * Returns a handle with destroy() for cleanup.
 */
export function runWhisperSequence(els: WhisperElements): WhisperHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const reduced = prefersReducedMotion();

  function schedule(fn: () => void, ms: number): void {
    timers.push(setTimeout(fn, ms));
  }

  function clearAll(): void {
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  if (reduced) {
    return runReducedSequence(els, schedule, clearAll);
  }
  return runFullSequence(els, schedule, clearAll);
}

/** Full animation sequence for users without reduced-motion. */
function runFullSequence(
  els: WhisperElements,
  schedule: (fn: () => void, ms: number) => void,
  clearAll: () => void,
): WhisperHandle {
  schedule(() => showStep1(els), WHISPER_DELAY_MS);
  schedule(() => showStep2(els), WHISPER_DELAY_MS + STEP1_DURATION_MS);
  schedule(
    () => dismissWhisper(els),
    WHISPER_DELAY_MS + STEP1_DURATION_MS + STEP2_DURATION_MS,
  );

  const dismiss = () => { clearAll(); dismissWhisper(els); };
  els.container.addEventListener('click', dismiss, { once: true });

  return { destroy: () => { clearAll(); dismiss(); } };
}

/** Simplified sequence: no animation, static text, shorter duration. */
function runReducedSequence(
  els: WhisperElements,
  schedule: (fn: () => void, ms: number) => void,
  clearAll: () => void,
): WhisperHandle {
  schedule(() => showStep1(els), WHISPER_DELAY_MS);
  schedule(
    () => dismissWhisper(els),
    WHISPER_DELAY_MS + REDUCED_STATIC_MS,
  );

  return { destroy: clearAll };
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

export function _testWhisperSequence(): void {
  console.assert(DECAY_THRESHOLD === 0.3, 'decay threshold is 0.3');
  console.assert(typeof shouldWhisper === 'function', 'shouldWhisper exists');
  console.assert(typeof findWhisperTarget === 'function', 'findWhisperTarget exists');
  console.assert(typeof runWhisperSequence === 'function', 'runWhisperSequence exists');
  console.log('[whisperSequence] OK — exports verified');
}

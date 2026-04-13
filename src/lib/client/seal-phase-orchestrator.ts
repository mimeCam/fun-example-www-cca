// src/lib/client/seal-phase-orchestrator.ts
// Phase + score observer — MutationObserver-based side-effect coordinator.
// Fires haptic/sound per score selection; manages tier label + hesitation beat.
// The DOM is the state — this module reads data-* attributes and fires effects.
// Rule: NO visual logic here; CSS state machine owns visuals via data-* attrs.
//
// Credits: Mike (§seal-phase-orchestrator §HesitationBeat),
//          Tanya (§score-tier-labels §10.1 §ScoreDots)

import { playScoreSelect }        from './seal-sound';
import { hapticForEvent }         from './seal-haptic';
import type { Unsubscribe }       from './frame-scheduler';

// ── Score tier ───────────────────────────────────────────────────────────────

type ScoreTier = 'low' | 'mid' | 'high' | 'max';

function scoreTier(score: number): ScoreTier {
  if (score <= 3) return 'low';
  if (score <= 6) return 'mid';
  if (score <= 9) return 'high';
  return 'max';
}

function tierLabel(tier: ScoreTier): string {
  return {
    low:  'Low confidence',
    mid:  'Moderate',
    high: 'Strong',
    max:  'Full conviction',
  }[tier];
}

function applyScoreTier(el: HTMLElement, score: number): void {
  const tier = scoreTier(score);
  el.dataset.sealScoreTier = tier;
  const label = el.querySelector<HTMLElement>('[data-score-tier-label]');
  if (label) label.textContent = tierLabel(tier);
}

// ── Hesitation beat ──────────────────────────────────────────────────────────
// 400ms CTA lock after score change (Doherty threshold — author feels weight).
// CSS [data-hesitating] drives the pulse animation; JS manages the timing only.

const HESITATION_MS = 400;  // mirrors --seal-hesitation-duration token

function composeCta(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('[data-compose-cta]');
}

function lockCta(el: HTMLElement): void {
  const cta = composeCta(el);
  if (!cta || cta.disabled) return;
  el.dataset.hesitating = '';
  cta.disabled = true;
}

function unlockCta(el: HTMLElement): void {
  delete el.dataset.hesitating;
  const note = el.querySelector<HTMLTextAreaElement>('[data-note]')?.value.trim() ?? '';
  const cta  = composeCta(el);
  if (cta) cta.disabled = note.length < 10;
}

function runHesitationBeat(el: HTMLElement): void {
  lockCta(el);
  setTimeout(() => unlockCta(el), HESITATION_MS);
}

// ── Score sound + haptic ─────────────────────────────────────────────────────

function fireScoreFeedback(score: number): void {
  playScoreSelect(score as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10);
  hapticForEvent('PRESS');
}

// ── Phase MutationObserver ────────────────────────────────────────────────────
// Watches data-phase attribute changes. Current duty: reset score tier label
// when author returns to compose phase (e.g. after an error reset).
// Designed for extension — future phases can add effects here without touching
// SealCeremony.astro's imperative flow.

function onPhaseChange(el: HTMLElement, phase: string): void {
  if (phase === 'compose') applyScoreTier(el, Number(el.dataset.score ?? '5'));
}

function watchPhaseAttr(el: HTMLElement): MutationObserver {
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.attributeName === 'data-phase') onPhaseChange(el, el.dataset.phase ?? '');
    }
  });
  obs.observe(el, { attributes: true, attributeFilter: ['data-phase'] });
  return obs;
}

// ── Receipt phase: emotional peak hold ──────────────────────────────────────
// 1800ms before share CTA becomes interactive — let the weight register.
// CSS [data-receipt-cta-locked] drives pointer-events + opacity (seal-receipt.css).
// Tanya §6.3 Phase 4: "the user seals and immediately wants to tell someone."
// The hold guarantees the trophy lands before the share prompt appears.

const RECEIPT_CTA_HOLD_MS = 1800;

function lockShareCta(btn: HTMLButtonElement): void {
  btn.dataset.receiptCtaLocked = '';
  setTimeout(() => delete btn.dataset.receiptCtaLocked, RECEIPT_CTA_HOLD_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call on every dot click. Coordinates tier label, CSS state, sound, haptic,
 * and hesitation beat — all in one place.
 */
export function onScoreChange(el: HTMLElement, score: number): void {
  el.dataset.score = String(score);
  applyScoreTier(el, score);
  fireScoreFeedback(score);
  runHesitationBeat(el);
}

/**
 * Call once from initCeremony. Wires MutationObserver + sets initial tier.
 * Returns an unsubscribe function for cleanup (SPA / island teardown).
 */
export function initOrchestrator(el: HTMLElement): Unsubscribe {
  const obs = watchPhaseAttr(el);
  applyScoreTier(el, Number(el.dataset.score ?? '5'));
  return (): void => obs.disconnect();
}

/**
 * Call once the receipt DOM is populated. Locks the share CTA for 1800ms
 * so the trophy visual registers before the author is prompted to share.
 * Pass the [data-receipt] element (not the outer ceremony container).
 */
export function onReceiptPhase(receiptEl: HTMLElement): void {
  const btn = receiptEl.querySelector<HTMLButtonElement>('[data-receipt-share]');
  if (btn) lockShareCta(btn);
}

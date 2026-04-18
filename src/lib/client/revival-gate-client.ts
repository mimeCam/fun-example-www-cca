// src/lib/client/revival-gate-client.ts
// Client mirror of revival-gate.ts — toggles data-gated on KeepButtons.
//
// Two call paths:
//   1. heartbeat-orchestrator.ts calls regate() directly on stage transition.
//   2. watchFeedGates() wires a MutationObserver for feed cards (IIFE tick path).
//
// data-gated="true"  → button is suppressed (pointer-events:none, opacity:0.25)
// data-gated removed → button is live
//
// Credits: Mike Koch (arch §3 runtime re-gating), Tanya (P1-C suppression spec)

import { canRevive } from '../revival-gate';
import type { DecayStage } from '../decay-engine';

const BUTTON_SELECTOR = '.keep-btn[data-keep-slug]';

/** Toggle data-gated on the KeepButton inside a single card. */
export function regate(card: HTMLElement, stage: DecayStage): void {
  const btn = card.querySelector<HTMLElement>(BUTTON_SELECTOR);
  if (!btn) return;
  if (canRevive(stage)) delete btn.dataset.gated;
  else btn.dataset.gated = 'true';
}

/** Gate a card from its current data-decay-stage attribute. */
function regateFromAttr(card: HTMLElement): void {
  const stage = card.dataset.decayStage as DecayStage | undefined;
  if (stage) regate(card, stage);
}

/** Handle MutationObserver callback — re-gate on data-decay-stage change. */
function onAttrChange(mutations: MutationRecord[]): void {
  for (const m of mutations) {
    if (m.attributeName === 'data-decay-stage') regateFromAttr(m.target as HTMLElement);
  }
}

/**
 * Watch all feed cards for stage changes via MutationObserver.
 * Also applies initial gate state from SSR-set data-decay-stage.
 * Safe to call once per page load.
 */
export function watchFeedGates(): void {
  const cards = document.querySelectorAll<HTMLElement>('.decay-card');
  if (!cards.length) return;
  const observer = new MutationObserver(onAttrChange);
  cards.forEach(card => {
    regateFromAttr(card);  // initial gate from SSR value
    observer.observe(card, { attributes: true, attributeFilter: ['data-decay-stage'] });
  });
}

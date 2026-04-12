// src/lib/ceremony-atmosphere.ts
// Ceremony lifecycle → atmosphere mapping. Single responsibility: ceremony
// stage changes drive body[data-atmosphere]; decoupled from generic atmosphere logic.
//
// Events dispatched on document — other components subscribe without importing
// ConvictionSeal directly (loose publish/subscribe, zero coupling).
//
// Architecture: Michael Koch · 2026-04-11

import { applyAtmosphere } from './atmosphere';

function dispatch(name: string, slug: string): void {
  document.dispatchEvent(new CustomEvent(name, { detail: { slug } }));
}

/** Phase 2 entry — hold begins. Warms the page to gold. */
export function ceremonyStart(slug: string): void {
  applyAtmosphere('gold');
  dispatch('ceremony:start', slug);
}

/** Phase 4 entry — hash lands. Page resolves to vindicated emerald. */
export function ceremonyResolve(slug: string): void {
  applyAtmosphere('vindicated');
  dispatch('ceremony:resolved', slug);
}

/** Abandon or error — page snaps back to fresh. */
export function ceremonyAbort(slug: string): void {
  applyAtmosphere('fresh');
  dispatch('ceremony:aborted', slug);
}

/** Receipt settled for 3s — quietly restore page to neutral. */
export function ceremonyComplete(slug: string): void {
  applyAtmosphere('fresh');
  dispatch('ceremony:complete', slug);
}

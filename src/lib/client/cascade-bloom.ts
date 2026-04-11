// src/lib/client/cascade-bloom.ts
// Staggered cascade bloom on related DecayCards after a successful revival.
// Discovers cards via .decay-card[data-slug] — no global store needed.
//
// Why 80ms stagger: below discrete-perception threshold (>100ms) but above
// simultaneous-perception threshold (<40ms). Users feel the bloom travel
// outward as a ripple, not explode as a flash.
//
// Credits: Michael Koch (arch spec §3 cascade-bloom, §stagger-physics)

const MAX_CASCADE = 5;      // more than 5 simultaneous glows = visual noise
const STAGGER_MS  = 80;     // perceived ripple, not a flash
const CEREMONY_MS = 1200;   // matches --duration-bloom token

/** Find up to MAX_CASCADE DecayCard elements matching the given slugs. */
function findRelatedCards(slugs: string[]): HTMLElement[] {
  const cards: HTMLElement[] = [];
  for (const slug of slugs.slice(0, MAX_CASCADE)) {
    const el = document.querySelector<HTMLElement>(`.decay-card[data-slug="${slug}"]`);
    if (el) cards.push(el);
  }
  return cards;
}

/** Set data-bloom="active" on a card; auto-clears after CEREMONY_MS. */
function activateBloom(el: HTMLElement): void {
  el.setAttribute('data-bloom', 'active');
  setTimeout(() => el.removeAttribute('data-bloom'), CEREMONY_MS);
}

/**
 * Trigger staggered bloom on cards related to the revived post.
 * Falls back gracefully if no matching cards exist in the DOM.
 */
export function triggerCascadeBloom(_originSlug: string, relatedSlugs: string[]): void {
  if (!relatedSlugs.length) return;
  findRelatedCards(relatedSlugs)
    .forEach((card, i) => setTimeout(() => activateBloom(card), (i + 1) * STAGGER_MS));
}

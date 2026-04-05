// src/lib/heartbeatFx.ts
// Visual effects for real-time heartbeat events from other visitors.
// Listens for 'heartbeat:revival' CustomEvent, finds matching DecayCard
// by data-slug, applies a brief glow animation. If card not visible,
// triggers a subtle page-edge ripple. Respects prefers-reduced-motion.

const PULSE_CLASS = 'heartbeat-pulse';
const RIPPLE_CLASS = 'heartbeat-ripple';
const PULSE_DURATION = 1500;
const RIPPLE_DURATION = 2000;

/** Returns an inline IIFE script string for BaseLayout injection. */
export function heartbeatFxScript(): string {
  return `(${fxIIFE.toString()})();`;
}

/** The actual FX logic, serialized as an IIFE. */
function fxIIFE(): void {
  const reduced = matchesReducedMotion();

  document.addEventListener('heartbeat:revival', ((e: CustomEvent) => {
    const { slug, count } = e.detail || {};
    if (!slug) return;
    if (document.body.hasAttribute('data-spectacle-active')) return;
    const card = findCard(slug);
    if (card) {
      pulseCard(card, count);
    } else {
      rippleEdge();
    }
  }) as EventListener);

  /** Find a DecayCard by slug attribute. */
  function findCard(slug: string): HTMLElement | null {
    return document.querySelector(`[data-slug="${slug}"]`);
  }

  /** Apply pulse glow to a specific card. */
  function pulseCard(card: HTMLElement, count: number): void {
    if (card.classList.contains('heartbeat-pulse')) return;
    updateBadge(card, count);
    if (reduced) return;
    card.classList.add('heartbeat-pulse');
    setTimeout(() => card.classList.remove('heartbeat-pulse'), 1500);
  }

  /** Update the revival badge count on the card. */
  function updateBadge(card: HTMLElement, count: number): void {
    if (!count) return;
    const badge = card.querySelector('.revival-badge');
    if (!badge) return;
    const label = count === 1
      ? 'remembered by 1 reader'
      : `remembered by ${count} readers`;
    badge.textContent = label;
    badge.removeAttribute('hidden');
    card.setAttribute('data-revival-count', String(count));
  }

  /** Subtle ripple on page edge when card is off-screen. */
  function rippleEdge(): void {
    if (reduced) return;
    let el = document.getElementById('heartbeat-ripple');
    if (!el) {
      el = createRippleEl();
      document.body.appendChild(el);
    }
    el.classList.remove('heartbeat-ripple');
    void el.offsetWidth; // force reflow
    el.classList.add('heartbeat-ripple');
    setTimeout(() => el!.classList.remove('heartbeat-ripple'), 2000);
  }

  /** Create the edge-ripple element once. */
  function createRippleEl(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'heartbeat-ripple';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'pointer-events:none',
      'z-index:5', 'border-radius:0',
    ].join(';');
    return el;
  }

  /** Check prefers-reduced-motion. */
  function matchesReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

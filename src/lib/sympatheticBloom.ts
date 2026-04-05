// src/lib/sympatheticBloom.ts
// Client-side handler: when a revival SSE event carries resonance[],
// triggers half-intensity blooms on connected posts visible in viewport.
// Staggers cascade by 200ms per connected post.
// Respects prefers-reduced-motion (opacity pulse only).
// Skips cards not in viewport via IntersectionObserver.

const CARD_SELECTOR = '.decay-card';
const STAGGER_MS = 200;
const DELAY_BASE_MS = 300;
const INTENSITY_SCALE = 0.5;
const MIN_STRENGTH = 0.2;

/** Returns an inline IIFE script string for BaseLayout injection. */
export function sympatheticBloomScript(): string {
  return `(${sympatheticIIFE.toString()})();`;
}

/** The sympathetic bloom logic, serialized as an IIFE. */
function sympatheticIIFE(): void {
  const visible = new Set<string>();

  const observer = createObserver(visible);
  observeAllCards(observer);

  document.addEventListener('heartbeat:revival', ((e: CustomEvent) => {
    const detail = e.detail;
    if (!detail?.resonance) return;
    scheduleCascade(detail.resonance, visible);
  }) as EventListener);

  document.addEventListener('revival:local:resonance', ((e: CustomEvent) => {
    const resonance = e.detail?.resonance;
    if (!resonance) return;
    scheduleCascade(resonance, visible);
  }) as EventListener);

  /** Create an IntersectionObserver tracking visible slugs. */
  function createObserver(vis: Set<string>): IntersectionObserver {
    return new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const slug = (entry.target as HTMLElement).dataset.slug;
        if (!slug) continue;
        if (entry.isIntersecting) vis.add(slug);
        else vis.delete(slug);
      }
    }, { threshold: 0.1 });
  }

  /** Observe all decay cards on the page. */
  function observeAllCards(obs: IntersectionObserver): void {
    document.querySelectorAll('.decay-card[data-slug]').forEach((el) => {
      obs.observe(el);
    });
  }

  /** Schedule staggered sympathetic blooms for connected posts. */
  function scheduleCascade(
    resonance: Array<{ slug: string; strength: number }>,
    vis: Set<string>,
  ): void {
    let index = 0;
    const announced = false;

    for (const link of resonance) {
      if (link.strength < 0.2) continue;
      if (!vis.has(link.slug)) continue;
      const delay = 300 + index * 200;
      const intensity = link.strength * 0.5;
      scheduleBloom(link.slug, intensity, delay);
      if (!announced) announceFirst(link.slug);
      index++;
    }
  }

  /** Dispatch a delayed revival:success with reduced intensity. */
  function scheduleBloom(slug: string, intensity: number, delay: number): void {
    setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent('revival:success', {
          detail: { slug, newCount: 1, intensity, source: 'sympathetic' },
        }),
      );
    }, delay);
  }

  /** ARIA announcement for the first sympathetic bloom in a cascade. */
  function announceFirst(slug: string): void {
    const card = document.querySelector(`.decay-card[data-slug="${slug}"]`);
    if (!card) return;
    const title = card.querySelector('.post-link');
    const name = title?.textContent?.trim() ?? 'A related post';
    const region = document.getElementById('bloom-aria-region');
    if (region) region.textContent = `${name} stirred in sympathy`;
  }
}

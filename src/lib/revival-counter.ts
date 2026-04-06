// src/lib/revival-counter.ts
// Revival Counter — client-side logic for the Live Collective Memory Display.
//
// Responsibilities:
//   1. Subscribe to /api/heartbeat SSE, filter by slug, animate count on others' revivals
//   2. Odometer animation (requestAnimationFrame, 600ms, no deps)
//   3. Days-gained calculation from decayBefore vs decayAfterRevival
//   4. Dispatch revival events from KeepButton clicks (optimistic + rollback)
//
// Architecture: Mike's spec — zero new endpoints, zero new npm deps.
// Credits: Mike (arch), Tanya (UX spec), Paul Kim (revival loop mandate)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevivalResult {
  ok: boolean;
  count: number;
  decayAfterRevival: number;
  decayPct: number;
  monthlyCount: number;
}

export interface RevivalCounterConfig {
  slug: string;
  initialCount: number;
  decayFactor: number;
  lifespan?: number;
}

// ---------------------------------------------------------------------------
// Days-gained calculation
// ---------------------------------------------------------------------------

/** Days a revival gives back. decayBefore > decayAfter means decay was reduced. */
export function daysGained(decayBefore: number, decayAfter: number, lifespan = 365): number {
  return Math.round((decayBefore - decayAfter) * lifespan);
}

// ---------------------------------------------------------------------------
// Odometer animation
// ---------------------------------------------------------------------------

const ODOMETER_DURATION = 600;

/** Ease-out cubic — snappy start, decelerate to target. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Animate a counter element from `from` to `to` over ODOMETER_DURATION ms. */
export function animateCount(el: HTMLElement, from: number, to: number): void {
  if (from === to) { el.textContent = String(to); return; }
  const start = performance.now();
  function tick(now: number) {
    const progress = easeOut(Math.min((now - start) / ODOMETER_DURATION, 1));
    el.textContent = String(Math.round(from + (to - from) * progress));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Days-gained banner
// ---------------------------------------------------------------------------

const BANNER_VISIBLE_MS = 4000;

/** Flash "+N days" banner below the counter for BANNER_VISIBLE_MS. */
export function flashDaysBanner(bannerEl: HTMLElement, days: number): void {
  if (days <= 0) return;
  bannerEl.textContent = `You gave this belief +${days} day${days !== 1 ? 's' : ''}`;
  bannerEl.classList.add('days-banner--visible');
  setTimeout(() => bannerEl.classList.remove('days-banner--visible'), BANNER_VISIBLE_MS);
}

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

/** Subscribe to /api/heartbeat, call onRevival when this slug is revived by another reader. */
export function subscribeHeartbeat(
  slug: string,
  onRevival: (count: number, decayAfterRevival: number) => void,
): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  let es: EventSource;
  try { es = new EventSource('/api/heartbeat'); } catch { return () => {}; }

  function handler(e: MessageEvent) {
    try {
      const data = JSON.parse(e.data) as { slug: string; count: number; decayAfterRevival: number };
      if (data.slug !== slug) return;
      onRevival(data.count, data.decayAfterRevival);
    } catch { /* malformed event */ }
  }

  es.addEventListener('revival', handler);
  return () => { es.removeEventListener('revival', handler); es.close(); };
}

// ---------------------------------------------------------------------------
// KeepButton wiring
// ---------------------------------------------------------------------------

/** Wire a KeepButton to a RevivalCounter using the existing /api/revive endpoint. */
export function wireKeepButton(
  btn: HTMLButtonElement,
  counterEl: HTMLElement,
  bannerEl: HTMLElement,
  slug: string,
  currentCount: number,
  decayFactor: number,
  lifespan: number,
): void {
  let count = currentCount;

  btn.addEventListener('click', () => {
    if (btn.classList.contains('kept')) return;

    // Optimistic update
    const optimistic = count + 1;
    animateCount(counterEl, count, optimistic);
    count = optimistic;
    markKept(btn);
    setButtonCount(btn, count);

    const sessionId = getSessionId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionId) headers['x-session-id'] = sessionId;

    fetch('/api/revive', {
      method: 'POST',
      keepalive: true,
      headers,
      body: JSON.stringify({ slug }),
    })
      .then(r => {
        if (r.status === 429) { rollback(btn, counterEl, count - 1); count--; return null; }
        return r.ok ? (r.json() as Promise<RevivalResult>) : null;
      })
      .then(data => {
        if (!data) return;
        // Reconcile with server truth
        if (data.count !== count) { animateCount(counterEl, count, data.count); count = data.count; }
        flashDaysBanner(bannerEl, daysGained(decayFactor, data.decayAfterRevival, lifespan));
        setButtonCount(btn, count);
      })
      .catch(() => { rollback(btn, counterEl, count - 1); count--; });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionId(): string | null {
  try { return sessionStorage.getItem('session-token'); } catch { return null; }
}

function markKept(btn: HTMLButtonElement): void {
  btn.classList.add('kept');
  btn.querySelector('.keep-label')!.textContent = 'Keeping this';
  const icon = btn.querySelector('.keep-icon');
  if (icon) icon.textContent = '✓';
}

function rollback(btn: HTMLButtonElement, counterEl: HTMLElement, prevCount: number): void {
  btn.classList.remove('kept');
  const label = btn.querySelector('.keep-label');
  if (label) label.textContent = 'Keep Alive';
  const icon = btn.querySelector('.keep-icon');
  if (icon) icon.textContent = '♥';
  animateCount(counterEl, prevCount + 1, prevCount);
  setButtonCount(btn, prevCount);
}

/** Sync the inline count badge inside the KeepButton (e.g. "Keep Alive · 14"). */
function setButtonCount(btn: HTMLButtonElement, count: number): void {
  const countSpan = btn.querySelector('.keep-count');
  if (!countSpan) return;
  if (count > 0) { countSpan.textContent = ` · ${count}`; countSpan.classList.remove('keep-count--hidden'); }
  else { countSpan.classList.add('keep-count--hidden'); }
}

// ---------------------------------------------------------------------------
// Bootstrap — called by RevivalCounter.astro inline script
// ---------------------------------------------------------------------------

export function initRevivalCounter(config: RevivalCounterConfig): void {
  const root = document.querySelector<HTMLElement>('.revival-counter-root');
  const counterEl = document.querySelector<HTMLElement>('[data-revival-count-display]');
  const bannerEl = document.querySelector<HTMLElement>('.days-banner');
  const btn = document.querySelector<HTMLButtonElement>('.keep-btn[data-keep-slug]');

  if (!root || !counterEl || !bannerEl || !btn) return;

  let count = config.initialCount;
  const lifespan = config.lifespan ?? 365;

  // Wire the button
  wireKeepButton(btn, counterEl, bannerEl, config.slug, count, config.decayFactor, lifespan);

  // Subscribe to live updates from other readers
  subscribeHeartbeat(config.slug, (newCount) => {
    if (newCount <= count) return; // ignore stale
    animateCount(counterEl, count, newCount);
    count = newCount;
    setButtonCount(btn, count);
  });
}

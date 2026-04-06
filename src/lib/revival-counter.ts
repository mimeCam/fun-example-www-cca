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
  /** Present on 429 when this tab has already revived this post. */
  alreadyRevived?: boolean;
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

type RevivalSSEPayload = { slug: string; count: number; decayAfterRevival: number };
type RevivalHandler = (count: number, decay: number) => void;

/** Subscribe to /api/heartbeat with auto-reconnect + exponential backoff. */
export function subscribeHeartbeat(slug: string, onRevival: RevivalHandler): () => void {
  if (typeof EventSource === 'undefined') return () => {};
  const state = { disposed: false, delay: 2_000, es: null as EventSource | null, timer: null as ReturnType<typeof setTimeout> | null };
  connectSSE(slug, onRevival, state);
  return () => disposeSSE(state);
}

/** Open one EventSource connection; wire revival + error handlers. */
function connectSSE(slug: string, onRevival: RevivalHandler, state: SSEState): void {
  if (state.disposed) return;
  let es: EventSource;
  try { es = new EventSource('/api/heartbeat'); } catch { return; }
  state.es = es;
  es.addEventListener('revival', (e: MessageEvent) => handleRevivalEvent(e, slug, onRevival));
  es.addEventListener('open', () => { state.delay = 2_000; }); // reset on successful connect
  es.addEventListener('error', () => scheduleReconnect(slug, onRevival, state));
}

/** Attempt reconnect after delay, doubling it each time (max 32s). */
function scheduleReconnect(slug: string, onRevival: RevivalHandler, state: SSEState): void {
  if (state.disposed) return;
  state.es?.close();
  state.es = null;
  state.timer = setTimeout(() => {
    state.delay = Math.min(state.delay * 2, 32_000);
    connectSSE(slug, onRevival, state);
  }, state.delay);
}

/** Parse and filter an SSE revival event for the current slug. */
function handleRevivalEvent(e: MessageEvent, slug: string, onRevival: RevivalHandler): void {
  try {
    const d = JSON.parse(e.data) as RevivalSSEPayload;
    if (d.slug === slug) onRevival(d.count, d.decayAfterRevival);
  } catch { /* malformed — ignore */ }
}

/** Tear down the EventSource and cancel any pending reconnect timer. */
function disposeSSE(state: SSEState): void {
  state.disposed = true;
  if (state.timer) clearTimeout(state.timer);
  state.es?.close();
}

interface SSEState {
  disposed: boolean;
  delay: number;
  es: EventSource | null;
  timer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// KeepButton wiring
// ---------------------------------------------------------------------------

/** Wire a KeepButton + RevivalCounter to the pact:confirmed event from keep-pact.ts. */
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
  const counter = { count: () => count, setCount: (n: number) => { count = n; } };
  // Pact ritual dispatches 'pact:confirmed' before revival fires — listen on window.
  // For buttons without pact (no decayFactor prop), keep-pact.ts never boots, so
  // pact:confirmed never fires — those buttons are handled by KeepButton.astro inline script.
  window.addEventListener('pact:confirmed', (e: Event) => {
    const detail = (e as CustomEvent<{ slug: string; why?: string }>).detail;
    if (detail.slug !== slug) return;
    onKeepClick(btn, counterEl, bannerEl, slug, decayFactor, lifespan, counter);
  });
  btn.dataset.wired = 'revival-counter'; // blocks KeepButton.astro fallback handler
}

/** Handle a single KeepButton click — optimistic update + API call. */
function onKeepClick(
  btn: HTMLButtonElement,
  counterEl: HTMLElement,
  bannerEl: HTMLElement,
  slug: string,
  decayFactor: number,
  lifespan: number,
  counter: { count: () => number; setCount: (n: number) => void },
): void {
  if (btn.classList.contains('kept')) return;
  const prev = counter.count();
  counter.setCount(prev + 1);
  animateCount(counterEl, prev, prev + 1);
  markKept(btn);
  setButtonCount(btn, prev + 1);
  postRevive(slug)
    .then(data => applyReviveResult(data, btn, counterEl, bannerEl, slug, decayFactor, lifespan, counter))
    .catch(() => rollback(btn, counterEl, counter.count() - 1, counter));
}

/** POST to /api/revive; resolve to data or rejection signal. */
async function postRevive(slug: string): Promise<RevivalResult | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sid = getSessionId();
  if (sid) headers['x-session-id'] = sid;
  const r = await fetch('/api/revive', { method: 'POST', keepalive: true, headers, body: JSON.stringify({ slug }) });
  if (!r.ok && r.status !== 429) return null;
  return r.json() as Promise<RevivalResult>;
}

/** Reconcile server response with optimistic state. */
function applyReviveResult(
  data: RevivalResult | null,
  btn: HTMLButtonElement,
  counterEl: HTMLElement,
  bannerEl: HTMLElement,
  slug: string,
  decayFactor: number,
  lifespan: number,
  counter: { count: () => number; setCount: (n: number) => void },
): void {
  if (!data) { rollback(btn, counterEl, counter.count() - 1, counter); return; }
  if (data.alreadyRevived) { markKept(btn); return; } // already kept this tab — stay locked
  if (!data.ok) { rollback(btn, counterEl, counter.count() - 1, counter); return; }
  if (data.count !== counter.count()) { animateCount(counterEl, counter.count(), data.count); counter.setCount(data.count); }
  setButtonCount(btn, counter.count());
  flashDaysBanner(bannerEl, daysGained(decayFactor, data.decayAfterRevival, lifespan));
  markSessionRevived(slug);
  dispatchRevivalConfirmed(data);
}

/** Stamp sessionStorage so the button shows "kept" on next page load within this tab. */
function markSessionRevived(slug: string): void {
  try { sessionStorage.setItem('revived:' + slug, '1'); } catch { /* storage blocked */ }
}

/** Dispatch a DOM event so revival-moment.ts can fire its visual choreography. */
function dispatchRevivalConfirmed(data: RevivalResult): void {
  document.dispatchEvent(new CustomEvent('revival:confirmed', { detail: data }));
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

function rollback(
  btn: HTMLButtonElement,
  counterEl: HTMLElement,
  prevCount: number,
  counter: { setCount: (n: number) => void },
): void {
  btn.classList.remove('kept');
  const label = btn.querySelector('.keep-label');
  if (label) label.textContent = 'Keep Alive';
  const icon = btn.querySelector('.keep-icon');
  if (icon) icon.textContent = '♥';
  animateCount(counterEl, prevCount + 1, prevCount);
  setButtonCount(btn, prevCount);
  counter.setCount(prevCount);
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
  const counterEl = document.querySelector<HTMLElement>('[data-revival-count-display]');
  const bannerEl = document.querySelector<HTMLElement>('.days-banner');
  const btn = document.querySelector<HTMLButtonElement>('.keep-btn[data-keep-slug]');

  if (!counterEl || !bannerEl || !btn) return;

  let count = config.initialCount;
  const lifespan = config.lifespan ?? 365;

  // Pre-mark kept if this tab already revived this post (survives page reloads)
  if (isSessionRevived(config.slug)) markKept(btn);

  wireKeepButton(btn, counterEl, bannerEl, config.slug, count, config.decayFactor, lifespan);

  subscribeHeartbeat(config.slug, (newCount) => {
    if (newCount <= count) return; // ignore stale
    animateCount(counterEl, count, newCount);
    count = newCount;
    setButtonCount(btn, count);
  });
}

/** True if this tab has already revived the given slug. */
function isSessionRevived(slug: string): boolean {
  try { return sessionStorage.getItem('revived:' + slug) === '1'; } catch { return false; }
}

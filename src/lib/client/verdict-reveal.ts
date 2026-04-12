// src/lib/client/verdict-reveal.ts
// Ceremony-page SSE layer: live-transitions Act III from cold → live on verdict:declared.
// Mirrors live-conviction.ts structure. Graceful: SSR already serves full resolved state
// when the page loads after the verdict — SSE is additive only.
//
// Race guard: checks [data-verdict-state] before animating — prevents double-reveal
// if the user loads at the exact moment the verdict is being written.
//
// Credits: Mike (arch §verdict-ceremony SSE layer spec),
//          Tanya (UX §3 reveal motion — @starting-style, 800ms shadow pulse)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerdictDeclaredPayload {
  slug:          string;
  verdict:       string;
  newBattingAvg: number | null;
  correct:       number;
  wrong:         number;
  pending:       number;
  sealedAt:      number;
}

// ---------------------------------------------------------------------------
// DOM helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

function ceremonyRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-verdict-slug]');
}

function rootSlug(root: HTMLElement): string {
  return root.dataset.verdictSlug ?? '';
}

function isAlreadyResolved(root: HTMLElement): boolean {
  return root.dataset.verdictState === 'resolved';
}

function revealActThree(root: HTMLElement): void {
  root.dataset.verdictState = 'resolved';
  const act3 = root.querySelector<HTMLElement>('.vc-act3');
  if (!act3) return;
  act3.classList.add('vc-act3--revealed');
  act3.dataset.actState = 'entered';  // CSS hook: re-triggers vc-act-rise entrance
}

function patchPct(avg: number): void {
  const el = document.querySelector<HTMLElement>('[data-vc-pct]');
  if (!el) return;
  el.textContent   = `${avg}%`;
  el.dataset.vcPct = String(avg);
}

function patchCounts(correct: number, wrong: number, pending: number): void {
  const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
  const setNum = (el: HTMLElement | null, n: number) => { if (el) el.textContent = String(n); };
  setNum(q('[data-vc-correct]'), correct);
  setNum(q('[data-vc-wrong]'),   wrong);
  setNum(q('[data-vc-pending]'), pending);
}

function patchBattingAvg(payload: VerdictDeclaredPayload): void {
  if (payload.newBattingAvg === null) return;
  patchPct(payload.newBattingAvg);
  patchCounts(payload.correct, payload.wrong, payload.pending);
}

// ---------------------------------------------------------------------------
// SSE handler
// ---------------------------------------------------------------------------

function handleVerdictDeclared(payload: VerdictDeclaredPayload): void {
  const root = ceremonyRoot();
  if (!root) return;
  if (rootSlug(root) !== payload.slug) return;  // different post — ignore
  if (isAlreadyResolved(root)) return;           // race guard: already resolved
  revealActThree(root);
  patchBattingAvg(payload);
}

// ---------------------------------------------------------------------------
// SSE lifecycle — reuse window.__heartbeat (Mike arch §3)
// ---------------------------------------------------------------------------

declare global {
  interface Window { __heartbeat?: EventSource; }
}

function getOrOpenStream(): EventSource {
  if (window.__heartbeat && window.__heartbeat.readyState !== EventSource.CLOSED) {
    return window.__heartbeat;
  }
  const es = new EventSource('/api/heartbeat');
  window.__heartbeat = es;
  return es;
}

function attachListener(es: EventSource): void {
  es.addEventListener('verdict:declared', (e: MessageEvent) => {
    try { handleVerdictDeclared(JSON.parse(e.data) as VerdictDeclaredPayload); }
    catch { /* malformed payload — skip silently */ }
  });
}

// ---------------------------------------------------------------------------
// IntersectionObserver fallback — browsers without @starting-style / :has()
// CSS verdict-ceremony.css: @supports not (selector(:has(*))) block hides
// [data-act] elements. Observer sets data-act-entered to trigger transitions.
// ---------------------------------------------------------------------------

function supportsModernCSS(): boolean {
  try { return CSS.supports('selector(:has(*))'); }
  catch { return false; }
}

function onActVisible(
  entries: IntersectionObserverEntry[],
  obs: IntersectionObserver,
): void {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    (entry.target as HTMLElement).dataset.actEntered = 'true';
    obs.unobserve(entry.target);
  }
}

function buildActObserver(): IntersectionObserver {
  return new IntersectionObserver(onActVisible, { threshold: 0.1 });
}

function observeActElements(obs: IntersectionObserver): void {
  document.querySelectorAll<HTMLElement>('[data-act]').forEach(el => obs.observe(el));
}

/** Fallback for browsers without CSS @starting-style support. No-op on modern. */
function initActFallback(): void {
  if (supportsModernCSS()) return;
  observeActElements(buildActObserver());
}

// ---------------------------------------------------------------------------
// Boot — entry point, called once after DOM ready
// ---------------------------------------------------------------------------

/** Initialise SSE listener for the verdict ceremony page. No-op on other pages. */
export function initVerdictReveal(): void {
  initActFallback();               // always: CSS entrance fallback for older browsers
  const root = ceremonyRoot();
  if (!root) return;               // not on a ceremony page — bail early
  if (isAlreadyResolved(root)) return; // SSR already served full resolved state
  attachListener(getOrOpenStream());
}

// Auto-boot when imported as a deferred module
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVerdictReveal, { once: true });
  } else {
    initVerdictReveal();
  }
}

// src/lib/client/live-conviction.ts
// Client-only: listens for 'verdict:declared' on the shared SSE stream,
// animates the batting average counter, and patches ConvictionMeter DOM nodes.
//
// Architecture (Mike §3):
//   - Reuses window.__heartbeat EventSource — no second connection.
//   - DOM contract: data-cm-pct / data-cm-correct / data-cm-wrong / data-cm-pending.
//   - requestAnimationFrame loop — never setInterval (collapses in background tabs).
//   - prefers-reduced-motion: instant patch, no tween.
//
// Credits: Mike (arch §3 SSE lifecycle, circuit-breaker, rAF),
//          Tanya (UX §7 ConvictionMeter hero spec),
//          DevBrain (nolanlawson.com/2025/08/31 — rAF vs setInterval)

import { showVerdictFlash } from './verdict-flash';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerdictDeclaredPayload {
  slug: string;
  verdict: string;
  newBattingAvg: number | null;
  correct: number;
  wrong: number;
  pending: number;
  sealedAt: string;
}

interface MeterNodes {
  root:    HTMLElement;
  pct:     HTMLElement;
  correct: HTMLElement;
  wrong:   HTMLElement;
  pending: HTMLElement;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function findMeter(): MeterNodes | null {
  const root = document.getElementById('conviction-meter') as HTMLElement | null;
  if (!root) return null;
  const pct     = root.querySelector<HTMLElement>('[data-cm-pct]');
  const correct = root.querySelector<HTMLElement>('[data-cm-correct]');
  const wrong   = root.querySelector<HTMLElement>('[data-cm-wrong]');
  const pending = root.querySelector<HTMLElement>('[data-cm-pending]');
  if (!pct || !correct || !wrong || !pending) return null;
  return { root, pct, correct, wrong, pending };
}

function currentPct(nodes: MeterNodes): number {
  return parseInt(nodes.pct.dataset.cmPct ?? '0', 10);
}

// ---------------------------------------------------------------------------
// Color class swap — cold → amber/yellow/slate (Tanya §2 thresholds)
// ---------------------------------------------------------------------------

const COLOR_MODS = ['cm--cold', 'cm--amber', 'cm--yellow', 'cm--slate'] as const;

function modForPct(pct: number): string {
  if (pct >= 70) return 'cm--amber';
  if (pct >= 50) return 'cm--yellow';
  return 'cm--slate';
}

function swapColorMod(root: HTMLElement, pct: number): void {
  COLOR_MODS.forEach(m => root.classList.remove(m));
  root.classList.add(modForPct(pct));
}

// ---------------------------------------------------------------------------
// Instant DOM patch (used when reduced-motion or delta === 0)
// ---------------------------------------------------------------------------

function patchInstant(nodes: MeterNodes, payload: VerdictDeclaredPayload): void {
  const pct = payload.newBattingAvg ?? 0;
  nodes.pct.textContent     = `${pct}%`;
  nodes.pct.dataset.cmPct   = String(pct);
  nodes.correct.textContent = `✓ ${payload.correct} correct`;
  nodes.correct.dataset.cmCorrect = String(payload.correct);
  nodes.wrong.textContent   = `✗ ${payload.wrong} wrong`;
  nodes.wrong.dataset.cmWrong = String(payload.wrong);
  nodes.pending.textContent = `⏳ ${payload.pending} pending`;
  nodes.pending.dataset.cmPending = String(payload.pending);
  swapColorMod(nodes.root, pct);
}

// ---------------------------------------------------------------------------
// rAF counter animation — linear ease over DURATION_MS
// Credits: DevBrain rAF pattern — display-cycle-locked, collapses in bg tabs
// ---------------------------------------------------------------------------

const DURATION_MS = 600;

function animatePct(
  nodes:   MeterNodes,
  fromPct: number,
  toPct:   number,
  onDone:  () => void,
): void {
  const start = performance.now();
  function tick(now: number): void {
    const t   = Math.min((now - start) / DURATION_MS, 1);
    const val = Math.round(fromPct + (toPct - fromPct) * t);
    nodes.pct.textContent   = `${val}%`;
    nodes.pct.dataset.cmPct = String(val);
    if (t < 1) { requestAnimationFrame(tick); } else { onDone(); }
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Circuit breaker — skip animation if no data or no delta (Elon rule)
// ---------------------------------------------------------------------------

function shouldAnimate(payload: VerdictDeclaredPayload, fromPct: number): boolean {
  return payload.newBattingAvg !== null && payload.newBattingAvg !== fromPct;
}

// ---------------------------------------------------------------------------
// Main update handler
// ---------------------------------------------------------------------------

function handleVerdictDeclared(payload: VerdictDeclaredPayload): void {
  const nodes = findMeter();
  if (!nodes) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    patchInstant(nodes, payload);
    return;
  }

  const fromPct = currentPct(nodes);
  if (!shouldAnimate(payload, fromPct)) {
    patchInstant(nodes, payload);
    showVerdictFlash(payload.verdict, payload.slug);
    return;
  }

  const toPct = payload.newBattingAvg!;
  animatePct(nodes, fromPct, toPct, () => {
    patchInstant(nodes, payload);      // finalize all pill counts on completion
    showVerdictFlash(payload.verdict, payload.slug);
  });

  // Swap color class immediately on animation start — feels snappier
  swapColorMod(nodes.root, toPct);
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

function attachVerdictListener(es: EventSource): void {
  es.addEventListener('verdict:declared', (e: MessageEvent) => {
    try {
      handleVerdictDeclared(JSON.parse(e.data) as VerdictDeclaredPayload);
    } catch { /* malformed payload — safe to ignore */ }
  });
}

// ---------------------------------------------------------------------------
// Boot — called once after DOMContentLoaded
// ---------------------------------------------------------------------------

export function initLiveConviction(): void {
  const es = getOrOpenStream();
  attachVerdictListener(es);
}

// Auto-boot when imported as a deferred module
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveConviction, { once: true });
  } else {
    initLiveConviction();
  }
}

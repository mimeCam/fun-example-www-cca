// src/lib/client/verdict-seal-ceremony-sse.ts
// SSE subscription for VerdictSealCeremony — live BA update on verdict:declared.
// Reuses window.__presenceES poll pattern (same as verdict-ceremony.ts lines 119-130).
// Pure TS, no DOM deps in state logic — testable via mock callbacks.
//
// Credits: Mike (napkin plan §verdict-seal-ceremony-sse), Tanya (UX §3 reckoning phase)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerdictDeclaredPayload {
  slug:          string;
  newBattingAvg: number | null;
}

/** Called when verdict:declared fires for the watched slug. */
export type OnVerdictDeclared = (newBattingAvg: number | null) => void;

declare global {
  interface Window { __presenceES?: EventSource; }
}

// ---------------------------------------------------------------------------
// Handler builders — each ≤ 10 lines
// ---------------------------------------------------------------------------

function buildHandler(slug: string, onDeclared: OnVerdictDeclared) {
  return (e: MessageEvent) => {
    try {
      const p = JSON.parse(e.data) as VerdictDeclaredPayload;
      if (p.slug === slug) onDeclared(p.newBattingAvg);
    } catch { /* malformed SSE payload — skip silently */ }
  };
}

function attachToSource(es: EventSource, slug: string, onDeclared: OnVerdictDeclared): void {
  es.addEventListener('verdict:declared', buildHandler(slug, onDeclared));
}

function pollForSource(slug: string, onDeclared: OnVerdictDeclared): void {
  const poll = setInterval(() => {
    const es = window.__presenceES;
    if (!es) return;
    clearInterval(poll);
    attachToSource(es, slug, onDeclared);
  }, 500);
  setTimeout(() => clearInterval(poll), 8_000); // give up after 8s
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attaches a verdict:declared SSE listener for the given slug.
 * Calls onDeclared(newBattingAvg) when the matching verdict fires.
 * Reuses window.__presenceES — no new SSE connections opened.
 *
 * Poll pattern: 500ms interval, 8s timeout — identical to verdict-ceremony.ts.
 */
export function attachVerdictSSE(slug: string, onDeclared: OnVerdictDeclared): void {
  if (typeof window === 'undefined') return;  // SSR guard
  const es = window.__presenceES;
  if (es) { attachToSource(es, slug, onDeclared); return; }
  pollForSource(slug, onDeclared);
}

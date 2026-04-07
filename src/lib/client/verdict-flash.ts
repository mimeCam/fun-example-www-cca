// src/lib/client/verdict-flash.ts
// Ephemeral "verdict moment" banner — mounts, announces, fades, unmounts.
// Stateless: each call creates a fresh element; no global store, no cleanup refs.
// A plain setTimeout drives removal — correct use for a one-shot 3 s delay.
//
// prefers-reduced-motion: suppressed entirely; ARIA live region still updates.
//
// Credits: Mike (arch §6 VerdictFlash stateless spec),
//          Tanya (UX §11 muted-rose for wrong, verdict-green for correct)

// ---------------------------------------------------------------------------
// Verdict copy + color map
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  'still-true': '✓ Still true',
  'evolved':    '↗ Evolved',
  'wrong':      '✗ Wrong',
  'abandoned':  '— Abandoned',
};

const VERDICT_COLOR: Record<string, string> = {
  'still-true': '#2D6A4F',   // Verdict Green  — Tanya §3.1
  'evolved':    '#C8922A',   // Conviction Amber
  'wrong':      '#9B4B4B',   // Muted Rose     — author owns the miss with dignity
  'abandoned':  '#8C8480',   // Ash Gray
};

function labelFor(verdict: string): string {
  return VERDICT_LABEL[verdict] ?? `Verdict: ${verdict}`;
}

function colorFor(verdict: string): string {
  return VERDICT_COLOR[verdict] ?? '#8C8480';
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

function buildFlash(verdict: string, slug: string): HTMLElement {
  const el = document.createElement('div');
  el.className       = 'verdict-flash';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.dataset.slug    = slug;
  el.style.cssText   = [
    'position:fixed',
    'bottom:1.5rem',
    'right:1.5rem',
    'z-index:9999',
    `background:${colorFor(verdict)}`,
    'color:#fff',
    'font-size:0.8rem',
    'font-family:ui-monospace,monospace',
    'padding:0.55rem 1rem',
    'border-radius:8px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
    'opacity:1',
    'transition:opacity 400ms ease',
    'pointer-events:none',
  ].join(';');
  el.textContent = labelFor(verdict);
  return el;
}

// ---------------------------------------------------------------------------
// Fade-out helper — triggers CSS transition then removes element
// ---------------------------------------------------------------------------

function fadeOut(el: HTMLElement): void {
  el.style.opacity = '0';
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DISPLAY_MS = 3_000;
const FADE_MS    = 400;

/** Mount a verdict flash banner for 3 s, then self-remove. No-op if reduced motion. */
export function showVerdictFlash(verdict: string, slug: string): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const el = buildFlash(verdict, slug);
  document.body.appendChild(el);

  // After display window, start fade; element auto-removes on transitionend
  setTimeout(() => fadeOut(el), DISPLAY_MS - FADE_MS);
}

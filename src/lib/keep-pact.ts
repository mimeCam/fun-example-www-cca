// src/lib/keep-pact.ts
// Pact ritual orchestration — wires KeepButton click → PactPanel open → pact:confirmed.
// Pre-flight interceptor: ceremony happens BEFORE revival fires, not after.
//
// Event contract:
//   dispatches: window 'pact:confirmed' { slug, why? }
//   revival-counter.ts listens for this instead of 'click'.
//
// Architecture: zero new endpoints, zero new npm deps. Pure vanilla TS.
// Credits: Mike (arch spec), Tanya (UX §4.1 ceremonial weight), Paul Kim (pact framing)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PactConfig {
  slug:        string;
  count:       number;
  decayFactor: number;
  lifespan:    number;
  conviction:  string | null;
}

/** Live listeners attached to an open panel — needed for cleanup. */
interface PactListeners {
  onKeydown:  (e: KeyboardEvent) => void;
  onOutside:  (e: MouseEvent)    => void;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Boot the pact ritual for a KeepButton + PactPanel pair on the page.
 * Call once per post detail page — idempotent if called again.
 */
export function initKeepPact(config: PactConfig): void {
  if (isPactSealed(config.slug)) { applyKeptState(config.slug); return; }

  const btn   = resolveBtn(config.slug);
  const panel = resolvePanel(config.slug);
  if (!btn || !panel) return;

  btn.dataset.wired = 'keep-pact';   // blocks KeepButton.astro inline handler
  fillPactCopy(panel, config);       // hydrate SSR copy with live data

  wireChipToggles(panel);
  btn.addEventListener('click', () => openPact(btn, panel, config));
}

// ---------------------------------------------------------------------------
// Open / Close / Seal
// ---------------------------------------------------------------------------

/** Expand the panel, attach dismiss handlers. No-op if already open. */
function openPact(btn: HTMLButtonElement, panel: HTMLElement, config: PactConfig): void {
  if (panel.hasAttribute('data-open')) return;

  panel.setAttribute('data-open', '');
  panel.setAttribute('aria-hidden', 'false');
  btn.dataset.pactState = 'open';

  const listeners = buildListeners(panel, btn);
  attachListeners(listeners);
  storePanelListeners(panel, listeners);

  wireSealButton(panel, config.slug, btn);
  wireCloseButton(panel, btn);
}

/** Collapse panel. `cancelled` = true restores button to idle. */
function closePact(panel: HTMLElement, btn: HTMLButtonElement, cancelled: boolean): void {
  panel.removeAttribute('data-open');
  panel.setAttribute('aria-hidden', 'true');
  detachListeners(getPanelListeners(panel));
  if (cancelled) btn.dataset.pactState = 'idle';
}

/** Dispatch pact:confirmed → revival-counter.ts fires the actual API call. */
function sealPact(slug: string, panel: HTMLElement, btn: HTMLButtonElement): void {
  const why = getSelectedChip(panel);
  btn.dataset.pactState = 'sealing';
  closePact(panel, btn, false);
  markPactSealed(slug);
  window.dispatchEvent(new CustomEvent('pact:confirmed', { detail: { slug, why } }));
}

// ---------------------------------------------------------------------------
// Listener wiring helpers (each ≤ 10 lines)
// ---------------------------------------------------------------------------

function buildListeners(panel: HTMLElement, btn: HTMLButtonElement): PactListeners {
  return {
    onKeydown: (e) => handleKeydown(e, panel, btn),
    onOutside: (e) => handleOutsideClick(e, panel, btn),
  };
}

function attachListeners(l: PactListeners): void {
  document.addEventListener('keydown', l.onKeydown);
  // Delay so the triggering click doesn't immediately close the panel
  setTimeout(() => document.addEventListener('click', l.onOutside), 60);
}

function detachListeners(l: PactListeners | null): void {
  if (!l) return;
  document.removeEventListener('keydown', l.onKeydown);
  document.removeEventListener('click',   l.onOutside);
}

function wireSealButton(panel: HTMLElement, slug: string, btn: HTMLButtonElement): void {
  const seal = panel.querySelector<HTMLButtonElement>('[data-pact-seal]');
  seal?.addEventListener('click', () => sealPact(slug, panel, btn), { once: true });
}

function wireCloseButton(panel: HTMLElement, btn: HTMLButtonElement): void {
  const close = panel.querySelector<HTMLButtonElement>('[data-pact-close]');
  close?.addEventListener('click', () => closePact(panel, btn, true), { once: true });
}

// ---------------------------------------------------------------------------
// Dismiss handlers
// ---------------------------------------------------------------------------

function handleKeydown(e: KeyboardEvent, panel: HTMLElement, btn: HTMLButtonElement): void {
  if (e.key === 'Escape') { e.preventDefault(); closePact(panel, btn, true); }
}

function handleOutsideClick(e: MouseEvent, panel: HTMLElement, btn: HTMLButtonElement): void {
  const t = e.target as Node;
  if (!panel.contains(t) && !btn.contains(t)) closePact(panel, btn, true);
}

// ---------------------------------------------------------------------------
// Chip toggles
// ---------------------------------------------------------------------------

function wireChipToggles(panel: HTMLElement): void {
  panel.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach(chip => {
    chip.addEventListener('click', () => toggleChip(chip, panel));
  });
}

function toggleChip(chip: HTMLButtonElement, panel: HTMLElement): void {
  const wasSelected = chip.classList.contains('selected');
  panel.querySelectorAll('[data-chip]').forEach(c => c.classList.remove('selected'));
  if (!wasSelected) chip.classList.add('selected');
}

function getSelectedChip(panel: HTMLElement): string | undefined {
  return panel.querySelector<HTMLElement>('[data-chip].selected')?.dataset.chip;
}

// ---------------------------------------------------------------------------
// Session storage — pact-sealed gate
// ---------------------------------------------------------------------------

function markPactSealed(slug: string): void {
  try { sessionStorage.setItem(`pact-sealed:${slug}`, '1'); } catch { /* blocked */ }
}

function isPactSealed(slug: string): boolean {
  try { return sessionStorage.getItem(`pact-sealed:${slug}`) === '1'; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Copy generation
// ---------------------------------------------------------------------------

/**
 * Dynamic contextual copy based on decay + conviction state.
 * Exported for testing.
 */
export function buildPactCopy(count: number, decay: number, conviction: string | null): string {
  if (decay > 0.8 && (conviction === 'wrong' || conviction === 'abandoned'))
    return "This belief is almost gone. The author called it wrong. You'd be saving a ghost.";

  if (decay > 0.6 && conviction === 'still-true') {
    const tail = count > 0
      ? `${count} ${count === 1 ? 'person has' : 'people have'} kept it alive.`
      : 'Be the first to keep it alive.';
    return `The author still stands behind this. ${tail}`;
  }

  if (decay < 0.3)
    return count === 0
      ? "Still fresh. Be the first to sign this pact."
      : `Still fresh. ${count} ${count === 1 ? 'person has' : 'people have'} already kept it.`;

  if (count === 0) return "No one has kept this alive yet. Be the first.";
  return `${count} ${count === 1 ? 'person is' : 'people are'} keeping this alive. Add your name.`;
}

/** Hydrate the [data-pact-copy] element client-side (SSR already fills it; this is a safety net). */
function fillPactCopy(panel: HTMLElement, config: PactConfig): void {
  const el = panel.querySelector<HTMLElement>('[data-pact-copy]');
  if (!el || el.textContent?.trim()) return; // SSR already filled
  el.textContent = buildPactCopy(config.count, config.decayFactor, config.conviction);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function resolveBtn(slug: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`.keep-btn[data-keep-slug="${slug}"]`);
}

function resolvePanel(slug: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-pact-panel][data-slug="${slug}"]`);
}

/** Visual "kept" state applied when session already sealed. */
function applyKeptState(slug: string): void {
  const btn = resolveBtn(slug);
  if (!btn) return;
  btn.classList.add('kept');
  btn.dataset.wired = 'keep-pact';
  const label = btn.querySelector('.keep-label');
  if (label) label.textContent = 'Keeping this';
  const icon = btn.querySelector('.keep-icon');
  if (icon) icon.textContent = '✓';
}

// ---------------------------------------------------------------------------
// Listener storage on the panel element (avoids module-level state)
// ---------------------------------------------------------------------------

const LISTENERS_KEY = '__pactListeners';

function storePanelListeners(panel: HTMLElement, l: PactListeners): void {
  (panel as HTMLElement & { [LISTENERS_KEY]?: PactListeners })[LISTENERS_KEY] = l;
}

function getPanelListeners(panel: HTMLElement): PactListeners | null {
  return (panel as HTMLElement & { [LISTENERS_KEY]?: PactListeners })[LISTENERS_KEY] ?? null;
}

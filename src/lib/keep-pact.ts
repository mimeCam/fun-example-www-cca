// src/lib/keep-pact.ts
// Pact ritual orchestration — wires KeepButton click → PactPanel open → pact:confirmed.
// Pre-flight interceptor: ceremony happens BEFORE revival fires, not after.
//
// Event contract:
//   dispatches: window 'pact:confirmed' { slug, why? }
//   revival-counter.ts listens for this instead of 'click'.
//
// v176 PR-E — this module is ALSO the SSR-safe producer of the Keep
// receipt the /api/keep curl mouth, the pointer mouth, and the `K`
// keyboard mouth all serialize through (Mike napkin §3 "single oracle").
// The DOM-only section (initKeepPact and friends) is untouched; the new
// producer surface (§ SSR-SAFE PRODUCER below) is pure TS with no DOM,
// no fs, no network — imported by src/pages/api/keep.ts and by the
// golden test in src/lib/keep-golden.test.ts.
//
// Architecture: zero new endpoints, zero new npm deps. Pure vanilla TS.
// Credits: Mike (arch spec + v176 PR-E napkin §3 producer promotion),
//          Tanya (UX §4.1 ceremonial weight), Paul Kim (pact framing),
//          Krystle Clear (PR-E wedge: cap 1→0, --warn→--error), Sid —
//          every helper ≤ 10 lines. Motto: "code maintenance without tests."

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

// ═══════════════════════════════════════════════════════════════════════════
// v176 PR-E — SSR-SAFE PRODUCER (the "single oracle" for three mouths)
// ═══════════════════════════════════════════════════════════════════════════
//
// The Tri-Mouth Inventory (src/lib/tri-mouth-inventory.ts) names this file
// as the `keep-post` row's producer. The DOM section above is the pointer +
// keyboard surface's ceremonial prelude; THIS section is the byte-producing
// oracle that emits the receipt ALL three mouths return:
//
//     { slug, nonce, ts, kept, count, why? }
//
// Discipline (polymorphism-is-a-killer, Mike napkin §6):
//   · Zero DB imports. `keep-pact.ts` is also loaded into the client bundle
//     via `PactPanel.astro` — a `better-sqlite3` import graph here would
//     break Vite. The producer is PURE: the caller (the /api/keep route)
//     resolves ledger facts first and hands them in, mirroring how
//     `revival-engine.ts::buildRevivePayload` takes pre-resolved `ReviveFacts`.
//   · Nonce + clock are injectable seams so the golden test can pin both
//     without monkey-patching `globalThis`. Defaults resolve through the
//     shared `clock()` and Web Crypto's `randomUUID()`.
//
// Nonce shape: UUIDv4 from `crypto.randomUUID()` — lets the UI reflect
// `?r=<nonce>` via history.replaceState so copy/arrive round-trips stay
// legible (same pattern as /api/docs/cite).

import { now as clockNow } from './clock.ts';

// ── Receipt + input types ────────────────────────────────────────────────

/** The JSON shape ALL three mouths return for a keep action. Additive-
 *  forever: new fields go at the end; renaming is a breaking change. */
export interface KeepReceipt {
  readonly slug:  string;
  readonly nonce: string;
  readonly ts:    number;
  readonly kept:  boolean;
  readonly count: number;
  readonly why?:  string;
}

/** Input to the producer. `sessionId` is load-bearing: session-level
 *  idempotency is the guarantee that a double-tap returns `kept: false`
 *  without incrementing the ledger. `why` is the optional chip payload
 *  from the ceremony panel; absent when the mouth is the bare `K`
 *  hotkey or a body-less curl. */
export interface KeepPactInput {
  readonly slug:      string;
  readonly sessionId: string;
  readonly why?:      string;
}

/** Ledger facts the caller resolves BEFORE calling the producer — keeps
 *  this module free of DB imports (Vite-safe on the client bundle). The
 *  route handler computes these from `collectiveMemory.ts` helpers. */
export interface KeepLedgerFacts {
  /** Was this {sessionId, slug} already recorded prior to this call? */
  readonly alreadyKept: boolean;
  /** The revival count AFTER any increment the caller performed. */
  readonly count:       number;
}

/** Injectable seams — every default resolves through a safe default.
 *  Tests pass pinned clock/nonce so the receipt is reproducible. */
export interface KeepPactDeps {
  readonly clock: () => number;
  readonly nonce: () => string;
}

/** Default deps — every seam is a pure-function default. */
export const DEFAULT_KEEP_DEPS: KeepPactDeps = {
  clock: () => clockNow(),
  nonce: () => defaultNonce(),
};

/** Web-Crypto first; fall through to a tiny synchronous stub so the
 *  producer never throws on environments that lack `randomUUID` (older
 *  Node without Web Crypto, or test harnesses with locked globals). */
function defaultNonce(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return fallbackUuid();
}

/** RFC-4122-ish fallback — Math.random, not crypto-strong. Only ever
 *  runs on environments with no Web Crypto; the test pins a fixed nonce
 *  anyway, so strength is a non-goal. */
function fallbackUuid(): string {
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-4${r().slice(1)}-8${r().slice(1)}-${r()}${r()}${r()}`;
}

// ── Pure receipt-builder — the oracle the golden test stares at ──────────

/** Assemble a KeepReceipt from already-resolved inputs. Pure, total,
 *  allocation-only — no side effects. Drives the "shape is frozen"
 *  half of the golden test; the producer proves the "three mouths call
 *  it" half. Key order is stable so `JSON.stringify` is byte-stable too. */
export function buildKeepReceipt(
  input: KeepPactInput, ts: number, nonce: string,
  kept: boolean, count: number,
): KeepReceipt {
  const base = { slug: input.slug, nonce, ts, kept, count };
  return input.why === undefined ? base : { ...base, why: input.why };
}

// ── The producer — pure, SSR-safe, the single oracle ────────────────────

/** Produce a keep receipt from pre-resolved ledger facts. The caller
 *  (route or in-process test) owns the DB write; this function owns the
 *  byte shape. Three mouths, one producer (Mike napkin §3). */
export function keepPact(
  input: KeepPactInput, facts: KeepLedgerFacts,
  deps: Partial<KeepPactDeps> = {},
): KeepReceipt {
  const d  = { ...DEFAULT_KEEP_DEPS, ...deps };
  const ts = d.clock();
  const nonce = d.nonce();
  const kept = !facts.alreadyKept;
  return buildKeepReceipt(input, ts, nonce, kept, facts.count);
}

// ── In-memory ledger-seam helper — used by the golden test + API route.
//    Exports the SHAPE, not a singleton, so every caller is hermetic. ──

/** Minimal ledger surface the route implements against collectiveMemory
 *  and the golden test implements against a Map pair. The producer does
 *  NOT consume this interface directly (that would pull DB imports
 *  transitively); the route and test call these, derive {alreadyKept,
 *  count}, then call `keepPact`. */
export interface KeepPactLedger {
  readonly alreadyKept: (sessionId: string, slug: string) => boolean;
  readonly recordKeep:  (sessionId: string, slug: string) => void;
  readonly bumpCount:   (slug: string) => number;
  readonly readCount:   (slug: string) => number;
}

/** Build a throwaway in-memory ledger backed by two Maps. Every call is
 *  hermetic. Used by the golden test and the isolated-run sanity below. */
export function makeMemoryLedger(): KeepPactLedger {
  const sessions = new Set<string>();
  const counts   = new Map<string, number>();
  const key = (sid: string, slug: string) => `${sid}::${slug}`;
  return {
    alreadyKept: (sid, slug) => sessions.has(key(sid, slug)),
    recordKeep:  (sid, slug) => { sessions.add(key(sid, slug)); },
    bumpCount:   (slug) => bumpIn(counts, slug),
    readCount:   (slug) => counts.get(slug) ?? 0,
  };
}

/** Map-bump helper extracted to keep `makeMemoryLedger` ≤ 10 LoC. */
function bumpIn(counts: Map<string, number>, slug: string): number {
  const next = (counts.get(slug) ?? 0) + 1;
  counts.set(slug, next);
  return next;
}

/** Convenience: the full "resolve ledger facts + call producer" dance
 *  the route performs. Exported so the golden test proves parity between
 *  the direct call and the route-resolved call using one helper. */
export function keepWithLedger(
  input: KeepPactInput, ledger: KeepPactLedger,
  deps: Partial<KeepPactDeps> = {},
): KeepReceipt {
  const alreadyKept = ledger.alreadyKept(input.sessionId, input.slug);
  const count = alreadyKept
    ? ledger.readCount(input.slug)
    : ledger.bumpCount(input.slug);
  if (!alreadyKept) ledger.recordKeep(input.sessionId, input.slug);
  return keepPact(input, { alreadyKept, count }, deps);
}

// ── Isolated-run sanity block (openloop/inplace-testing-howto.md) ────────

export function _testKeepPact(): void {
  const ledger = makeMemoryLedger();
  const deps: KeepPactDeps = {
    clock: () => 1_700_000_000_000,
    nonce: () => 'fixed-nonce-0000-4000-8000-000000000001',
  };
  const first = keepWithLedger(
    { slug: 'hello-world', sessionId: 's1', why: 'useful' }, ledger, deps,
  );
  console.assert(first.kept === true,                 'first call is fresh');
  console.assert(first.count === 1,                   'count bumps to 1');
  console.assert(first.why === 'useful',              'why is preserved');
  console.assert(first.nonce.length > 16,             'nonce shape');

  const second = keepWithLedger(
    { slug: 'hello-world', sessionId: 's1' }, ledger, deps,
  );
  console.assert(second.kept === false,               'second call is idempotent');
  console.assert(second.count === 1,                  'count does not double-bump');
  console.assert(second.why === undefined,            'why is omitted when absent');

  const other = keepWithLedger(
    { slug: 'hello-world', sessionId: 's2' }, ledger, deps,
  );
  console.assert(other.kept === true,                 'different session is fresh');
  console.assert(other.count === 2,                   'count bumps for new session');
  console.log('[keep-pact] OK — producer idempotent, receipt shape stable.');
}

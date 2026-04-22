// src/lib/client/ds-kbd-lit.ts
// v153 — "chip lights on matching keydown" micro-interaction (Tanya UX
// spec §3.3). One pure normaliser, one DOM toggle pair, zero module-
// level state. The visual contract (E0 → E1 crossfade, 120ms snap, RM
// neighbour) lives in src/styles/ds-kbd.css — this module is the
// thinnest wire that binds a KeyboardEvent.key to the matching chip.
//
// Why this module exists (and why it is small):
//   · Three call sites already listen for keystrokes: matrix-keynav.ts
//     (arrows + Home/End/PageUp/PageDown), cell-cite.ts (c / Enter /
//     Space), keep-hotkey.ts (k / K). Each one needs the SAME lookup:
//     "given this KeyboardEvent, which `.ds-kbd` chips on screen teach
//     it?". Inlining that in three places creates the drift Mike's
//     napkin warned about — one listener learns a new alias and the
//     legend light goes dark somewhere else.
//   · Set-equality with the legend-scrape tests is the whole teaching
//     contract. A pure `keyToChipLabel()` normaliser is unit-testable
//     without JSDOM; the three legend tests already freeze the label
//     vocabulary (`Space`, `K`, `ArrowUp`, …).
//
// Shared-code discipline (AGENTS.md "shared code earns its slot"):
//   · Rule-of-three: this is the third consumer. The promote is earned.
//   · No polymorphism. Two exported functions + one normaliser. Flat.
//   · No `data-key` SSR attribute — the chip's `textContent` is the
//     single source of truth. Keeps SSR bytes unchanged; the legend
//     tests keep coupling to `<kbd>` contents alone (Elon §4.2).
//
// Non-duties (deliberate):
//   · NO listener registration. The three keystroke modules own their
//     own listeners; this module is a pair of pure functions they call.
//   · NO `document.querySelector` caching across boots. Chips are
//     re-scanned on each call — cheap (≤13 chips on /api/docs, 1 on a
//     post page) and immune to hydration order (Mike §7.4).
//   · NO `beacon()`. Chip-lit is feedback, not a cited-cell signal.
//
// Credits: Tanya (§3.3 chip-lights micro-interaction, §3.2 line-height
//          tokenisation, §5.1 E0→E1 shadow vocabulary), Mike (§5.1
//          "polymorphism is a killer", §7.4 re-scan don't cache),
//          Elon (§4.2 prose-free coupling, §4.1 single-line contract),
//          v152 keep-legend.test.ts line 6 rule-of-three discipline,
//          Sid — every function ≤ 10 lines, zero state, no new tokens.

// ── Selectors ──────────────────────────────────────────────────────────────

const KBD_SEL  = '.ds-kbd';
const LIT_ATTR = 'data-lit';
const LIT_TIMER_KEY = 'litTimer';     // dataset.litTimer — per-chip flip timer

// ── Pure normaliser ────────────────────────────────────────────────────────

/**
 * Map a KeyboardEvent.key value to the display label used on the matching
 * `.ds-kbd` chip. Pure function; no DOM, no globals. Unit-tested.
 *
 * Rules (mirror the legend-scrape tests' `labelToKey` inverses):
 *   · `' '`        → `'Space'` (Tanya §2b — the word, never a blank)
 *   · single letter → uppercase label when the keep-legend teaches `K`;
 *                    lowercase `c` is preserved because the cite-legend
 *                    teaches `c` (display form matches the physical key).
 *   · arrow keys, Enter, Home/End/PageUp/PageDown — identity.
 *
 * The single-letter case is the only ambiguity: keep-legend teaches `K`
 * (both `k` and `K` fire the handler) while cite-legend teaches `c`
 * (only lowercase fires — `C` is a capital letter, still accepted).
 * Returning BOTH forms keeps the caller's filter simple: whichever
 * variant the DOM actually rendered lights up.
 */
export function keyToChipLabels(key: string): readonly string[] {
  if (key === ' ') return ['Space'];
  if (key.length !== 1) return [key];
  // Single letter: emit both casings so the callers need not know which
  // label the surface happened to render (e.g. `k` vs `K`, `c` vs `C`).
  const lower = key.toLowerCase();
  const upper = key.toUpperCase();
  return lower === upper ? [lower] : [lower, upper];
}

// ── DOM helpers (each ≤ 10 lines, one responsibility) ──────────────────────

/** Find every `.ds-kbd` chip whose textContent matches one of `labels`. */
function findChips(root: ParentNode, labels: readonly string[]): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(KBD_SEL));
  const wanted = new Set(labels);
  return all.filter((el) => wanted.has((el.textContent ?? '').trim()));
}

/** Clear any pending flip-off timer scheduled for this chip. */
function clearLitTimer(chip: HTMLElement): void {
  const prev = Number(chip.dataset[LIT_TIMER_KEY] ?? '0');
  if (prev) window.clearTimeout(prev);
  delete chip.dataset[LIT_TIMER_KEY];
}

/** Flip `data-lit` ON; optionally schedule an OFF after `holdMs`. */
function lightOne(chip: HTMLElement, holdMs: number): void {
  clearLitTimer(chip);
  chip.setAttribute(LIT_ATTR, '');
  if (holdMs <= 0) return;
  const id = window.setTimeout(() => unlightOne(chip), holdMs);
  chip.dataset[LIT_TIMER_KEY] = String(id);
}

/** Flip `data-lit` OFF; cancels any pending auto-off timer. */
function unlightOne(chip: HTMLElement): void {
  clearLitTimer(chip);
  chip.removeAttribute(LIT_ATTR);
}

// ── Public API (what the three keystroke modules call) ────────────────────

/**
 * Light every `.ds-kbd` chip taught by `key`, in the given `root`
 * (defaults to `document`). If `holdMs > 0`, auto-flip off after that
 * many ms; if `holdMs === 0`, leave the chip lit until a later
 * `unlightForKey()` call (the keep-hotkey hold-release pattern).
 *
 * Returns the chips that were lit — callers rarely need this but tests
 * do (a chip list is easier to assert than re-querying the DOM).
 */
export function lightForKey(
  key: string,
  holdMs: number,
  root: ParentNode = document,
): HTMLElement[] {
  const chips = findChips(root, keyToChipLabels(key));
  for (const chip of chips) lightOne(chip, holdMs);
  return chips;
}

/** Clear `data-lit` on every chip taught by `key`. Symmetric partner
 *  to `lightForKey(key, 0, …)` — used by keep-hotkey's keyup handler. */
export function unlightForKey(key: string, root: ParentNode = document): void {
  const chips = findChips(root, keyToChipLabels(key));
  for (const chip of chips) unlightOne(chip);
}

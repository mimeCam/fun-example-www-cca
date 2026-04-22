// src/lib/client/keep-hotkey.ts
// v152 — the `K` hotkey for the floating keep button (Mike napkin "Earn
// the PROMOTE", scope §1). One predicate, one binding, zero new
// subsystems. Mirrors `isCiteKey` / `isNavKey` shape so the pattern is
// the third sibling, not a registry.
//
// Contract (Mike §2, Tanya §6):
//   · `k` / `K` with NO modifier chord → hold-to-revive on .keep-btn.
//   · Ctrl / Cmd / Alt + K → falls through (browser search etc.).
//   · Shift+K still revives (capital letter is a letter, not a chord).
//   · Key repeat suppressed — one press = one hold start.
//   · `bindKeepHotkey` is safe on pages without .keep-btn (no-op).
//
// Wire shape (Mike §napkin §7 "The hotkey just dispatches the same
// events `.keep-btn` already listens for"):
//   · keydown → synthesise `pointerdown` on the first .keep-btn in the
//     DOM, flowing straight into RevivalOrchestrator.wirePointer.
//   · keyup   → synthesise `pointerup` on the same element.
//   · No new events, no new protocol — the orchestrator is untouched.
//
// Credits: Mike (napkin §2, §3, §7 event reuse, §10 order of operations),
//          Tanya (§6.2 below-button chip, §6.3 "teach a live key"),
//          Elon (§4 one-line teaching contract), Paul (no silent keybind),
//          Sid — every function ≤ 10 lines, zero module-level state.

// ── Constants ──────────────────────────────────────────────────────────────
// The keep hotkey. Lowercase key compare mirrors the convention `isCiteKey`
// would follow for capital-letter keys (bare-letter match, no Caps-Lock
// guesswork). The one-member set makes the rule-of-three at isXKey visible.
const KEEP_KEYS: ReadonlySet<string> = new Set<string>(['k', 'K']);
const KEEP_BTN_SEL = '.keep-float-btn.keep-btn';

// ── Predicate ──────────────────────────────────────────────────────────────

/**
 * Pure predicate — true when a KeyboardEvent should begin/end a keep
 * hold. Rejects all modifier combos so Cmd+K / Ctrl+K / Alt+K fall
 * through to the browser (search, find, platform shortcuts). Shift+K
 * still revives (capital letter is a letter, not a chord). Mirrors
 * `isCiteKey` / `isNavKey` shape — no JSDOM, pure function.
 */
export function isKeepKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return KEEP_KEYS.has(e.key);
}

// ── Binding ────────────────────────────────────────────────────────────────

/** Resolve the keep button the hotkey targets, or null if the float is
 *  not on this page. Deliberately scoped to the floating instance — the
 *  inline feed-card .keep-btn is click-only today (Mike §10.7). */
function findKeepBtn(root: Document): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(KEEP_BTN_SEL);
}

/** Guard against text-input focus — we never hijack a user's typing. */
function inTextInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}

/** Dispatch a synthetic pointer event on the button so the existing
 *  RevivalOrchestrator.wirePointer handles it without new plumbing. */
function firePointer(btn: HTMLElement, type: 'pointerdown' | 'pointerup'): void {
  btn.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'keyboard' }));
}

/** Begin a keep hold from the keyboard — suppresses repeat. */
function handleKeydown(e: KeyboardEvent): void {
  if (!isKeepKey(e) || e.repeat || inTextInput(e)) return;
  const btn = findKeepBtn(document);
  if (!btn) return;
  e.preventDefault();
  firePointer(btn, 'pointerdown');
}

/** End the keep hold from the keyboard (threshold may have already fired). */
function handleKeyup(e: KeyboardEvent): void {
  if (!isKeepKey(e) || inTextInput(e)) return;
  const btn = findKeepBtn(document);
  if (!btn) return;
  e.preventDefault();
  firePointer(btn, 'pointerup');
}

/**
 * Wire the `K` hotkey on `root` (typically `document`). Returns an
 * unbind closure for symmetry with the other client modules. Safe on
 * pages without a floating keep button — handlers no-op via findKeepBtn.
 */
export function bindKeepHotkey(root: Document = document): () => void {
  root.addEventListener('keydown', handleKeydown);
  root.addEventListener('keyup',   handleKeyup);
  return () => {
    root.removeEventListener('keydown', handleKeydown);
    root.removeEventListener('keyup',   handleKeyup);
  };
}

// ── Auto-boot on DOMContentLoaded (deferred module) ───────────────────────
// SSR-safe: the `typeof document` guard lets this module be imported by
// node-test where `isKeepKey` is all we exercise, with no DOM synthesised.
// Matches cell-cite.ts / matrix-keynav.ts shape.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindKeepHotkey(), { once: true });
  } else {
    bindKeepHotkey();
  }
}

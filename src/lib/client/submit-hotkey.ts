// src/lib/client/submit-hotkey.ts
// v174 — the `Ctrl+Enter` / `⌘↩` hotkey for the community-submit composer
// (Mike napkin v174.1 §2 — "Wire the keyboard mouth on submit-post"). One
// pure predicate, one binding, zero new subsystems. Mirrors `keep-hotkey`
// shape so the pattern is the second hotkey-on-an-action sibling, not a
// new registry. ds-kbd-lit is the third consumer's fourth caller — the
// PROMOTE earned in v152 keeps earning.
//
// Contract (Mike §6, Tanya UX §3.3):
//   · Plain `Enter` does nothing — step-1 has a textarea where bare Enter
//     is "newline" and step-3 has focus-ring etiquette to honour.
//   · `Ctrl+Enter` (Windows/Linux) and `Meta+Enter` (macOS ⌘↩) fire.
//   · `Shift+Enter`, `Alt+Enter` fall through — not ours.
//   · The hotkey only fires when step-3 is the visible step. On step-1
//     (typing) and step-2 (PoW running) it is a no-op.
//   · The submit `<button>` is the SAME path the click handler dispatches
//     — we synthesise a `click` (Mike §6 (b), mirrors keep-hotkey's
//     "synthesise pointerdown" pattern). One source of truth for publish.
//   · While `#btn-publish` is `disabled` (publish in flight), no-op.
//
// Wire shape (Mike napkin §1 diagram):
//   keydown → synthesise `click` on `#btn-publish` → existing `publish()`
//   handler in submit.astro flows straight into POST /api/submit-post,
//   which is the SAME route the curl mouth speaks. No new fetch, no new
//   protocol — the producer (communityPosts.insertPost) is untouched.
//
// Non-duties (deliberate):
//   · NO module-level state. Pattern of the siblings: one `bind…()`
//     returning an unbind closure; handlers are free functions.
//   · NO new fetch — would create a second source of truth for publish
//     (Mike §6.1 polymorphism warning).
//   · NO focus shift — the user stays wherever they were.
//   · NO `event.repeat` listener thrash — handled in the predicate.
//
// Credits: Mike Koch (napkin v174.1 §1 diagram, §2 cycle scope, §6
//          points-of-interest 1–11, §7 acceptance criteria), Tanya
//          Donska (UX §3.3 chip-lights, §6 keyboard teaching contract,
//          §9 "rule the unmodified Enter does nothing"), Elon (§7
//          wedge order: submit-post keyboard FIRST), Krystle Clear
//          (--warn → --error wedge cadence — this is wedge #2 of the
//          three needed for the flip), Paul Kim (focus-over-breadth
//          pressure, MH-4 parity-drift discipline), v152 keep-hotkey.ts
//          prior art (the "synthesise on the button" pattern), Jason
//          Fried (slogan "click it, key it, curl it — same receipt on
//          the wire" — this PR earns it on submit-post), Sid — every
//          function ≤ 10 lines, zero module-level state.
//          2026-04-23. Motto: "code maintenance without tests."

// v153 Tanya §3.3 — chip-lit feedback. Pure helpers; this module owns
// no module-level state for the lit flag (the chip element carries it).
import { lightForKey } from './ds-kbd-lit';

// ── Constants ──────────────────────────────────────────────────────────────
// The publish button — single source of truth. The step-3 host element —
// gates the hotkey to the confirm step. Selectors stay co-located so a
// rename in submit.astro fails right here, in this comment block.
const PUBLISH_BTN_SEL = '#btn-publish';
const STEP3_ID        = 'step-3';
const HIDDEN_CLASS    = 'hidden';
// 120ms momentary flash — same beat as cell-cite.ts (Tanya §3.3). Publish
// is a fire-and-forget, not a hold; do NOT reach for the 0-no-auto-off arm.
const LIT_HOLD_MS     = 120;

// ── Predicate ──────────────────────────────────────────────────────────────

/**
 * Pure predicate — true when a KeyboardEvent should publish the article
 * on step-3. Bare `Enter` is rejected (textarea-newline, focus-ring
 * etiquette). `Shift+Enter` and `Alt+Enter` fall through. One of `Ctrl`
 * or `Meta` is required — never both. Mirrors `isKeepKey` shape — pure
 * function, no JSDOM, unit-testable.
 */
export function isSubmitKey(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter') return false;
  if (e.altKey || e.shiftKey) return false;
  return e.metaKey || e.ctrlKey;
}

// ── DOM helpers (each ≤ 10 lines, one responsibility) ─────────────────────

/** Resolve the publish button when it is on this page AND enabled.
 *  Returns null while publish is in flight (button disabled) — a guard
 *  the click path already enforces; we honour the same shape. */
function findPublishBtn(root: Document): HTMLButtonElement | null {
  const btn = root.querySelector<HTMLButtonElement>(PUBLISH_BTN_SEL);
  if (!btn || btn.disabled) return null;
  return btn;
}

/** True when step-3 (confirm + publish) is the visible step. The class
 *  toggle `hidden` is the SSR-default + JS-runtime contract submit.astro
 *  already uses (`showStep` / `.submit-step.hidden`). */
function inStep3(root: Document): boolean {
  const step = root.getElementById(STEP3_ID);
  if (!step) return false;
  return !step.classList.contains(HIDDEN_CLASS);
}

/** Cheap insurance — never hijack a typing user's keystroke. Step-3 has
 *  no inputs today; this guard is the value-of-the-pattern bet for a
 *  future confirm-step control. Mirror of keep-hotkey::inTextInput. */
function inTextInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}

/** Dispatch a synthetic click on the publish button — flows straight
 *  into the existing `publish()` handler in submit.astro. One source of
 *  truth for the publish path (Mike §6 polymorphism guard). */
function firePublish(btn: HTMLButtonElement): void {
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

// ── Handler ────────────────────────────────────────────────────────────────

/**
 * Keydown handler — gated by predicate, step-3 visibility, text-input
 * focus, and button enabled. On match: light the Enter chip (Tanya §3.3)
 * AND fire the click (Mike §6 source-of-truth). Both are owed; neither
 * is the other's prerequisite — order is "feedback first, action second"
 * so the user always sees the chip ack even if the click is debounced.
 */
function handleKeydown(e: KeyboardEvent): void {
  if (!isSubmitKey(e) || e.repeat || inTextInput(e)) return;
  if (!inStep3(document)) return;
  const btn = findPublishBtn(document);
  if (!btn) return;
  e.preventDefault();
  lightForKey('Enter', LIT_HOLD_MS);
  firePublish(btn);
}

// ── Binding ────────────────────────────────────────────────────────────────

/**
 * Wire the publish hotkey on `root` (typically `document`). Returns an
 * unbind closure for symmetry with the other client modules. Safe on
 * pages without `#btn-publish` — the handler no-ops via findPublishBtn.
 * No keyup partner: publish is a fire-and-forget, not a hold.
 */
export function bindSubmitHotkey(root: Document = document): () => void {
  root.addEventListener('keydown', handleKeydown);
  return () => {
    root.removeEventListener('keydown', handleKeydown);
  };
}

// ── Auto-boot on DOMContentLoaded (deferred module) ───────────────────────
// SSR-safe: the `typeof document` guard lets this module be imported by
// node-test where `isSubmitKey` is all we exercise, with no DOM synthesised.
// Matches keep-hotkey.ts / cell-cite.ts / matrix-keynav.ts shape.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindSubmitHotkey(), { once: true });
  } else {
    bindSubmitHotkey();
  }
}

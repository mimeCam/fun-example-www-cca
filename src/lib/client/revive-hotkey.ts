// src/lib/client/revive-hotkey.ts
// v175 — the `R` hotkey for the revive affordance (Mike napkin R-chord
// wedge, row #3 of the Tri-Mouth Inventory). Third sibling to
// keep-hotkey.ts and submit-hotkey.ts; one pure predicate, one binding,
// zero new subsystems. The PROMOTE is still the promote — no registry.
//
// Contract (Mike §2 / Tanya §4.1):
//   · `r` / `R` with NO modifier chord → fire the single revive trigger.
//   · Ctrl / Cmd + R → browser refresh wins (falls through).
//   · Alt + R → platform chord; falls through.
//   · Shift+R still revives (capital letter is a letter, not a chord).
//   · Key repeat suppressed — one press = one revive.
//   · `bindReviveHotkey` is safe on pages without a revive trigger (no-op).
//
// Wire shape (Mike napkin §4 ASCII):
//   keydown → synthesise `click` on the first `[data-revive-trigger]` →
//   existing click handler (RevivalMoment phase machine or the feed-card
//   delegated wiring in KeepButton.astro) flows into POST /api/revive.
//   One producer (src/lib/revival-engine.ts), three triggers. No new
//   events. No new protocol.
//
// Why `click` and not pointerdown/pointerup (differs from keep-hotkey):
//   Revive is an *instant verb*, not a hold. The keep-hotkey drives the
//   orchestrator spring via pointer events because the hold IS the
//   ceremony. The revive chord has no hold — Mike napkin §6 "revive is
//   an instant verb, not a hold"; Tanya §4.2 "one action, one feeling".
//
// Multiple revive targets on screen (endangered feed + floating keep):
//   the hotkey targets the focused element's nearest trigger, falling
//   back to the first `[data-revive-trigger]` in document order. The
//   floating-keep trigger is the installed base; if the page carries
//   both, focus wins — the reader's context survives.
//
// Credits: Mike Koch (napkin §2 contract, §4 architecture, §6 points-of-
//          interest 1–8), Tanya Donska (UX §4 revive experience, §3.2
//          "one affordance, one feedback" precedence, §3.3 chip-lit
//          teaching), Elon (§5.1 shortcut without scripture), Paul Kim
//          (MH-4 "no new top-level directory"), keep-hotkey.ts +
//          submit-hotkey.ts prior-sprint authors (template), AGENTS.md
//          (single-literal rule), Sid — every function ≤ 10 lines, zero
//          module-level state. 2026-04-23. Motto: "code maintenance
//          without tests."

// v153 Tanya §3.3 — chip-lit feedback. Pure helpers; this module owns no
// module-level state (the chip element carries `data-lit`).
import { lightForKey } from './ds-kbd-lit';

// ── Constants ──────────────────────────────────────────────────────────────
// The revive keys. Both forms included so Caps-Lock and Shift routes agree
// (mirror of keep-hotkey's KEEP_KEYS set). `[data-revive-trigger]` is the
// attribute the pointer affordance pins to itself — see inventory
// `revive.pointer` and FloatingKeepButton.astro. 120ms momentary flash
// (Tanya §3.3 — same beat as cell-cite.ts; revive is fire-and-forget).
const REVIVE_KEYS: ReadonlySet<string> = new Set<string>(['r', 'R']);
const REVIVE_TRIGGER_SEL  = '[data-revive-trigger]';
const LIT_HOLD_MS         = 120;

// ── Predicate ──────────────────────────────────────────────────────────────

/**
 * Pure predicate — true when a KeyboardEvent should fire a revive. Rejects
 * every Cmd/Ctrl/Alt combo so Cmd+R / Ctrl+R (browser refresh) and Alt+R
 * (platform chords) fall through. Shift+R still revives (capital letter
 * is a letter, not a chord). Mirrors `isKeepKey` shape — no JSDOM, pure
 * function. Unit-testable with plain object stand-ins.
 */
export function isReviveKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return REVIVE_KEYS.has(e.key);
}

// ── DOM helpers (each ≤ 10 lines, one responsibility) ─────────────────────

/** Guard against text-input focus — we never hijack a user's typing.
 *  Mirrors keep-hotkey::inTextInput verbatim (Mike §6 text-input guard). */
function inTextInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}

/** Resolve the revive trigger this keystroke targets, or null. Focus-aware:
 *  the active element's nearest `[data-revive-trigger]` wins, so a reader
 *  who tabbed to a specific endangered card does not hit the floating one.
 *  Fallback: first trigger in document order. */
function findReviveTrigger(root: Document): HTMLElement | null {
  const active = root.activeElement as HTMLElement | null;
  const nearby = active?.closest?.<HTMLElement>(REVIVE_TRIGGER_SEL) ?? null;
  if (nearby) return nearby;
  return root.querySelector<HTMLElement>(REVIVE_TRIGGER_SEL);
}

/** Dispatch a synthetic click — routes through the existing click handler
 *  on the pointer path (RevivalMoment phase machine / KeepButton delegate).
 *  One source of truth for revive (Mike §4 polymorphism guard). */
function fireClick(btn: HTMLElement): void {
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

// ── Handler ────────────────────────────────────────────────────────────────

/**
 * Keydown handler — gated by predicate, text-input focus, and trigger
 * presence. On match: flash the `R` chip (Tanya §3.3) AND fire the click
 * (Mike §6 source-of-truth). Feedback first, action second — mirrors
 * submit-hotkey's order so the user sees the chip ack even if the click
 * is debounced by an in-flight revive.
 */
function handleKeydown(e: KeyboardEvent): void {
  if (!isReviveKey(e) || e.repeat || inTextInput(e)) return;
  const btn = findReviveTrigger(document);
  if (!btn) return;
  e.preventDefault();
  lightForKey(e.key, LIT_HOLD_MS);
  fireClick(btn);
}

// ── Binding ────────────────────────────────────────────────────────────────

/**
 * Wire the `R` hotkey on `root` (typically `document`). Returns an unbind
 * closure for symmetry with the other client modules. Safe on pages
 * without a `[data-revive-trigger]` — handler no-ops via findReviveTrigger.
 * No keyup partner: revive is fire-and-forget, not a hold.
 */
export function bindReviveHotkey(root: Document = document): () => void {
  root.addEventListener('keydown', handleKeydown);
  return () => {
    root.removeEventListener('keydown', handleKeydown);
  };
}

// ── Auto-boot on DOMContentLoaded (deferred module) ───────────────────────
// SSR-safe: the `typeof document` guard lets this module be imported by
// node-test where `isReviveKey` is all we exercise, with no DOM synthesised.
// Matches keep-hotkey.ts / submit-hotkey.ts / cell-cite.ts shape.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindReviveHotkey(), { once: true });
  } else {
    bindReviveHotkey();
  }
}

// src/lib/client/stance-hotkey.ts
// v176 — the `1` / `2` / `3` keyboard wedge for `StickyStanceBar`
// (Mike napkin §1 — Krystle's PR-D row; Tanya §3.2 target-state band).
// Fourth sibling to keep-hotkey.ts / submit-hotkey.ts / revive-hotkey.ts —
// one pure predicate, one key→stance mapper, one binding, zero new
// subsystems. No registry, no polymorphism (Mike §4 "four flat siblings
// beats one clever tree").
//
// Contract (Mike §6 / Tanya §3.2):
//   · `1` / `2` / `3` with NO modifier chord → fire the matching
//     `agree` / `torn` / `disagree` button inside `.ssb`.
//   · Ctrl/Cmd/Alt + {1,2,3} → browser tab-switch wins; fall through.
//   · Shift+{1,2,3} → fall through (Shift+digits produce !/@/# on many
//     layouts; we reject on `.key` exact match only, which also yields
//     `'!'` etc. under Shift — so Shift is implicitly filtered without
//     checking the flag).
//   · Key repeat suppressed — one press = one stance cast.
//   · Text-input focus wins — never hijack a draft or URL bar.
//   · Bar-visibility gate — no-op until `.ssb` carries `ssb--visible`
//     (Mike §6.5 — mirrors submit-hotkey's `inStep3` gate).
//   · Voted-state gate — if the voted chip is already visible or the
//     `[data-vote]` buttons are `disabled`, no-op (no double flash; the
//     curl mouth is idempotent anyway).
//   · `bindStanceHotkey` is safe on pages without `.ssb` (no-op).
//
// Wire shape (Mike napkin §2 ASCII):
//   keydown → lightForKey (Tanya §3.3 chip ack) → synthetic `click` on
//   the matching `.ssb-vote-btn[data-vote="<stance>"]` → existing click
//   handler flows into POST /api/stance with the same `x-session-id`
//   header and body shape. One producer (src/lib/stance-ledger.ts),
//   three mouths.
//
// Credits: Mike Koch (napkin §1 scope, §2 wire diagram, §3 module table,
//          §5 tech stack, §6 1–11 points-of-interest), Tanya Donska
//          (UX §3.2 seal-closed state, §3.3 chip-lit discipline,
//          §6 motion budget), Elon Musk (§5.1 discipline, "three mouths,
//          stop counting"), Paul Kim (MH-4 close-the-seal filter),
//          Krystle Clear (PR-D scope), prior-sprint authors of
//          keep-hotkey.ts / submit-hotkey.ts / revive-hotkey.ts
//          (template — fourth sibling, line-for-line shape), AGENTS.md
//          (single-literal rule), Sid — every function ≤ 10 LoC, zero
//          module-level state. 2026-04-23. Motto: "code maintenance
//          without tests."

import { lightForKey } from './ds-kbd-lit';

// ── Constants ─────────────────────────────────────────────────────────────
//
// The three keys and their stance mapping. Kept as a frozen literal so
// the predicate, the resolver and the test module all read the SAME
// source of truth (Sid — no parallel lists). Order mirrors the
// `StickyStanceBar` button order (agree | torn | disagree), which is
// also the order the stance-ledger histogram names.

/** Key → stance identifier. Frozen, readonly; one source of truth. */
export const STANCE_KEY_MAP = {
  '1': 'agree',
  '2': 'torn',
  '3': 'disagree',
} as const;

/** Stance literal — matches the schema stance-ledger already speaks. */
export type Stance = (typeof STANCE_KEY_MAP)[keyof typeof STANCE_KEY_MAP];

const STANCE_KEYS: ReadonlySet<string> = new Set(Object.keys(STANCE_KEY_MAP));
const SSB_VISIBLE_CLS = 'ssb--visible';
const VOTE_BTN_SEL    = '.ssb .ssb-vote-btn[data-vote]';
const VOTED_CHIP_SEL  = '#ssb-voted-chip';
const LIT_HOLD_MS     = 120;  // Tanya §3.3 same beat as cell-cite.

// ── Predicate ─────────────────────────────────────────────────────────────

/**
 * Pure predicate — true when a KeyboardEvent should cast a stance.
 * Rejects every Cmd/Ctrl/Alt combo so Cmd+1 / Ctrl+1 (browser tab
 * switches) and Alt+1 (platform chord on Firefox) fall through. Shift
 * is filtered implicitly: Shift+1 produces `'!'` on most layouts, which
 * is not in the STANCE_KEYS set. No JSDOM; unit-testable.
 */
export function isStanceKey(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return STANCE_KEYS.has(e.key);
}

/** Map a digit key to its stance identifier, or `null` if not a match.
 *  Pure; used by the handler AND by tests to prove the wiring directly. */
export function keyToStance(key: string): Stance | null {
  return (STANCE_KEY_MAP as Record<string, Stance>)[key] ?? null;
}

// ── DOM helpers (each ≤ 10 LoC, one responsibility) ───────────────────────

/** Guard against text-input focus — we never hijack a user's typing.
 *  Mirrors the sibling hotkeys verbatim (Mike §6.4 text-input guard). */
function inTextInput(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}

/** True iff the stance bar exists AND is surfaced to the reader. The
 *  midpoint sentinel gates `ssb--visible`; pressing 1 before midpoint
 *  must not back-door a stance (Mike §6.5, Tanya §3.2). */
function barVisible(root: Document): boolean {
  const bar = root.querySelector<HTMLElement>('.ssb');
  return bar !== null && bar.classList.contains(SSB_VISIBLE_CLS);
}

/** True iff the reader has already voted this session. Two signals:
 *  the voted chip is rendered, OR the vote buttons are disabled (the
 *  in-flight submit path). Either → no-op (Mike §6.6 — idempotency). */
function alreadyVoted(root: Document): boolean {
  const chip = root.querySelector<HTMLElement>(VOTED_CHIP_SEL);
  if (chip && chip.hidden === false) return true;
  const btns = root.querySelectorAll<HTMLButtonElement>(VOTE_BTN_SEL);
  return btns.length > 0 && Array.from(btns).every((b) => b.disabled);
}

/** Resolve the `.ssb-vote-btn` for the given stance, or null. Scoped to
 *  `.ssb` so a page that grows a legend with the same `data-vote`
 *  attribute cannot intercept the synthesised click. */
function findStanceBtn(
  stance: Stance, root: Document,
): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(
    `.ssb .ssb-vote-btn[data-vote="${stance}"]`,
  );
}

/** Dispatch a synthetic click — routes through the existing
 *  StickyStanceBar click handler (Mike §4 one-producer invariant). */
function fireClick(btn: HTMLElement): void {
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

// ── Handler ───────────────────────────────────────────────────────────────

/** True when every handler-level gate passes: predicate, repeat,
 *  text-input focus, bar visibility, and voted state. Pure-ish — only
 *  reads the document. Kept separate so `handleKeydown` stays tiny. */
function shouldCast(e: KeyboardEvent): boolean {
  if (!isStanceKey(e) || e.repeat || inTextInput(e)) return false;
  return barVisible(document) && !alreadyVoted(document);
}

/**
 * Keydown handler — routes a matched digit to the corresponding button.
 * On match: flash the `1`/`2`/`3` chip (Tanya §3.3) AND fire the click
 * (Mike §6.8 feedback-first ordering; the chip acks even if the click
 * is debounced by an in-flight submit).
 */
function handleKeydown(e: KeyboardEvent): void {
  if (!shouldCast(e)) return;
  const stance = keyToStance(e.key);
  const btn = stance ? findStanceBtn(stance, document) : null;
  if (!btn || btn.disabled) return;
  e.preventDefault();
  lightForKey(e.key, LIT_HOLD_MS);
  fireClick(btn);
}

// ── Binding ───────────────────────────────────────────────────────────────

/**
 * Wire the `1` / `2` / `3` hotkeys on `root` (typically `document`).
 * Returns an unbind closure for symmetry with the other client modules.
 * Safe on pages without `.ssb` — handler no-ops via `barVisible`.
 * No keyup partner: casting a stance is fire-and-forget, not a hold.
 */
export function bindStanceHotkey(root: Document = document): () => void {
  root.addEventListener('keydown', handleKeydown);
  return () => {
    root.removeEventListener('keydown', handleKeydown);
  };
}

// ── Auto-boot on DOMContentLoaded (deferred module) ───────────────────────
// SSR-safe: the `typeof document` guard lets this module be imported by
// node-test where `isStanceKey` / `keyToStance` are all we exercise, with
// no DOM synthesised. Matches the three sibling hotkey modules.

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bindStanceHotkey(), { once: true });
  } else {
    bindStanceHotkey();
  }
}

// src/lib/parity-seal.ts
// v175 "Parity Seal" — the ONE shared abstraction the Tri-Mouth Inventory
// page/api/CI all consume. Three readers, one producer — same discipline
// as stage-axes.ts and tri-mouth-inventory.ts.
//
// What this module owns (Mike napkin §3.6):
//   · parityFacts()      — pure facts derived from TRI_MOUTH_ACTIONS.
//   · parityCopy()       — fail-closed operator-language sentence OR null.
//   · parityJsonField()  — JSON field for /api/docs/cite (JSON branch).
//   · parityBandRows()   — one row per action for the UX band (Tanya §3).
//   · parityReceipt()    — the quiet one-line footer receipt (Tanya §4.5).
//
// Rules of the module:
//   · Pure — no fs, no DOM, no network, no clock. SSR-safe and importable
//     from both Astro pages and the prebuild guard.
//   · The parity sentence is a WITNESS, not a claim: it renders only when
//     the inventory meets the promotion threshold. Page renders `null`
//     when it's not yet true (Paul MH-2, Elon §5.5 operator-language).
//   · No polymorphism: if this file ever grows a second sentence, split
//     the second one out — do not branch in parityCopy().
//
// Anti-scope: no new tokens, no markdown, no marketing copy, no v175
// string in user-facing output. Three nouns and a number.
//
// Credits: Mike Koch (napkin §3 — the single new module, the three
//          consumers, fail-closed contract), Elon Musk (§5.5 operator
//          language: "three nouns and a number"), Tanya Donska (UX §3
//          — the band rows, §4.5 the receipt, §4.6 gold-only-when-zero),
//          Paul Kim (MH-2 "fails closed, not open"), AGENTS.md
//          (killer-feature anchor). Sid — 2026-04-23.
//          Motto: "code maintenance without tests."

import {
  TRI_MOUTH_ACTIONS,
  wiredActions,
  pendingActions,
  pendingSummary,
  readyToPromote,
  type TriMouthAction,
  type TriMouthPending,
} from './tri-mouth-inventory.ts';

// ── Types ────────────────────────────────────────────────────────────────

/** The three mouths are a constant-of-the-world (pointer / keyboard / curl).
 *  If this literal ever changes, the whole parity design is wrong — not just
 *  this number. Tanya §11 acceptance #3. */
export const PARITY_MOUTH_COUNT = 3 as const;

/** Pure snapshot of parity facts. `enforced` is the TRUTH gate —
 *  when true, the seal sentence is safe to render; when false, `null`. */
export interface ParityFacts {
  readonly rows:     number;
  readonly wired:    number;
  readonly pending:  number;
  readonly mouths:   typeof PARITY_MOUTH_COUNT;
  readonly enforced: boolean;
}

/** JSON field shape for /api/docs/cite (JSON branch). Additive-forever:
 *  never renamed, never re-typed. Mike napkin §3.5. */
export interface ParityJsonField {
  readonly rows:     number;
  readonly mouths:   typeof PARITY_MOUTH_COUNT;
  readonly enforced: boolean;
}

/** One row the UX band renders — one chip per mouth, honest `null` on
 *  pending mouths (Tanya §4.4 pending-is-honest rule). */
export interface ParityBandRow {
  readonly name:     string;
  readonly mouth:    string;
  readonly pointer:  string | null;
  readonly keyboard: string | null;
  readonly curl:     string | null;
  readonly status:   string;
  readonly pending:  TriMouthPending | null;
}

// ── Pure derivations ─────────────────────────────────────────────────────

/** Facts. Every field derives from the frozen literal + the promotion
 *  predicate; no constants live here that are not implied by inventory. */
export function parityFacts(): ParityFacts {
  const rows  = TRI_MOUTH_ACTIONS.length;
  const wired = wiredActions().length;
  return {
    rows, wired,
    pending:  rows - wired,
    mouths:   PARITY_MOUTH_COUNT,
    enforced: readyToPromote(),
  };
}

/** The operator-language sentence — Elon §5.5 "three nouns and a number".
 *  Fails closed: `null` when `enforced === false`. The page guards the
 *  render with `if (copy)`; a regression that drops `enforced` also
 *  silently drops the sentence. */
export function parityCopy(): string | null {
  const f = parityFacts();
  if (!f.enforced) return null;
  return `${f.rows} actions · ${f.mouths} mouths each · build-enforced parity.`;
}

/** JSON field for the cite endpoint. Emits honest counts regardless of
 *  enforcement; `enforced` is informative, not a promise. */
export function parityJsonField(): ParityJsonField {
  const f = parityFacts();
  return { rows: f.rows, mouths: f.mouths, enforced: f.enforced };
}

/** Band rows — one entry per action in literal order. Honest `null`
 *  mouths survive the mapping; the UI renders them as "pending" chips. */
export function parityBandRows(): readonly ParityBandRow[] {
  return TRI_MOUTH_ACTIONS.map(toRow);
}

/** One-line receipt for the band footer (Tanya §4.5). "all mouths wired."
 *  when zero debt; otherwise names the kind + the row names. */
export function parityReceipt(): string {
  const pending = pendingActions();
  if (pending.length === 0) return 'all mouths wired.';
  const kinds = uniqueKinds(pending);
  const names = pending.map((a) => a.name).join(', ');
  const noun  = pending.length === 1 ? 'mouth' : 'mouths';
  return `${pending.length} ${noun} pending · ${kinds.join('+')} (${names})`;
}

/** True iff the gold pip may render (Tanya §4.6 accountability rule).
 *  Zero pending rows AND enforcement paid — no gold on a half-debt ledger. */
export function parityGoldEarned(): boolean {
  const f = parityFacts();
  return f.enforced && pendingActions().length === 0;
}

// ── Helpers (each ≤ 10 LoC, Sid rule) ────────────────────────────────────

/** Project a TriMouthAction row to the UX-band row shape. */
function toRow(a: TriMouthAction): ParityBandRow {
  return {
    name:     a.name,
    mouth:    a.mouth,
    pointer:  a.pointer,
    keyboard: a.keyboard,
    curl:     a.curl,
    status:   a.status,
    pending:  a.pending ?? null,
  };
}

/** Distinct `pending` kinds across the supplied rows. Stable order. */
function uniqueKinds(actions: readonly TriMouthAction[]): string[] {
  const seen = new Set<string>();
  for (const a of actions) if (a.pending) seen.add(a.pending);
  return Array.from(seen);
}

// ── Re-export pendingSummary for the band footer (Tanya §4.5) ────────────
//
// The band uses the same helper the guard prints. Export the handle so
// the page imports one module for all four parity concerns.

export { pendingSummary };

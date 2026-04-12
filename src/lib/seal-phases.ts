// src/lib/seal-phases.ts
// Canonical phase type for the seal ceremony state machine.
// String phases double as CSS [data-phase] attribute selector values — zero lookup.
//
// Phase map:
//   compose  → score entry + conviction note
//   confirm  → read-only preview + oath checkbox (hesitation beat lives here)
//   anchor   → POST in flight, gold arc (1800ms minimum — do not shorten)
//   receipt  → sealed document, share/download
//
// The notarize moment is a SUB-STATE of anchor, not a top-level phase.
// CSS: [data-seal-phase="notarize"] fires via data-seal-phase set by the caller.
// JS:  onNotarize callback fires; caller sets data-seal-phase="notarize" briefly.
//
// Migration note: replaces the numeric union (0|1|2|3|'notarize'|4) that mixed
// number and string types and required a lookup table for CSS selectors.
// TypeScript exhaustiveness checking works identically on string unions.
//
// Credits: Mike (§Phase-unification §CSS-state-machine), Tanya (§4 ceremony spec)

export type SealPhase = 'compose' | 'confirm' | 'anchor' | 'receipt';

export type SealEvent =
  | 'CONFIRM'  // compose → confirm  (score + note filled, user clicks Seal)
  | 'SIGN'     // confirm → anchor   (oath checked, user clicks Sign & Anchor)
  | 'RECEIPT'  // anchor  → receipt  (notarize pause elapsed)
  | 'BACK'     // confirm → compose  (user goes back)
  | 'ERROR';   // any     → compose  (any failure — let user retry)

/** Pure phase transition — no DOM side effects. Safe to call in tests. */
export function transition(current: SealPhase, event: SealEvent): SealPhase {
  switch (event) {
    case 'CONFIRM': return current === 'compose' ? 'confirm' : current;
    case 'SIGN':    return current === 'confirm' ? 'anchor'  : current;
    case 'RECEIPT': return current === 'anchor'  ? 'receipt' : current;
    case 'BACK':    return current === 'confirm' ? 'compose' : current;
    case 'ERROR':   return 'compose';
    default:        return current;
  }
}

/** True once POST is in flight — abort not available from this phase onwards. */
export function isLocked(phase: SealPhase): boolean {
  return phase === 'anchor' || phase === 'receipt';
}

/** Forward-only guard: prevents impossible skips (compose → anchor is invalid). */
export function canAdvance(from: SealPhase, to: SealPhase): boolean {
  const order: SealPhase[] = ['compose', 'confirm', 'anchor', 'receipt'];
  return order.indexOf(to) === order.indexOf(from) + 1;
}

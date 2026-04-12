// src/lib/seal-phases.ts
// Pure seal-ceremony state machine — zero DOM dependencies.
// Extracted from seal-ceremony.ts; enables isolated testing and reuse.
//
// DESIGN NOTE: Phase 3.5 (NOTARIZE) is an intentional float, not a bug.
// • [data-seal-phase="3.5"] maps directly to a CSS attribute selector.
// • Weight meter: scaleY(calc(var(--seal-phase, 0) / 4)) = 87.5% at 3.5 —
//   "almost locked" is visually accurate: seal is real, ceremony still plays.
//
// Credits: Mike (§Architecture, §Phase-3.5-design, §state-machine), Tanya (§5)

export type SealPhase = 0 | 1 | 2 | 3 | 3.5 | 4;

// Named constant — avoids 3.5 literals at every call site.
export const NOTARIZE = 3.5 as SealPhase;

export type SealEvent =
  | 'HOVER' | 'UNHOVER'
  | 'PRESS' | 'RELEASE'
  | 'LOCK'
  | 'NOTARIZE'  // POST resolved — notarize ceremony before receipt
  | 'RECEIPT'   // Ceremonial pause elapsed — receipt expands
  | 'ERROR';    // Any failure — back to idle

/** Pure phase transition. No side effects. Safe to call in tests. */
export function transition(current: SealPhase, event: SealEvent): SealPhase {
  switch (event) {
    case 'HOVER':    return current === 0        ? 1        : current;
    case 'UNHOVER':  return current === 1        ? 0        : current;
    case 'PRESS':    return current <= 1         ? 2        : current;
    case 'RELEASE':  return current === 2        ? 0        : current;
    case 'LOCK':     return current === 2        ? 3        : current;
    case 'NOTARIZE': return current === 3        ? NOTARIZE : current;
    case 'RECEIPT':  return current === NOTARIZE ? 4        : current;
    case 'ERROR':    return 0;
    default:         return current;
  }
}

/** True once POST is in flight — escape must not abort from here. */
export function isLocked(phase: SealPhase): boolean {
  return phase >= 3;
}

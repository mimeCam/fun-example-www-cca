// src/lib/seal-phases.ts
// Pure seal-ceremony state machine — zero DOM dependencies.
// Extracted from seal-ceremony.ts; enables isolated testing and reuse.
//
// DESIGN NOTE: NOTARIZE uses a string literal ('notarize') not a float (3.5).
// • String literal enables exhaustiveness checking in TypeScript switch blocks.
// • [data-seal-phase="notarize"] CSS attribute selector — identical runtime behaviour.
// • Weight meter uses --seal-weight (0.875) set at render time, not calc(--seal-phase/4).
//
// Credits: Mike (§Architecture, §Phase-notarize-fix, §state-machine), Tanya (§5)

export type SealPhase = 0 | 1 | 2 | 3 | 'notarize' | 4;

// Named constant — avoids string literals at every call site.
export const NOTARIZE = 'notarize' as const satisfies SealPhase;

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
  if (phase === NOTARIZE) return true;
  return (phase as number) >= 3;
}

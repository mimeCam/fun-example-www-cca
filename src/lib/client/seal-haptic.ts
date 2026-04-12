// src/lib/client/seal-haptic.ts
// Haptic patterns keyed to SealEvent — thin wrapper over the Vibration API.
// Reuses haptics.ts infrastructure; seal-specific patterns live here.
// Progressive enhancement only: silent on desktop and iOS Safari.
// prefers-reduced-motion gate: same accessibility rule as sound.
//
// Credits: Mike (§Architecture §haptic-spec), DevBrain (motion accessibility)

import { haptic } from './haptics';
import type { SealEvent } from '../seal-phases';

/** True when OS accessibility settings request reduced motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Vibration patterns per SealEvent (ms: pulse, gap, pulse…). */
const PATTERNS: Partial<Record<SealEvent, number | number[]>> = {
  PRESS:    [15],
  LOCK:     [30, 20, 60],
  NOTARIZE: [50, 30, 50, 30, 100],
  RECEIPT:  [20, 40, 20, 40, 150],
  ERROR:    [80],
};

/**
 * Fire haptic feedback for a SealEvent.
 * No-ops when: device lacks Vibration API, prefers-reduced-motion is set,
 * or the event has no registered pattern (HOVER, UNHOVER, RELEASE).
 */
export function hapticForEvent(event: SealEvent): void {
  if (prefersReducedMotion()) return;
  const pattern = PATTERNS[event];
  if (!pattern) return;
  haptic(pattern);
}

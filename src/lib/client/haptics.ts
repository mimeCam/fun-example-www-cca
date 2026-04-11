// src/lib/client/haptics.ts
// Thin Vibration API wrapper with graceful degradation.
// Zero deps. Named patterns tuned for Hold-to-Revive ceremony states.
// If the device doesn't support haptics, every call is a silent no-op.
//
// Credits: Michael Koch (arch spec §4 haptics), DevBrain (haptic pattern research)

export type HapticPattern = number | number[];

/** Named patterns — keys map to Hold-to-Revive ceremony state transitions. */
export const PRESS_START:  HapticPattern = [10];               // subtle: "I felt you"
export const TENSION_RAMP: HapticPattern = [10, 20, 10, 20, 30]; // escalating: "hold…"
export const PEAK_CONFIRM: HapticPattern = [40];               // decisive: "kept ✓"
export const CANCEL:       HapticPattern = [5];                // quiet abort

/** True when the Vibration API is available on this device. */
export function canHaptic(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/** Fire a haptic pattern. No-ops if device has no vibration support. */
export function haptic(pattern: HapticPattern): void {
  if (!canHaptic()) return;
  try { navigator.vibrate(pattern); } catch { /* ignore — API may be restricted */ }
}

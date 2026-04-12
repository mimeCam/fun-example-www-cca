// src/lib/spring-easing.ts
// Pure spring interpolation — zero deps, zero side effects, zero DOM access.
// Critically-damped spring: x(t) = 1 - e^(-ζω₀t)(cos(ωdt) + (ζω₀/ωd)sin(ωdt))
//
// stiffness 180 / damping 12 → deliberate weight, not bouncy.
// Mirrors --motion-spring-duration (800ms) from motion.css.
//
// Credits: Michael Koch (arch spec) · Tanya (UX §3 count-up ceremony)

export type TickFn = (value: number) => void;
export type DoneFn = () => void;

const SPRING_MS = 800; // mirrors --motion-spring-duration

/**
 * Maps t ∈ [0,1] to displacement ∈ [0,1] via critically-damped spring physics.
 * stiffness controls angular frequency; damping controls decay rate.
 */
export function springFrame(t: number, stiffness = 180, damping = 12): number {
  const omega0 = Math.sqrt(stiffness);
  const zeta   = damping / (2 * omega0);
  const omegaD = omega0 * Math.sqrt(Math.abs(1 - zeta * zeta));
  const decay  = Math.exp(-zeta * omega0 * t);
  return 1 - decay * (Math.cos(omegaD * t) + (zeta * omega0 / omegaD) * Math.sin(omegaD * t));
}

/** Clamps spring output to [0,1] — avoids fractional overshoot at integer boundaries. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Single rAF frame: compute interpolated value and schedule next or finish. */
function frame(
  start: number, from: number, to: number,
  onTick: TickFn, onDone: DoneFn, now: number,
): void {
  const t   = Math.min((now - start) / SPRING_MS, 1);
  const pos = clamp01(springFrame(t));
  onTick(Math.round(from + (to - from) * pos));
  if (t < 1) {
    requestAnimationFrame(n => frame(start, from, to, onTick, onDone, n));
  } else {
    onDone();
  }
}

/**
 * rAF count-up driver: counts integer from → to over SPRING_MS with spring easing.
 * onTick fires each frame with the current integer value.
 * onDone fires once on completion.
 */
export function countUp(from: number, to: number, onTick: TickFn, onDone: DoneFn): void {
  requestAnimationFrame(now => frame(now, from, to, onTick, onDone, now));
}

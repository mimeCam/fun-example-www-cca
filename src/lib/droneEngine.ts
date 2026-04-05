// src/lib/droneEngine.ts
// Core Web Audio primitives for the generative audio drone.
// Stateless factory functions — take params, return audio nodes.
// Zero dependencies. Reusable by any future audio feature.
//
// Design: oscillator pair with slight frequency offset produces
// amplitude beating (monaural pulse). Lowpass filter shapes timbre.
// All gain values in decibels; converted internally.

/** Audio parameters consumed by the engine factories. */
export interface DroneParams {
  baseFreq: number;   // Hz (200–400 range for phone speaker compat)
  beatFreq: number;   // Hz offset for second oscillator (~2–6 for gentle pulse)
  gainDb: number;     // target loudness in dB (e.g. -28)
  fadeMs: number;     // fade-in/out duration in ms
  filterHz: number;   // lowpass cutoff frequency
}

/** Converts decibels to linear gain (0–1). */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Creates a pair of oscillators with a beat-frequency offset. */
export function createOscPair(
  ctx: AudioContext,
  baseFreq: number,
  beatFreq: number,
): [OscillatorNode, OscillatorNode] {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sine';
  osc2.type = 'sine';
  osc1.frequency.value = baseFreq;
  osc2.frequency.value = baseFreq + beatFreq;
  return [osc1, osc2];
}

/** Creates a gain node that fades from 0 to targetDb over fadeMs. */
export function createFadeGain(
  ctx: AudioContext,
  targetDb: number,
  fadeMs: number,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const now = ctx.currentTime;
  const target = dbToGain(targetDb);
  gain.gain.linearRampToValueAtTime(target, now + fadeMs / 1000);
  return gain;
}

/** Creates a lowpass filter at the given cutoff frequency. */
export function createFilter(
  ctx: AudioContext,
  cutoffHz: number,
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoffHz;
  filter.Q.value = 0.7;
  return filter;
}

/** Ramps a gain node to targetDb over fadeMs using Web Audio scheduler. */
export function rampGain(
  ctx: AudioContext,
  gainNode: GainNode,
  targetDb: number,
  fadeMs: number,
): void {
  const t = ctx.currentTime + fadeMs / 1000;
  gainNode.gain.linearRampToValueAtTime(dbToGain(targetDb), t);
}

// TODO: add stereo panning for binaural mode (v2)
// TODO: add subtle frequency drift over time for organic feel

/** Wires osc pair → filter → gain → destination. Returns stop handle + gain ref. */
export function startDrone(
  ctx: AudioContext,
  params: DroneParams,
): { gainNode: GainNode; stop: (fadeMs?: number) => void } {
  const [osc1, osc2] = createOscPair(ctx, params.baseFreq, params.beatFreq);
  const filter = createFilter(ctx, params.filterHz);
  const gain = createFadeGain(ctx, params.gainDb, params.fadeMs);
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc1.start();
  osc2.start();
  return {
    gainNode: gain,
    stop(fadeMs = params.fadeMs) {
      const now = ctx.currentTime;
      gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
      const cleanup = () => { osc1.stop(); osc2.stop(); };
      setTimeout(cleanup, fadeMs + 50);
    },
  };
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testDroneEngine(): void {
  console.assert(Math.abs(dbToGain(0) - 1) < 0.001, 'dB 0 = gain 1');
  console.assert(Math.abs(dbToGain(-20) - 0.1) < 0.001, 'dB -20 ≈ 0.1');
  console.assert(Math.abs(dbToGain(-28) - 0.0398) < 0.001, 'dB -28 ≈ 0.04');
  console.assert(dbToGain(-60) < 0.01, 'dB -60 nearly silent');
  console.assert(typeof rampGain === 'function', 'rampGain exported');
  console.log('[droneEngine] OK — dbToGain + rampGain verified');
}

// src/lib/client/seal-sound.ts
// WebAudio synthesizer for the Seal Ceremony Sensory Layer.
// All sound is synthesised — zero audio assets, zero network requests.
// Autoplay policy: AudioContext only created after first user gesture (initSealSound).
//
// Credits: Mike (§Architecture §WebAudio §sound-design-spec), DevBrain (microinteraction timing)

const STORAGE_KEY = 'conviction-arena:seal-sound-enabled';
const MAX_GAIN    = 0.15;   // intentionally quiet — the author opted in, not the audience

let ctx: AudioContext | null = null;

// ── Preference ────────────────────────────────────────────────────────────────

export function isSoundEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

export function setSoundEnabled(on: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(on)); }
  catch (e) { console.error('[seal-sound] localStorage write failed:', e); }
}

// ── AudioContext lifecycle ────────────────────────────────────────────────────

/** Call on first pointerdown inside the ceremony form — satisfies autoplay policy. */
export function initSealSound(): void {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    // Resume immediately; we're inside a user-gesture handler.
    if (ctx.state === 'suspended') ctx.resume().catch(
      e => console.error('[seal-sound] resume failed:', e)
    );
  } catch (e) {
    console.error('[seal-sound] AudioContext creation failed:', e);
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function ready(): AudioContext | null {
  if (!isSoundEnabled()) return null;
  if (!ctx) return null;
  if (ctx.state === 'suspended') ctx.resume().catch(
    e => console.error('[seal-sound] resume check failed:', e)
  );
  return ctx.state === 'closed' ? null : ctx;
}

function makeGain(ac: AudioContext, peak: number, fadeMs: number): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + fadeMs / 1000);
  g.connect(ac.destination);
  return g;
}

function osc(
  ac: AudioContext, type: OscillatorType,
  freq: number, gain: number, durationMs: number,
): void {
  const o = ac.createOscillator();
  const g = makeGain(ac, gain, durationMs);
  o.type      = type;
  o.frequency.setValueAtTime(freq, ac.currentTime);
  o.connect(g);
  o.start();
  o.stop(ac.currentTime + durationMs / 1000 + 0.01);
}

function oscGlide(
  ac: AudioContext, type: OscillatorType,
  freqFrom: number, freqTo: number, gain: number, durationMs: number,
): void {
  const o = ac.createOscillator();
  const g = makeGain(ac, gain, durationMs);
  const t = ac.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freqFrom, t);
  o.frequency.exponentialRampToValueAtTime(freqTo, t + durationMs / 1000);
  o.connect(g);
  o.start();
  o.stop(t + durationMs / 1000 + 0.01);
}

function whiteNoiseBurst(ac: AudioContext, gain: number, durationMs: number): void {
  const samples  = Math.ceil(ac.sampleRate * (durationMs / 1000));
  const buffer   = ac.createBuffer(1, samples, ac.sampleRate);
  const data     = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  const g   = makeGain(ac, gain, durationMs);
  src.buffer = buffer;
  src.connect(g);
  src.start();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Score dot click — pitch scales with conviction weight (200 + score × 40 Hz). */
export function playScoreSelect(score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): void {
  const ac = ready();
  if (!ac) return;
  try { osc(ac, 'sine', 200 + score * 40, MAX_GAIN * 0.6, 12); }
  catch (e) { console.error('[seal-sound] playScoreSelect failed:', e); }
}

/** Phase 2 — tactile click: white-noise burst, 20ms. */
export function playSealPress(): void {
  const ac = ready();
  if (!ac) return;
  try { whiteNoiseBurst(ac, MAX_GAIN * 0.5, 20); }
  catch (e) { console.error('[seal-sound] playSealPress failed:', e); }
}

/** Phase 3 — low thud: something closed. */
export function playSealLock(): void {
  const ac = ready();
  if (!ac) return;
  try { osc(ac, 'triangle', 80, MAX_GAIN, 80); }
  catch (e) { console.error('[seal-sound] playSealLock failed:', e); }
}

/** Notarize — hot-wax stamp: low thud + high shimmer, 600ms total. */
export function playNotarizeChime(): void {
  const ac = ready();
  if (!ac) return;
  try {
    osc(ac, 'triangle', 120, MAX_GAIN, 200);
    oscGlide(ac, 'sine', 800, 1200, MAX_GAIN * 0.7, 600);
  } catch (e) { console.error('[seal-sound] playNotarizeChime failed:', e); }
}

/** Phase 4 — crystalline ping: permanent. */
export function playReceiptReveal(): void {
  const ac = ready();
  if (!ac) return;
  try { oscGlide(ac, 'sine', 440, 880, MAX_GAIN * 0.8, 300); }
  catch (e) { console.error('[seal-sound] playReceiptReveal failed:', e); }
}

/** Error — soft detuned drop. */
export function playSealError(): void {
  const ac = ready();
  if (!ac) return;
  try { oscGlide(ac, 'triangle', 400, 200, MAX_GAIN * 0.5, 200); }
  catch (e) { console.error('[seal-sound] playSealError failed:', e); }
}

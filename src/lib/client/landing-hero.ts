// src/lib/client/landing-hero.ts
// Living Landing Hero — RAF bridge between decay math and demo DOM.
// Runs a synthetic demo post with no API or DB calls.
// All functions ≤10 lines per Sid's rule. Credits: Mike Koch (arch §LandingHero), Tanya Donska (UX §4).

// ── Constants ──────────────────────────────────────────────────────────────

const DEMO_MAX_DAYS  = 100;   // maxDays for the logarithmic formula
const DEMO_REAL_SECS = 10;    // 10 real seconds = 100 demo days
const FOSSIL_PAUSE   = 3000;  // 3s fossil pause before loop reset
const HOLD_MS        = 1200;  // hold-to-keep threshold in ms
const LOG_K          = 0.065; // logarithmic decay curvature (mirrors decay-engine.ts)
const FOSSIL_THRESH  = 0.97;  // above this → fossil (no pulse)

// Time compression: how many demo-ms pass per real-ms
const TIME_SCALE = (DEMO_MAX_DAYS * 86_400_000) / (DEMO_REAL_SECS * 1000);

const STAGE_NAMES = ['fresh', 'fading', 'endangered', 'ghost', 'fossil'] as const;
type Stage     = typeof STAGE_NAMES[number];
type DemoState = {
  startMs: number;    // real-time when current cycle began
  maxDays: number;
  fossilAt: number;   // real-time when fossil was reached (0 = not yet)
};

// ── Pure math (mirrors decay-engine.ts logarithmicDecay — inlined to avoid server bundle) ──

function logDecay(t: number, max: number): number {
  return Math.log(1 + t * LOG_K) / Math.log(1 + max * LOG_K);
}

function computeDecay(state: DemoState): number {
  const realElapsed = Date.now() - state.startMs;
  const demoDays = (realElapsed * TIME_SCALE) / 86_400_000;
  return Math.min(1, Math.max(0, logDecay(demoDays, state.maxDays)));
}

function stageFor(f: number): Stage {
  if (f < 0.25)          return 'fresh';
  if (f < 0.50)          return 'fading';
  if (f < 0.75)          return 'endangered';
  if (f < FOSSIL_THRESH) return 'ghost';
  return 'fossil';
}

function bpmFor(f: number): number {
  if (f >= FOSSIL_THRESH) return 0;
  if (f >= 0.75) return 22;
  if (f >= 0.50) return 38;
  if (f >= 0.25) return 55;
  return 72;
}

// ── DOM writers ───────────────────────────────────────────────────────────

function writeHeroVars(el: HTMLElement, f: number, bpm: number, stage: Stage): void {
  const period = bpm > 0 ? `${Math.round(60_000 / bpm)}ms` : '0ms';
  el.style.setProperty('--decay-progress',    f.toFixed(3));
  el.style.setProperty('--hero-pulse-period', period);
  el.style.setProperty('--stage-index',       String(STAGE_NAMES.indexOf(stage)));
  el.dataset.stage = stage;
  const counter = el.querySelector<HTMLElement>('.hero-day-counter');
  if (counter) counter.textContent = f >= FOSSIL_THRESH ? 'Day 100 — entombed' : `Day ${Math.round(f * 100)} / 100`;
}

function updateAriaLabel(el: HTMLElement, f: number, stage: Stage): void {
  const pct = Math.round(f * 100);
  const bar = el.querySelector<HTMLElement>('[role="progressbar"]');
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
  el.setAttribute('aria-label', `Demo post: ${stage}, ${pct}% decayed`);
}

// ── Keep handler ──────────────────────────────────────────────────────────

function triggerBloom(heroEl: HTMLElement): void {
  heroEl.classList.add('hero--blooming');
  heroEl.dispatchEvent(new CustomEvent('keep:success', { bubbles: true }));
  setTimeout(() => heroEl.classList.remove('hero--blooming'), 1400);
}

function resetCycle(state: DemoState): void {
  state.startMs = Date.now();
  state.fossilAt = 0;
}

function startHoldRing(btn: HTMLElement, onDone: () => void): () => void {
  const t0 = Date.now();
  const ringEl = btn.querySelector<HTMLElement>('.hero-hold-ring');
  const tick = () => {
    const progress = Math.min(1, (Date.now() - t0) / HOLD_MS);
    if (ringEl) ringEl.style.setProperty('--hold-progress', progress.toFixed(3));
    if (progress >= 1) { onDone(); return; }
    btn.dataset.holdRaf = String(requestAnimationFrame(tick));
  };
  btn.dataset.holdRaf = String(requestAnimationFrame(tick));
  return () => {
    const raf = btn.dataset.holdRaf;
    if (raf) cancelAnimationFrame(Number(raf));
    if (ringEl) ringEl.style.setProperty('--hold-progress', '0');
  };
}

function buildHoldHandlers(heroEl: HTMLElement, state: DemoState) {
  let stopRing: (() => void) | null = null;
  const cancel = () => { stopRing?.(); stopRing = null; };
  const fire   = () => { cancel(); resetCycle(state); triggerBloom(heroEl); };
  return {
    onDown:  () => { cancel(); stopRing = startHoldRing(heroEl, fire); },
    onUp:    cancel,
    onLeave: cancel,
  };
}

function wireKeepButton(heroEl: HTMLElement, state: DemoState): void {
  const btn = heroEl.querySelector<HTMLElement>('[data-demo-keep]');
  if (!btn) return;
  const h = buildHoldHandlers(heroEl, state);
  btn.addEventListener('pointerdown',  h.onDown,  { capture: true });
  btn.addEventListener('pointerup',    h.onUp,    { capture: true });
  btn.addEventListener('pointerleave', h.onLeave, { capture: true });
}

// ── RAF loop ──────────────────────────────────────────────────────────────

function flashStageCross(heroEl: HTMLElement): void {
  heroEl.classList.add('hero--threshold-cross');
  setTimeout(() => heroEl.classList.remove('hero--threshold-cross'), 400);
}

function scheduleFossilReset(state: DemoState): void {
  if (state.fossilAt) return;
  state.fossilAt = Date.now();
  setTimeout(() => resetCycle(state), FOSSIL_PAUSE);
}

function rafTick(
  heroEl: HTMLElement, state: DemoState,
  loop: { id: number | null }, prev: { stage: Stage },
): void {
  const f     = computeDecay(state);
  const stage = stageFor(f);
  if (stage !== prev.stage) { flashStageCross(heroEl); prev.stage = stage; }
  if (f >= FOSSIL_THRESH && !state.fossilAt) scheduleFossilReset(state);
  writeHeroVars(heroEl, f, bpmFor(f), stage);
  updateAriaLabel(heroEl, f, stage);
  loop.id = requestAnimationFrame(() => rafTick(heroEl, state, loop, prev));
}

function startLoop(heroEl: HTMLElement, state: DemoState): () => void {
  const loop: { id: number | null } = { id: null };
  const prev: { stage: Stage } = { stage: stageFor(computeDecay(state)) };
  const go   = () => { loop.id = requestAnimationFrame(() => rafTick(heroEl, state, loop, prev)); };
  const stop = () => { if (loop.id !== null) { cancelAnimationFrame(loop.id); loop.id = null; } };
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : go());
  window.addEventListener('pagehide', stop);
  go();
  return stop;
}

// ── Entry point ───────────────────────────────────────────────────────────

function buildDemoState(): DemoState {
  return { startMs: Date.now(), maxDays: DEMO_MAX_DAYS, fossilAt: 0 };
}

function runStaticSnapshot(heroEl: HTMLElement): void {
  const f  = 0.68; // static endangered snapshot for no-JS / reduced-motion
  const st = stageFor(f);
  writeHeroVars(heroEl, f, bpmFor(f), st);
  updateAriaLabel(heroEl, f, st);
}

/** Wire the living hero demo: decay crawl + hold-to-keep. Call once after DOM ready. */
export function initLandingHero(): void {
  const heroEl = document.getElementById('landing-hero');
  if (!heroEl) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    runStaticSnapshot(heroEl);
    return;
  }
  const state = buildDemoState();
  wireKeepButton(heroEl, state);
  startLoop(heroEl, state);
}

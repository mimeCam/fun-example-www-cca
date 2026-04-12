// src/lib/client/landing-hero.ts
// Living Landing Hero — RAF bridge between decay math and demo DOM.
// Runs a synthetic demo post with no API or DB calls.
// All functions ≤10 lines per Sid's rule. Credits: Mike Koch (arch §LandingHero), Tanya Donska (UX §4).

// ── Constants ──────────────────────────────────────────────────────────────

const DEMO_MAX_DAYS = 100;   // maxDays that yields ~68% at 45 days (logarithmic formula)
const DEMO_AGE_DAYS = 45;    // starting demo post age in days
const HOLD_MS       = 1200;  // hold-to-keep threshold in ms
const LOG_K         = 0.065; // logarithmic decay curvature (mirrors decay-engine.ts)
const FOSSIL_THRESH = 0.97;  // above this → fossil (no pulse)

const STAGE_NAMES = ['fresh', 'fading', 'endangered', 'ghost', 'fossil'] as const;
type Stage     = typeof STAGE_NAMES[number];
type DemoState = { createdAt: Date; maxDays: number };

// ── Pure math (mirrors decay-engine.ts logarithmicDecay — inlined to avoid server bundle) ──

function logDecay(t: number, max: number): number {
  return Math.log(1 + t * LOG_K) / Math.log(1 + max * LOG_K);
}

function computeDecay(createdAt: Date, maxDays: number): number {
  const days = (Date.now() - createdAt.getTime()) / 86_400_000;
  return Math.min(1, Math.max(0, logDecay(days, maxDays)));
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

function buildHoldHandlers(heroEl: HTMLElement, state: DemoState) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const fire   = () => { state.createdAt = new Date(); triggerBloom(heroEl); timer = null; };
  return {
    onDown:  () => { cancel(); timer = setTimeout(fire, HOLD_MS); },
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

function rafTick(heroEl: HTMLElement, state: DemoState, loop: { id: number | null }): void {
  const f     = computeDecay(state.createdAt, state.maxDays);
  const stage = stageFor(f);
  writeHeroVars(heroEl, f, bpmFor(f), stage);
  updateAriaLabel(heroEl, f, stage);
  loop.id = requestAnimationFrame(() => rafTick(heroEl, state, loop));
}

function startLoop(heroEl: HTMLElement, state: DemoState): () => void {
  const loop: { id: number | null } = { id: null };
  const go   = () => { loop.id = requestAnimationFrame(() => rafTick(heroEl, state, loop)); };
  const stop = () => { if (loop.id !== null) { cancelAnimationFrame(loop.id); loop.id = null; } };
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : go());
  window.addEventListener('pagehide', stop);
  go();
  return stop;
}

// ── Entry point ───────────────────────────────────────────────────────────

function buildDemoState(): DemoState {
  const offset = Math.round(DEMO_AGE_DAYS * 86_400_000);
  return { createdAt: new Date(Date.now() - offset), maxDays: DEMO_MAX_DAYS };
}

function runStaticSnapshot(heroEl: HTMLElement): void {
  const f  = parseFloat(heroEl.dataset.decayProgress ?? '0.68');
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

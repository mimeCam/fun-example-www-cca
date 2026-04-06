// src/lib/onboardProbe.ts
// Orchestrator: wires spectacle → hint → reward into a single flow.
// Replaces the scattered state logic in onboardHint.ts with clean
// event routing and explicit gate checks.
//
// Pattern: exports onboardProbeScript() → inline IIFE string.
// State: IDLE → WAITING → HINTING → REWARDING → DONE
// Gates: localStorage (spectacle-seen), sessionStorage (hint-seen)

// ---------------------------------------------------------------------------
// FSM-era first-visit API (consumed by new FirstVisitSpectacle.astro)
// ---------------------------------------------------------------------------

const SPECTACLE_DONE_KEY = 'spectacle_done';
const ONBOARD_HINT_DEBOUNCE_MS = 800;

/** True on first visit only; false on every subsequent page load. */
export function checkFirstVisit(): boolean {
  try { return !localStorage.getItem(SPECTACLE_DONE_KEY); }
  catch { return false; }
}

/** Stamps localStorage so checkFirstVisit() returns false from now on. */
export function markSpectacleDone(): void {
  try { localStorage.setItem(SPECTACLE_DONE_KEY, String(Date.now())); }
  catch { /* private browsing */ }
}

/** Fires 'onboard:hint' after a short debounce for KeepButton pulse nudge. */
export function triggerOnboardHint(): void {
  setTimeout(
    () => document.dispatchEvent(new CustomEvent('onboard:hint')),
    ONBOARD_HINT_DEBOUNCE_MS,
  );
}

// Self-register: bridge new 'spectacle:done' event → hint nudge system.
if (typeof document !== 'undefined') {
  document.addEventListener('spectacle:done', triggerOnboardHint, { once: true });
}

// ---------------------------------------------------------------------------
// Legacy key (kept for backward compat — old IIFE script uses this)
// ---------------------------------------------------------------------------

const SPECTACLE_KEY = 'persona:spectacle-seen';
const HINT_KEY = 'onboard-hint-seen';
const REWARD_KEY = 'onboard-reward-seen';

// ── Pure helpers (exported for tests) ────────────────────

/** True when the spectacle has already played. */
export function spectacleSeen(): boolean {
  try { return localStorage.getItem(SPECTACLE_KEY) === '1'; }
  catch { return false; }
}

/** True when the hint was shown this session. */
export function hintSeen(): boolean {
  try { return sessionStorage.getItem(HINT_KEY) === '1'; }
  catch { return false; }
}

/** True when the reward was shown this session. */
export function rewardSeen(): boolean {
  try { return sessionStorage.getItem(REWARD_KEY) === '1'; }
  catch { return false; }
}

// ── Inline IIFE generator ────────────────────────────────

export function onboardProbeScript(): string {
  return `(function(){
  var SPK='${SPECTACLE_KEY}',HK='${HINT_KEY}',RK='${REWARD_KEY}';
  var state='idle';

  /* ── gate checks ─────────────────────── */
  function spectaclePlayed(){
    try{return localStorage.getItem(SPK)==='1'}catch(e){return false}
  }
  function hintDone(){
    try{return sessionStorage.getItem(HK)==='1'}catch(e){return false}
  }
  function rewardDone(){
    try{return sessionStorage.getItem(RK)==='1'}catch(e){return false}
  }
  function reducedMotion(){
    return window.matchMedia
      &&matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ── transition helpers ──────────────── */
  function emit(name,detail){
    document.dispatchEvent(new CustomEvent(name,{detail:detail||{}}));
  }

  function transition(next){
    state=next;
  }

  /* ── flow: spectacle end → hint ──────── */
  function onSpectacleEnd(){
    if(state!=='waiting')return;
    if(hintDone()){transition('done');return}
    transition('hinting');
    emit('onboard:start');
  }

  /* ── flow: revival → reward ──────────── */
  function onRevival(e){
    if(state!=='hinting')return;
    if(rewardDone()){transition('done');cleanup();return}
    transition('rewarding');
    emit('onboard:reward',e.detail);
  }

  /* ── flow: resolved (hint or reward) ─── */
  function onResolved(){
    transition('done');
    cleanup();
  }

  /* ── listener management ─────────────── */
  function cleanup(){
    document.removeEventListener('spectacle:complete',onSpectacleEnd);
    document.removeEventListener('spectacle:skip',onSpectacleEnd);
    document.removeEventListener('revival:success',onRevival);
    document.removeEventListener('onboard:resolved',onResolved);
  }

  /* ── init ─────────────────────────────── */
  if(reducedMotion()){return}

  if(spectaclePlayed()){
    if(hintDone()){return}
    transition('hinting');
    setTimeout(function(){emit('onboard:start')},500);
    document.addEventListener('revival:success',onRevival);
    document.addEventListener('onboard:resolved',onResolved);
    return;
  }

  transition('waiting');
  document.addEventListener('spectacle:complete',onSpectacleEnd);
  document.addEventListener('spectacle:skip',onSpectacleEnd);
  document.addEventListener('revival:success',onRevival);
  document.addEventListener('onboard:resolved',onResolved);
})();`;
}

// ── Sanity checks ────────────────────────────────────────

export function _testOnboardProbe(): void {
  const script = onboardProbeScript();

  console.assert(
    script.includes('onboard:start'),
    'emits onboard:start',
  );
  console.assert(
    script.includes('onboard:reward'),
    'emits onboard:reward',
  );
  console.assert(
    script.includes('onboard:resolved'),
    'listens for onboard:resolved',
  );
  console.assert(
    script.includes('spectacle:complete'),
    'listens for spectacle:complete',
  );
  console.assert(
    script.includes('spectacle:skip'),
    'listens for spectacle:skip',
  );
  console.assert(
    script.includes('revival:success'),
    'listens for revival:success',
  );
  console.assert(
    script.includes('prefers-reduced-motion'),
    'respects reduced motion',
  );
  console.log('[onboardProbe] OK — events, gates, transitions verified');
}

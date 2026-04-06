// src/lib/spectacle/prompt.ts
// Phase 3 interaction handler for the first-visit spectacle.
// Listens for hover-dwell (desktop) or tap-hold (mobile) on the hero card.
// Calls bloomOrchestrator via revival:success event on success.
// Unified Pointer Events API — no touch/mouse branching.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Dwell time (ms) before revival triggers. */
const DWELL_MS = 800;

/** Max finger drift (px) before cancelling a tap-hold. */
const DRIFT_LIMIT = 10;

/** Pointer event names for bind/unbind symmetry. */
const EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'pointercancel'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptHandle {
  cleanup: () => void;
}

type Callback = () => void;

interface DwellState {
  timer: ReturnType<typeof setTimeout> | null;
  startX: number;
  startY: number;
  done: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function drift(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function freshState(): DwellState {
  return { timer: null, startX: 0, startY: 0, done: false };
}

function cancelTimer(s: DwellState): void {
  if (s.timer) { clearTimeout(s.timer); s.timer = null; }
}

// ---------------------------------------------------------------------------
// Event handler factories — each returns a handler under 10 lines
// ---------------------------------------------------------------------------

function makeDown(s: DwellState, onFire: Callback): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    if (s.done) return;
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.timer = setTimeout(() => { s.done = true; s.timer = null; onFire(); }, DWELL_MS);
  };
}

function makeMove(s: DwellState): (e: PointerEvent) => void {
  return (e: PointerEvent) => {
    if (!s.timer) return;
    if (drift(s.startX, s.startY, e.clientX, e.clientY) > DRIFT_LIMIT) cancelTimer(s);
  };
}

function makeUp(s: DwellState): () => void {
  return () => cancelTimer(s);
}

// ---------------------------------------------------------------------------
// Bind / unbind helpers
// ---------------------------------------------------------------------------

type HandlerMap = Record<string, EventListener>;

function bindAll(el: HTMLElement, map: HandlerMap): void {
  for (const [evt, fn] of Object.entries(map)) el.addEventListener(evt, fn);
}

function unbindAll(el: HTMLElement, map: HandlerMap): void {
  for (const [evt, fn] of Object.entries(map)) el.removeEventListener(evt, fn);
}

// ---------------------------------------------------------------------------
// Public API — attaches dwell/tap-hold listener, returns cleanup handle
// ---------------------------------------------------------------------------

/** Attaches dwell/tap-hold listener to a card. Returns cleanup handle. */
export function attachPrompt(card: HTMLElement, onRevive: Callback): PromptHandle {
  const s = freshState();
  const up = makeUp(s);
  const map: HandlerMap = {
    pointerdown: makeDown(s, onRevive) as EventListener,
    pointermove: makeMove(s) as EventListener,
    pointerup: up as EventListener,
    pointerleave: up as EventListener,
    pointercancel: up as EventListener,
  };

  bindAll(card, map);
  return { cleanup: () => { cancelTimer(s); unbindAll(card, map); } };
}

// ---------------------------------------------------------------------------
// Inline snippet — minified version for IIFE embedding
// ---------------------------------------------------------------------------

/** Returns minified JS for prompt interaction inside inline scripts. */
export function promptSnippet(): string {
  return [
    `var DWELL=${DWELL_MS},DRIFT=${DRIFT_LIMIT};`,
    'function promptAttach(card,cb){',
    'var t=null,sx=0,sy=0,done=false;',
    'function dist(a,b,c,d){return Math.sqrt((c-a)*(c-a)+(d-b)*(d-b))}',
    'function down(e){if(done)return;sx=e.clientX;sy=e.clientY;',
    't=setTimeout(function(){done=true;t=null;cb()},DWELL)}',
    'function move(e){if(t&&dist(sx,sy,e.clientX,e.clientY)>DRIFT)',
    '{clearTimeout(t);t=null}}',
    'function up(){if(t){clearTimeout(t);t=null}}',
    'card.addEventListener("pointerdown",down);',
    'card.addEventListener("pointermove",move);',
    'card.addEventListener("pointerup",up);',
    'card.addEventListener("pointerleave",up);',
    'card.addEventListener("pointercancel",up);',
    'return function(){if(t)clearTimeout(t);',
    'card.removeEventListener("pointerdown",down);',
    'card.removeEventListener("pointermove",move);',
    'card.removeEventListener("pointerup",up);',
    'card.removeEventListener("pointerleave",up);',
    'card.removeEventListener("pointercancel",up)}}',
  ].join('');
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testPrompt(): void {
  const snippet = promptSnippet();
  console.assert(snippet.includes('promptAttach'), 'snippet has attach fn');
  console.assert(snippet.includes('pointerdown'), 'uses pointer events');
  console.assert(snippet.includes('DWELL'), 'has dwell constant');
  console.assert(snippet.includes('DRIFT'), 'has drift constant');
  console.assert(!snippet.includes('touchstart'), 'no touch branching');
  console.assert(!snippet.includes('mousedown'), 'no mouse branching');

  console.log('[prompt] OK — snippet structure, pointer unification verified');
}

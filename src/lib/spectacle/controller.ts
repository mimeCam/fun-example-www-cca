// src/lib/spectacle/controller.ts
// Pure finite state machine for the First-Visit Spectacle.
// Zero DOM imports — orchestrates timing and fires callbacks only.
//
// IMPORTANT: Call destroy() if component unmounts before DONE to prevent
// timer leaks on SPA navigation.
//
// Phase sequence: idle → bloom → decay → resist → handoff → done
// CSS drives all visuals via [data-phase="<phase>"] attribute selectors.

export type SpectaclePhase = 'idle' | 'bloom' | 'decay' | 'resist' | 'handoff' | 'done';

export interface SpectacleConfig {
  /** Duration (ms) to stay in each phase before advancing. */
  durations: Record<SpectaclePhase, number>;
  /** Called each time the phase changes (including 'done'). */
  onPhase: (phase: SpectaclePhase) => void;
  /** Called once when DONE is reached, after onPhase('done'). */
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// Defaults — single source of truth for animation timing
// ---------------------------------------------------------------------------

/** Default phase durations in ms. Import in component to avoid magic numbers. */
export const DEFAULT_DURATIONS: Record<SpectaclePhase, number> = {
  idle:    0,
  bloom:   200,
  decay:   600,
  resist:  400,
  handoff: 400,
  done:    0,
};

// ---------------------------------------------------------------------------
// Phase sequence helpers — pure, no side effects
// ---------------------------------------------------------------------------

const SEQUENCE: SpectaclePhase[] = ['idle', 'bloom', 'decay', 'resist', 'handoff', 'done'];

function sequenceIndex(phase: SpectaclePhase): number {
  return SEQUENCE.indexOf(phase);
}

function nextPhase(current: SpectaclePhase): SpectaclePhase {
  const idx = sequenceIndex(current);
  return idx < SEQUENCE.length - 1 ? SEQUENCE[idx + 1] : 'done';
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// SpectacleController — finite state machine
// ---------------------------------------------------------------------------

class SpectacleController {
  private phase: SpectaclePhase = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly reduced: boolean;

  constructor(private readonly cfg: SpectacleConfig) {
    this.reduced = prefersReducedMotion();
  }

  /** Kick off BLOOM → chain. No-op if already started. */
  start(): void {
    if (this.phase !== 'idle') return;
    if (this.reduced) { this.finish(); return; }
    this.advance();
  }

  /** Fast-forward to DONE, cleaning up pending timers. */
  skip(): void {
    this.clearTimer();
    this.finish();
  }

  /** Release timer references. Must be called on unmount before DONE. */
  destroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private emit(phase: SpectaclePhase): void {
    this.phase = phase;
    this.cfg.onPhase(phase);
  }

  private finish(): void {
    this.emit('done');
    this.cfg.onDone();
  }

  private advance(): void {
    const next = nextPhase(this.phase);
    this.emit(next);
    if (next === 'done') { this.cfg.onDone(); return; }
    const stay = this.cfg.durations[next] ?? 0;
    this.timer = setTimeout(() => this.advance(), stay);
  }
}

// ---------------------------------------------------------------------------
// Public factory — preferred over `new` for testability
// ---------------------------------------------------------------------------

/** Creates and returns a SpectacleController. Does NOT start it. */
export function createSpectacleController(cfg: SpectacleConfig): SpectacleController {
  return new SpectacleController(cfg);
}

// ---------------------------------------------------------------------------
// Sanity checks (run once in dev to catch regressions)
// ---------------------------------------------------------------------------

export function _testController(): void {
  const phases: SpectaclePhase[] = [];

  const ctrl = createSpectacleController({
    durations: { idle: 0, bloom: 0, decay: 0, resist: 0, handoff: 0, done: 0 },
    onPhase: (p) => phases.push(p),
    onDone: () => {},
  });

  ctrl.start();
  console.assert(
    JSON.stringify(phases) === JSON.stringify(['bloom','decay','resist','handoff','done']),
    `phase sequence wrong: ${phases.join(',')}`,
  );

  const phases2: SpectaclePhase[] = [];
  const ctrl2 = createSpectacleController({
    durations: { idle: 0, bloom: 100, decay: 100, resist: 100, handoff: 100, done: 0 },
    onPhase: (p) => phases2.push(p),
    onDone: () => {},
  });
  ctrl2.start();
  ctrl2.skip();
  const last = phases2[phases2.length - 1];
  console.assert(last === 'done', `skip should land on done, got: ${last}`);

  const dup = DEFAULT_DURATIONS;
  console.assert(dup.bloom === 200, 'bloom default 200ms');
  console.assert(dup.decay === 600, 'decay default 600ms');
  console.assert(dup.resist === 400, 'resist default 400ms');
  console.assert(dup.handoff === 400, 'handoff default 400ms');

  console.log('[controller] OK — sequence, skip, defaults verified');
}

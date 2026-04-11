// src/lib/client/revival-ceremony.ts
// Hold-to-Revive Ceremony v2 — state machine + spring physics for KeepButton.
//
// State machine spine:
//   IDLE → PRESSING → TENSION → PEAK → BLOOM → SETTLED → IDLE
//   Any PRESSING/TENSION → IDLE on pointer cancel/leave
//
// Spring formula (per rAF frame ~16ms):
//   velocity += (-stiffness * (position - target) - damping * velocity) * dt
//   position += velocity * dt
//
// The SVG arc strokeDashoffset is set directly in JS; --arc-progress is also
// written so CSS state selectors have a reactive number to work with.
//
// Credits: Michael Koch (arch spec §2 revival-ceremony), DevBrain (spring tuning)

import { haptic, PRESS_START, TENSION_RAMP, PEAK_CONFIRM, CANCEL } from './haptics';
import { triggerCascadeBloom } from './cascade-bloom';

// ── Types ────────────────────────────────────────────────────────────────────

type CeremonyState = 'idle' | 'pressing' | 'tension' | 'peak' | 'bloom' | 'settled';

interface SpringState { pos: number; vel: number; }

interface ReviveResponse {
  ok: boolean;
  count: number;
  revivalCount?: number;
  relatedSlugs?: string[];
  battingAverageDelta?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STIFFNESS        = 180;   // tuned to SPRING motion profile (800ms settle)
const DAMPING          = 12;
const TENSION_THRESHOLD = 0.70; // arc ≥ 70% → TENSION state
const PEAK_THRESHOLD   = 0.999; // arc ≥ 99.9% → PEAK
const CEREMONY_MS      = 1200;  // --duration-bloom
const COOLDOWN_MS      = 5000;  // client-side UX cooldown after revival
const ARC_CIRCUMFERENCE = 125.664; // 2π × r=20; matches SVG in KeepButton.astro

// ── Pure spring step — heart of the tactile feel ────────────────────────────

/** One rAF-frame step of a spring. Pure function, no side effects. */
function springStep(s: SpringState, target: number, dt: number): SpringState {
  const vel = s.vel + (-STIFFNESS * (s.pos - target) - DAMPING * s.vel) * dt;
  return { pos: s.pos + vel * dt, vel };
}

// ── CeremonyController ───────────────────────────────────────────────────────

export class CeremonyController {
  private state: CeremonyState = 'idle';
  private spring: SpringState  = { pos: 0, vel: 0 };
  private rafId                = 0;
  private lastTs               = 0;
  private lastRevivalAt        = 0;
  private readonly slug:       string;
  private readonly el:         HTMLElement;
  private readonly arcCircle:  SVGCircleElement | null;
  private readonly countEl:    HTMLElement | null;

  constructor(el: HTMLElement) {
    this.el        = el;
    this.slug      = el.dataset.keepSlug ?? '';
    this.arcCircle = el.querySelector<SVGCircleElement>('.keep-arc-circle');
    this.countEl   = el.querySelector<HTMLElement>('.keep-count');
    this.bindEvents();
  }

  // ── State ──────────────────────────────────────────────────────────────────

  private setState(next: CeremonyState): void {
    this.state          = next;
    this.el.dataset.state = next;
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  private bindEvents(): void {
    this.el.addEventListener('pointerdown',   () => this.onPress());
    this.el.addEventListener('pointerup',     () => this.onRelease());
    this.el.addEventListener('pointerleave',  () => this.onCancel());
    this.el.addEventListener('pointercancel', () => this.onCancel());
  }

  // ── Pointer handlers ───────────────────────────────────────────────────────

  private onPress(): void {
    if (this.state !== 'idle') return;
    if (Date.now() - this.lastRevivalAt < COOLDOWN_MS) return;
    this.setState('pressing');
    haptic(PRESS_START);
    this.spring = { pos: 0, vel: 0 };
    this.startLoop();
  }

  private onRelease(): void {
    if (['peak', 'bloom', 'settled'].includes(this.state)) return;
    this.resetToIdle();
  }

  private onCancel(): void {
    if (['peak', 'bloom', 'settled'].includes(this.state)) return;
    haptic(CANCEL);
    this.resetToIdle();
  }

  // ── State helpers ──────────────────────────────────────────────────────────

  private resetToIdle(): void {
    cancelAnimationFrame(this.rafId);
    this.spring = { pos: 0, vel: 0 };
    this.setArc(0);
    this.setState('idle');
  }

  // ── rAF spring loop ────────────────────────────────────────────────────────

  private startLoop(): void {
    this.lastTs = performance.now();
    this.rafId  = requestAnimationFrame(ts => this.loop(ts));
  }

  private loop(ts: number): void {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05); // cap dt at 50ms
    this.lastTs  = ts;
    this.spring  = springStep(this.spring, 1, dt);
    const progress = Math.min(this.spring.pos, 1);
    this.setArc(progress);
    this.checkTransitions(progress);
    if (this.state === 'pressing' || this.state === 'tension')
      this.rafId = requestAnimationFrame(ts2 => this.loop(ts2));
  }

  // ── State transition checks ────────────────────────────────────────────────

  private checkTransitions(p: number): void {
    if (this.state === 'pressing' && p >= TENSION_THRESHOLD) {
      this.setState('tension');
      haptic(TENSION_RAMP);
    }
    if ((this.state === 'tension' || this.state === 'pressing') && p >= PEAK_THRESHOLD) {
      this.onPeak();
    }
  }

  // ── PEAK: arc complete, fire API ───────────────────────────────────────────

  private onPeak(): void {
    cancelAnimationFrame(this.rafId);
    this.setState('peak');
    haptic(PEAK_CONFIRM);
    this.setArc(1);
    this.postRevive();
  }

  // ── API call ───────────────────────────────────────────────────────────────

  private async fetchRevive(): Promise<ReviveResponse | null> {
    const sid     = this.getSessionId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sid) headers['x-session-id'] = sid;
    const res = await fetch('/api/revive', {
      method: 'POST', keepalive: true, headers,
      body: JSON.stringify({ slug: this.slug }),
    });
    if (res.status === 429) return null;
    return res.ok ? (res.json() as Promise<ReviveResponse>) : null;
  }

  private async postRevive(): Promise<void> {
    try {
      const data = await this.fetchRevive();
      if (!data?.ok) { this.resetToIdle(); return; }
      this.onBloom(data);
    } catch { this.resetToIdle(); }
  }

  // ── BLOOM: API success → visual ceremony ──────────────────────────────────

  private onBloom(data: ReviveResponse): void {
    this.setState('bloom');
    const count = data.revivalCount ?? data.count;
    if (this.countEl && count > 0) this.countEl.textContent = ` · ${count}`;
    else if (this.countEl) this.countEl.classList.add('keep-count--hidden');
    triggerCascadeBloom(this.slug, data.relatedSlugs ?? []);
    setTimeout(() => this.onSettled(), CEREMONY_MS);
  }

  // ── SETTLED: cooldown before returning to IDLE ─────────────────────────────

  private onSettled(): void {
    this.setState('settled');
    this.lastRevivalAt = Date.now();
    this.setArc(0);
    setTimeout(() => this.setState('idle'), COOLDOWN_MS);
  }

  // ── Arc rendering (JS drives, CSS renders) ────────────────────────────────

  private setArc(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    if (this.arcCircle)
      this.arcCircle.style.strokeDashoffset = String(ARC_CIRCUMFERENCE * (1 - clamped));
    this.el.style.setProperty('--arc-progress', String(clamped));
  }

  // ── Session helper ─────────────────────────────────────────────────────────

  private getSessionId(): string | null {
    try { return sessionStorage.getItem('session-token'); }
    catch { return null; }
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Wire CeremonyController to every un-wired KeepButton that is not part of
 * the pact ritual (.revival-footer, data-pact-trigger) — those are owned
 * by keep-pact.ts and revival-counter.ts respectively.
 */
export function initCeremonies(): void {
  const sel = '.keep-btn[data-keep-slug]:not([data-wired]):not([data-pact-trigger])';
  document.querySelectorAll<HTMLElement>(sel).forEach(el => {
    if (el.closest('.revival-footer')) return; // revival-counter.ts owns these
    new CeremonyController(el);
    el.dataset.wired = 'ceremony';
  });
}

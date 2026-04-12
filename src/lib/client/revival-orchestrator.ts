// src/lib/client/revival-orchestrator.ts
// Revival Orchestrator — single source of truth for the hold-to-revive lifecycle.
//
// State machine:
//   idle → holding → threshold_reached → submitting → revived | error
//   Any non-locked state → idle on cancel / page blur / early release
//
// Communication bus: CSS custom properties written to buttonEl.
//   --keep-progress  (0–1) drives arc fill, color-mix heat, border-radius
//   --keep-heat      (0–1) alias for color temperature
//   data-keep-state  attribute drives CSS state selectors
//
// Haptics: pulse at 25 / 50 / 75 / 100% arc progress.
// API:     POST /api/revive with AbortController. Dispatches revival:confirmed on success.
//
// Credits: Mike Koch (arch spec §1–§3), Tanya §4.3 choreography, DevBrain spring guide.

import { haptic, PRESS_START, TENSION_RAMP, PEAK_CONFIRM, CANCEL, HOLD_25, HOLD_50, HOLD_75 } from './haptics';
import { triggerCascadeBloom } from './cascade-bloom';

// ── Types ──────────────────────────────────────────────────────────────────────

export type RevivalState =
  | 'idle' | 'holding' | 'threshold_reached'
  | 'submitting' | 'revived' | 'error';

interface Spring { pos: number; vel: number; }

interface RevivePayload {
  ok:              boolean;
  revivalCount?:   number;
  count?:          number;
  relatedSlugs?:   string[];
  decayPct?:       number;
  monthlyCount?:   number;
  survivorRank?:   number;
  reason?:         string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STIFFNESS         = 200;     // spring stiffness (arc reaches full ~800ms)
const DAMPING           = 14;      // critical damping — no overshoots mid-hold
const THRESHOLD         = 0.999;   // arc ≥ 99.9% → submit
const COOLDOWN_MS       = 5_000;   // client UX cooldown after revival
const ARC_CIRCUMFERENCE = 125.664; // 2π × r=20 matches SVG in KeepButton.astro
const BLOOM_DURATION_MS = 1200;    // matches --duration-bloom in motion.css

// ── Pure spring step ───────────────────────────────────────────────────────────

/** One rAF frame of a spring toward target=1. Pure, no side effects. */
function springStep(s: Spring, dt: number): Spring {
  const vel = s.vel + (-STIFFNESS * (s.pos - 1) - DAMPING * s.vel) * dt;
  return { pos: s.pos + vel * dt, vel };
}

// ── Session helper ─────────────────────────────────────────────────────────────

function sessionId(): string | null {
  try { return sessionStorage.getItem('session-token'); } catch { return null; }
}

// ── RevivalOrchestrator ────────────────────────────────────────────────────────

export class RevivalOrchestrator {
  private state: RevivalState   = 'idle';
  private spring: Spring        = { pos: 0, vel: 0 };
  private rafId                 = 0;
  private lastTs                = 0;
  private lastReviveAt          = 0;
  private hapticFired           = new Set<number>();
  private abort: AbortController | null = null;
  private readonly rm: boolean; // prefers-reduced-motion

  constructor(
    private readonly slug: string,
    private readonly el: HTMLElement,
  ) {
    this.rm = typeof window !== 'undefined' &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.wirePointer(el);
    this.wireKeyboard(el);
    this.wireGlobal();
    if (this.rm) el.addEventListener('click', () => this.onThreshold());
  }

  // ── DOM state bus ──────────────────────────────────────────────────────────

  private setState(next: RevivalState): void {
    this.state = next;
    this.el.dataset.keepState = next;
    this.el.setAttribute('aria-pressed', String(next === 'revived'));
    const label = next === 'revived' ? 'Post kept alive'
                : next === 'holding' ? 'Holding…'
                : 'Keep this post alive';
    this.el.setAttribute('aria-label', label);
  }

  private setProgress(p: number): void {
    const c = Math.max(0, Math.min(1, p));
    this.el.style.setProperty('--keep-progress', String(c));
    this.el.style.setProperty('--keep-heat', String(c));
    const arc = this.el.querySelector<SVGCircleElement>('.keep-arc-circle');
    if (arc) arc.style.strokeDashoffset = String(ARC_CIRCUMFERENCE * (1 - c));
    this.fireHapticAt(c);
  }

  // ── Haptic milestones ──────────────────────────────────────────────────────

  private fireHapticAt(p: number): void {
    if (this.rm) return;
    if (p >= 0.25 && !this.hapticFired.has(25)) { this.hapticFired.add(25); haptic(HOLD_25); }
    if (p >= 0.50 && !this.hapticFired.has(50)) { this.hapticFired.add(50); haptic(HOLD_50); }
    if (p >= 0.75 && !this.hapticFired.has(75)) { this.hapticFired.add(75); haptic(HOLD_75); }
    if (p >= 1.00 && !this.hapticFired.has(100)) { this.hapticFired.add(100); haptic(PEAK_CONFIRM); }
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  private wirePointer(el: HTMLElement): void {
    el.addEventListener('pointerdown',   () => this.onPress());
    el.addEventListener('pointerup',     () => this.onRelease());
    el.addEventListener('pointerleave',  () => this.onCancel());
    el.addEventListener('pointercancel', () => this.onCancel());
  }

  private wireKeyboard(el: HTMLElement): void {
    const isAction = (e: Event) => {
      const k = (e as KeyboardEvent).key;
      return k === ' ' || k === 'Enter';
    };
    el.addEventListener('keydown', e => { if (isAction(e)) { e.preventDefault(); this.onPress(); } });
    el.addEventListener('keyup',   e => { if (isAction(e)) this.onRelease(); });
  }

  private wireGlobal(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onCancel();
    });
  }

  // ── Pointer / keyboard handlers ────────────────────────────────────────────

  private onPress(): void {
    if (this.state !== 'idle') return;
    if (Date.now() - this.lastReviveAt < COOLDOWN_MS) return;
    this.spring = { pos: 0, vel: 0 };
    this.hapticFired.clear();
    this.setState('holding');
    haptic(PRESS_START);
    if (!this.rm) this.startLoop();
  }

  private onRelease(): void {
    const locked: RevivalState[] = ['threshold_reached', 'submitting', 'revived'];
    if (locked.includes(this.state)) return;
    haptic(CANCEL);
    this.resetToIdle();
  }

  private onCancel(): void {
    const locked: RevivalState[] = ['submitting', 'revived'];
    if (locked.includes(this.state)) return;
    haptic(CANCEL);
    this.resetToIdle();
  }

  // ── rAF spring loop ────────────────────────────────────────────────────────

  private startLoop(): void {
    this.lastTs = performance.now();
    this.rafId  = requestAnimationFrame(ts => this.loop(ts));
  }

  private loop(ts: number): void {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05); // cap at 50ms
    this.lastTs  = ts;
    this.spring  = springStep(this.spring, dt);
    const p = Math.min(this.spring.pos, 1);
    this.setProgress(p);
    if (p >= THRESHOLD) { this.onThreshold(); return; }
    if (this.state === 'holding') this.rafId = requestAnimationFrame(ts2 => this.loop(ts2));
  }

  // ── Threshold → API ────────────────────────────────────────────────────────

  private onThreshold(): void {
    cancelAnimationFrame(this.rafId);
    this.setState('threshold_reached');
    this.setProgress(1);
    this.doSubmit();
  }

  private async doSubmit(): Promise<void> {
    this.setState('submitting');
    this.abort = new AbortController();
    try {
      const data = await this.fetchRevive();
      if (data?.ok) this.onRevived(data);
      else this.onError();
    } catch { this.onError(); }
  }

  // ── API ────────────────────────────────────────────────────────────────────

  private async fetchRevive(): Promise<RevivePayload | null> {
    const sid = sessionId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sid) headers['x-session-id'] = sid;
    const res = await fetch('/api/revive', {
      method: 'POST', keepalive: true, headers,
      signal: this.abort?.signal,
      body: JSON.stringify({ slug: this.slug }),
    });
    return res.ok ? (res.json() as Promise<RevivePayload>) : null;
  }

  // ── Revival success ────────────────────────────────────────────────────────

  private onRevived(data: RevivePayload): void {
    this.setState('revived');
    this.lastReviveAt = Date.now();
    const detail = { ...data, count: data.revivalCount ?? data.count ?? 0 };
    document.dispatchEvent(new CustomEvent('revival:confirmed', { detail }));
    this.el.dispatchEvent(new CustomEvent('revival:confirmed', { detail, bubbles: true }));
    triggerCascadeBloom(this.slug, data.relatedSlugs ?? []);
    this.addBlooming();
    setTimeout(() => { this.setState('idle'); this.setProgress(0); }, COOLDOWN_MS);
  }

  /** Add .blooming to the parent .decay-card for the bloom animation duration. */
  private addBlooming(): void {
    if (this.rm) return;
    const card = this.el.closest<HTMLElement>('.decay-card');
    if (!card) return;
    card.classList.add('blooming');
    setTimeout(() => card.classList.remove('blooming'), BLOOM_DURATION_MS);
  }

  private onError(): void {
    this.setState('error');
    setTimeout(() => this.resetToIdle(), 1500);
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  private resetToIdle(): void {
    cancelAnimationFrame(this.rafId);
    this.abort?.abort();
    this.abort  = null;
    this.spring = { pos: 0, vel: 0 };
    this.setProgress(0);
    this.setState('idle');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Create and wire an orchestrator for a single KeepButton element. */
export function createRevivalOrchestrator(slug: string, el: HTMLElement): RevivalOrchestrator {
  return new RevivalOrchestrator(slug, el);
}

/**
 * Auto-wire every unwired KeepButton in the DOM.
 * Call once on DOMContentLoaded; safe to call again for dynamically-added cards.
 */
export function initOrchestrators(): void {
  const sel = '.keep-btn[data-keep-slug]:not([data-orchestrated])';
  document.querySelectorAll<HTMLElement>(sel).forEach(el => {
    if (el.closest('.revival-footer')) return;  // revival-counter.ts owns these
    if (el.dataset.pactTrigger !== undefined) return; // keep-pact.ts owns these
    createRevivalOrchestrator(el.dataset.keepSlug ?? '', el);
    el.dataset.orchestrated = 'true';
  });
}

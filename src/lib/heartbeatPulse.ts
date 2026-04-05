// src/lib/heartbeatPulse.ts
// Client script for the HeartbeatPulse ambient presence indicator.
// Animates a warm ember near the MoodDot based on SSE event frequency.
// Three warmth levels: cold (no activity), warm (recent events), glowing (active).
// Respects prefers-reduced-motion. Degrades gracefully when alone.

const WARM_THRESHOLD = 1;
const GLOW_THRESHOLD = 3;
const DECAY_INTERVAL_MS = 15_000;
const BREATH_INTERVAL_MS = 45_000;

/** Returns an inline IIFE script string for BaseLayout injection. */
export function heartbeatPulseScript(): string {
  return `(${pulseIIFE.toString()})();`;
}

/** The pulse indicator logic, serialized as an IIFE. */
function pulseIIFE(): void {
  const el = document.getElementById('heartbeat-presence');
  if (!el) return;

  const reduced = matchesReducedMotion();
  const counter = el.querySelector('.hb-count');
  let eventCount = 0;
  let sessionCount = 0;
  let decayTimer: number | null = null;
  let breathTimer: number | null = null;

  listenForRevivals();
  startDecay();
  startBreathing();

  /** Listen for SSE revival events to update warmth. */
  function listenForRevivals(): void {
    document.addEventListener('heartbeat:revival', onRevival as EventListener);
  }

  /** Handle incoming revival event. */
  function onRevival(): void {
    eventCount++;
    sessionCount++;
    updateWarmth();
    updateCounter();
    resetDecay();
    stopBreathing();
  }

  /** Map event count to warmth class. */
  function updateWarmth(): void {
    el!.classList.remove('hb-cold', 'hb-warm', 'hb-glowing');
    if (eventCount >= GLOW_THRESHOLD) {
      el!.classList.add('hb-glowing');
    } else if (eventCount >= WARM_THRESHOLD) {
      el!.classList.add('hb-warm');
    } else {
      el!.classList.add('hb-cold');
    }
  }

  /** Update the visible heartbeat counter badge. */
  function updateCounter(): void {
    if (!counter) return;
    counter.textContent = String(sessionCount);
    counter.removeAttribute('hidden');
  }

  /** Decay warmth over time if no new events arrive. */
  function startDecay(): void {
    decayTimer = window.setInterval(decayTick, 15000);
  }

  /** Reduce event count, re-evaluate warmth. */
  function decayTick(): void {
    if (eventCount <= 0) return;
    eventCount = Math.max(0, eventCount - 1);
    updateWarmth();
    if (eventCount === 0) startBreathing();
  }

  /** Reset the decay timer on new activity. */
  function resetDecay(): void {
    if (decayTimer !== null) clearInterval(decayTimer);
    startDecay();
  }

  /** Gentle breathing animation when alone — shows the site is alive. */
  function startBreathing(): void {
    if (breathTimer !== null) return;
    if (reduced) return;
    breathTimer = window.setInterval(breathe, 45000);
  }

  /** One breath cycle — add/remove class for CSS animation. */
  function breathe(): void {
    el!.classList.add('hb-breath');
    setTimeout(() => el!.classList.remove('hb-breath'), 2000);
  }

  /** Stop breathing when real activity arrives. */
  function stopBreathing(): void {
    if (breathTimer === null) return;
    clearInterval(breathTimer);
    breathTimer = null;
    el!.classList.remove('hb-breath');
  }

  /** Check prefers-reduced-motion. */
  function matchesReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

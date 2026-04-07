// src/lib/live-conviction-hero.ts
// Live h:mm countdown for DeathClock when < 48 h remaining.
// Pure setInterval on an ISO deadline timestamp — no SSE, no hydration island.
// Called once on DOMContentLoaded from ConvictionHero's <script> tag.
//
// Design: only kicks in during the last 48 h so the ring's "days" display
// keeps its meaning on healthy posts; urgency demands precision at the end.
//
// Credits: Mike (arch spec §Key Design Decisions #3)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1_000;
const TICK_INTERVAL_MS = 60_000; // 1 minute — precision is h:mm, not h:mm:ss

// ---------------------------------------------------------------------------
// Pure helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

/** Milliseconds remaining until an ISO deadline. May be negative. */
function msUntilDeadline(isoTimestamp: string): number {
  return new Date(isoTimestamp).getTime() - Date.now();
}

/** True only inside the live countdown window (0 < ms ≤ 48 h). */
function isCountdownPhase(msLeft: number): boolean {
  return msLeft > 0 && msLeft <= FORTY_EIGHT_H_MS;
}

/** Format milliseconds as "3h 07m" or "47m". */
function formatHM(msLeft: number): string {
  const totalMins = Math.max(0, Math.floor(msLeft / 60_000));
  const hours     = Math.floor(totalMins / 60);
  const mins      = totalMins % 60;
  const mm        = String(mins).padStart(2, '0');
  return hours > 0 ? `${hours}h ${mm}m` : `${mins}m`;
}

/** Patch the day/unit labels inside a .death-clock element. */
function patchLabel(clockEl: Element, dayText: string, unitText: string): void {
  const dayEl  = clockEl.querySelector('.death-clock__days');
  const unitEl = clockEl.querySelector('.death-clock__unit');
  if (dayEl)  dayEl.textContent  = dayText;
  if (unitEl) unitEl.textContent = unitText;
}

/** One tick: read deadline, compute remaining, patch if still in phase. */
function tickOnce(wrapEl: HTMLElement, isoTimestamp: string): void {
  const ms    = msUntilDeadline(isoTimestamp);
  const clock = wrapEl.querySelector('.death-clock');
  if (!clock || !isCountdownPhase(ms)) return;
  patchLabel(clock, formatHM(ms), 'remaining');
}

/** Wire up a single .ch-clock-wrap element with its deadline. */
function scheduleForWrap(wrapEl: HTMLElement): void {
  const iso = wrapEl.dataset.deadlineIso;
  if (!iso) return;
  if (!isCountdownPhase(msUntilDeadline(iso))) return;
  tickOnce(wrapEl, iso);
  setInterval(() => tickOnce(wrapEl, iso), TICK_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find all ConvictionHero clock wraps on the page and start live countdowns
 * for those within the 48-hour window. Safe to call multiple times — each
 * wrap without a deadline-iso attribute is silently skipped.
 */
export function wireLiveCountdown(): void {
  document
    .querySelectorAll<HTMLElement>('.ch-clock-wrap[data-deadline-iso]')
    .forEach(scheduleForWrap);
}

// src/lib/firstEcho.ts
// Server-side orchestrator for First Revival Echo.
// When a first-time visitor's first revival arrives, schedule a phantom
// heartbeat on a constellation-linked post 3-8s later.
// One-shot per session. Skips when real visitors exist.
// Cleanup: cancels pending echo if session disconnects.

import { broadcast, connectionCount } from './heartbeat';
import { getRevivalCount } from './collectiveMemory';
import { pickEchoTarget } from './echoTarget';

/** Jitter range for echo delay (ms). */
const ECHO_DELAY_MIN = 3_000;
const ECHO_DELAY_MAX = 8_000;

/** Sessions that have already received an echo. */
const echoedSessions = new Set<string>();

/** Pending echo timers keyed by sessionId (for cleanup on disconnect). */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Random delay between min and max ms. */
function jitteredDelay(): number {
  return Math.random() * (ECHO_DELAY_MAX - ECHO_DELAY_MIN) + ECHO_DELAY_MIN;
}

/** Check whether this session has already echoed. */
function alreadyEchoed(sessionId: string): boolean {
  return echoedSessions.has(sessionId);
}

/** Mark session as echoed (one-shot gate). */
function markEchoed(sessionId: string): void {
  echoedSessions.add(sessionId);
}

/** True when real visitors are connected (skip phantom echo). */
function hasRealVisitors(): boolean {
  return connectionCount() > 1;
}

/** Emit the phantom echo broadcast for a target slug. */
async function emitEcho(targetSlug: string): Promise<void> {
  const count = getRevivalCount(targetSlug);
  broadcast({
    slug: targetSlug,
    count,
    ts: Date.now(),
    phantom: true,
  });
}

/** Schedule delayed echo broadcast and store timer for cleanup. */
function scheduleTimer(
  sessionId: string,
  targetSlug: string,
): void {
  const delay = jitteredDelay();
  const timer = setTimeout(async () => {
    pendingTimers.delete(sessionId);
    if (hasRealVisitors()) return;
    await emitEcho(targetSlug);
  }, delay);
  pendingTimers.set(sessionId, timer);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule a phantom echo for a first-time revival.
 * Gates: one-shot per session, skip when real visitors exist.
 * Returns true if echo was scheduled, false if skipped.
 */
export async function scheduleEcho(
  sourceSlug: string,
  sessionId: string,
): Promise<boolean> {
  if (!sessionId) return false;
  if (alreadyEchoed(sessionId)) return false;
  if (hasRealVisitors()) return false;

  const target = await pickEchoTarget(sourceSlug);
  if (!target) return false;

  markEchoed(sessionId);
  scheduleTimer(sessionId, target);
  return true;
}

/**
 * Cancel a pending echo for a disconnecting session.
 * Called from SSE cleanup to avoid orphaned timers.
 */
export function cancelEcho(sessionId: string): void {
  const timer = pendingTimers.get(sessionId);
  if (!timer) return;
  clearTimeout(timer);
  pendingTimers.delete(sessionId);
}

/**
 * Prune echoed-session memory. Call periodically from ambient life
 * or a sweep timer to prevent unbounded growth.
 * Keeps only sessions with pending timers.
 */
export function pruneEchoSessions(): void {
  for (const sid of echoedSessions) {
    if (!pendingTimers.has(sid)) echoedSessions.delete(sid);
  }
}

// ---------------------------------------------------------------------------
// Inline sanity check (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testFirstEcho(): void {
  // jitteredDelay within bounds
  for (let i = 0; i < 50; i++) {
    const d = jitteredDelay();
    console.assert(d >= ECHO_DELAY_MIN, `delay >= min: ${d}`);
    console.assert(d <= ECHO_DELAY_MAX, `delay <= max: ${d}`);
  }

  // alreadyEchoed gate
  const testId = '__test_session__';
  echoedSessions.delete(testId);
  console.assert(!alreadyEchoed(testId), 'fresh session not echoed');
  markEchoed(testId);
  console.assert(alreadyEchoed(testId), 'marked session is echoed');
  echoedSessions.delete(testId);

  // cancelEcho clears timer
  pendingTimers.set(testId, setTimeout(() => {}, 99999));
  console.assert(pendingTimers.has(testId), 'timer stored');
  cancelEcho(testId);
  console.assert(!pendingTimers.has(testId), 'timer cleared');

  // pruneEchoSessions removes sessions without pending timers
  echoedSessions.add('__prune_a__');
  echoedSessions.add('__prune_b__');
  pendingTimers.set('__prune_b__', setTimeout(() => {}, 99999));
  pruneEchoSessions();
  console.assert(!echoedSessions.has('__prune_a__'), 'pruned stale');
  console.assert(echoedSessions.has('__prune_b__'), 'kept active');
  clearTimeout(pendingTimers.get('__prune_b__')!);
  pendingTimers.delete('__prune_b__');
  echoedSessions.delete('__prune_b__');

  console.log('[firstEcho] OK — jitter, gates, cancel, prune verified');
}

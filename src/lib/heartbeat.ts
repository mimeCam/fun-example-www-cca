// src/lib/heartbeat.ts
// In-process event bus for SSE heartbeat broadcasting.
// Manages SSE connections, broadcasts revival events, auto-cleans on disconnect.
// Zero dependencies — uses native ReadableStream controllers.

/** A constellation connection included in revival broadcasts. */
export interface ResonanceLink {
  slug: string;
  strength: number;
}

/** Shape of a heartbeat event sent to all connected clients. */
export interface HeartbeatEvent {
  slug: string;
  count: number;
  ts: number;
  /** Constellation connections — present when revival triggers cascade. */
  resonance?: ResonanceLink[];
  /** True for ambient-life phantom pulses (synthetic, not a real reader). */
  phantom?: boolean;
}

type Controller = ReadableStreamDefaultController<Uint8Array>;

/** Active SSE connections keyed by unique id. */
const connections = new Map<string, Controller>();

/** Debounce buffer: slug -> latest event + timer. */
const pending = new Map<string, { event: HeartbeatEvent; timer: ReturnType<typeof setTimeout> }>();

const DEBOUNCE_MS = 3_000;
const KEEPALIVE_MS = 30_000;
const STALE_SWEEP_MS = 60_000;

let nextId = 0;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Format an SSE data frame (revival event). */
function sseFrame(event: HeartbeatEvent): Uint8Array {
  const line = `event: revival\ndata: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(line);
}

/** Format a named SSE frame (for presence, etc.). */
export function sseNamedFrame(name: string, data: unknown): Uint8Array {
  const line = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(line);
}

/** Format an SSE comment (keepalive ping). */
function ssePing(): Uint8Array {
  return new TextEncoder().encode(': keepalive\n\n');
}

/** Send bytes to a single controller, removing it on failure. */
function safeSend(id: string, ctrl: Controller, bytes: Uint8Array): void {
  try { ctrl.enqueue(bytes); }
  catch { connections.delete(id); }
}

/** Flush a debounced event to all connections. */
function flush(slug: string): void {
  const entry = pending.get(slug);
  if (!entry) return;
  pending.delete(slug);
  const bytes = sseFrame(entry.event);
  connections.forEach((ctrl, id) => safeSend(id, ctrl, bytes));
}

/** Start keepalive + sweep timers if not running. */
function ensureTimers(): void {
  if (!keepaliveTimer) {
    keepaliveTimer = setInterval(pingAll, KEEPALIVE_MS);
  }
  if (!sweepTimer) {
    sweepTimer = setInterval(sweepStale, STALE_SWEEP_MS);
  }
}

/** Stop timers when no connections remain. */
function maybeStopTimers(): void {
  if (connections.size > 0) return;
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
}

/** Ping every connection to keep proxies happy. */
function pingAll(): void {
  const bytes = ssePing();
  connections.forEach((ctrl, id) => safeSend(id, ctrl, bytes));
}

/** Remove dead controllers that threw on last enqueue. */
function sweepStale(): void {
  // Ping triggers safeSend which auto-removes failures.
  // This is a secondary sweep for any stragglers.
  pingAll();
  maybeStopTimers();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register a new SSE connection. Returns [id, controller-setter]. */
export function register(): { id: string; start: (ctrl: Controller) => void; cleanup: () => void } {
  const id = `hb-${++nextId}`;
  ensureTimers();
  return {
    id,
    start(ctrl: Controller) { connections.set(id, ctrl); },
    cleanup() { connections.delete(id); maybeStopTimers(); },
  };
}

/** Broadcast a revival event (debounced per slug). */
export function broadcast(event: HeartbeatEvent): void {
  const prev = pending.get(event.slug);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => flush(event.slug), DEBOUNCE_MS);
  pending.set(event.slug, { event, timer });
}

/** Current connection count (for diagnostics). */
export function connectionCount(): number {
  return connections.size;
}

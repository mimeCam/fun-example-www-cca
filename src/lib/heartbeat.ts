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
  /** Post-revival decay factor — lets clients decide dismiss vs update. */
  decayAfterRevival?: number;
  /** Constellation connections — present when revival triggers cascade. */
  resonance?: ResonanceLink[];
  /** True for ambient-life phantom pulses (synthetic, not a real reader). */
  phantom?: boolean;
}

type Controller = ReadableStreamDefaultController<Uint8Array>;

/** Metadata for an SSE connection. */
interface ConnectionMeta {
  ctrl: Controller;
  quiet: boolean;
}

/** Active SSE connections keyed by unique id. */
const connections = new Map<string, ConnectionMeta>();

/** Debounce buffer: slug -> latest event + timer. */
const pending = new Map<string, { event: HeartbeatEvent; timer: ReturnType<typeof setTimeout> }>();

const DEBOUNCE_MS = 3_000;
const KEEPALIVE_MS = 30_000;
const STALE_SWEEP_MS = 60_000;
const EVENT_LOG_LIMIT = 200;

let _nextConnId = 0;
let _nextEventId = 0;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Chronological log of emitted events — drives Last-Event-ID replay on reconnect. */
const _eventLog: Array<{ id: number; event: HeartbeatEvent }> = [];

/** Assign an event ID, append to log, evict oldest beyond limit. */
function logEvent(event: HeartbeatEvent): number {
  const id = ++_nextEventId;
  _eventLog.push({ id, event });
  if (_eventLog.length > EVENT_LOG_LIMIT) _eventLog.shift();
  return id;
}

/** All events logged after the given ID (for reconnect catch-up). */
export function eventsAfter(lastId: number): Array<{ id: number; event: HeartbeatEvent }> {
  return _eventLog.filter(e => e.id > lastId);
}

/** Format an SSE revival frame with a monotonic id: field. */
function sseEventFrame(id: number, event: HeartbeatEvent): Uint8Array {
  const line = `id: ${id}\nevent: revival\ndata: ${JSON.stringify(event)}\n\n`;
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

/** Send bytes to a single connection, removing it on failure. */
function safeSend(id: string, meta: ConnectionMeta, bytes: Uint8Array): void {
  try { meta.ctrl.enqueue(bytes); }
  catch { connections.delete(id); }
}

/** Flush a debounced event to all connections. Skip quiet ones for phantoms. */
function flush(slug: string): void {
  const entry = pending.get(slug);
  if (!entry) return;
  pending.delete(slug);
  const eventId = logEvent(entry.event);
  const bytes = sseEventFrame(eventId, entry.event);
  const isPhantom = entry.event.phantom === true;
  connections.forEach((meta, connId) => {
    if (isPhantom && meta.quiet) return;
    safeSend(connId, meta, bytes);
  });
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
  connections.forEach((meta, id) => safeSend(id, meta, bytes));
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

/** Register a new SSE connection. Quiet connections skip phantom events. */
export function register(
  quiet = false,
  lastEventId: number | null = null,
): { id: string; start: (ctrl: Controller) => void; cleanup: () => void } {
  const id = `hb-${++_nextConnId}`;
  ensureTimers();
  return {
    id,
    start(ctrl: Controller) {
      connections.set(id, { ctrl, quiet });
      if (lastEventId !== null) replaySince(ctrl, lastEventId);
    },
    cleanup() { connections.delete(id); maybeStopTimers(); },
  };
}

/** Send all logged events after lastEventId to a freshly reconnected client. */
function replaySince(ctrl: Controller, lastEventId: number): void {
  for (const { id, event } of eventsAfter(lastEventId)) {
    try { ctrl.enqueue(sseEventFrame(id, event)); } catch { break; }
  }
}

/** Broadcast a revival event (debounced per slug). */
export function broadcast(event: HeartbeatEvent): void {
  const prev = pending.get(event.slug);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => flush(event.slug), DEBOUNCE_MS);
  pending.set(event.slug, { event, timer });
}

/** Immediately broadcast a named event to all connections (no debounce). */
export function broadcastNamed(name: string, data: unknown): void {
  const bytes = sseNamedFrame(name, data);
  connections.forEach((meta, id) => safeSend(id, meta, bytes));
}

/** Current connection count (for diagnostics). */
export function connectionCount(): number {
  return connections.size;
}

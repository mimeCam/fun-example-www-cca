// src/lib/presence-hub.ts
// In-process connection registry for honest reader presence.
// Map<slug, Set<Connection>> — zero dependencies, zero phantoms.
// When nobody's here, count is zero. That's the whole point.
//
// Credits: Mike (architecture), Elon (honest-zero philosophy)

type Controller = ReadableStreamDefaultController<Uint8Array>;

/** A single SSE connection tracking a slug. */
interface Connection {
  id: string;
  ctrl: Controller;
  lastSeen: number;
  mobile: boolean;
}

/** A buffered SSE event for Last-Event-Id replay. */
interface BufferedEvent {
  id: number;
  event: string;
  data: unknown;
}

/** Per-slug connection set + broadcast helpers. */
const slugMap = new Map<string, Map<string, Connection>>();

/** Global-scope connections (homepage visitors with no slug). */
const globalMap = new Map<string, Connection>();

/** Ring buffer of recent events per slug (max REPLAY_BUFFER_SIZE). */
const replayBuffers = new Map<string, BufferedEvent[]>();

const STALE_MS = 60_000;
const STALE_MOBILE_MS = 120_000;
const KEEPALIVE_MS = 30_000;
const REPLAY_BUFFER_SIZE = 10;

let nextId = 0;
let nextEventId = 0;
let reaperTimer: ReturnType<typeof setInterval> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Internal helpers (each <=10 lines)
// ---------------------------------------------------------------------------

/** Get or create the connection map for a slug. */
function ensureSlug(slug: string): Map<string, Connection> {
  let conns = slugMap.get(slug);
  if (!conns) { conns = new Map(); slugMap.set(slug, conns); }
  return conns;
}

/** Remove a connection from its slug bucket. */
function removeConn(slug: string, id: string): void {
  const conns = slugMap.get(slug);
  if (!conns) return;
  conns.delete(id);
  if (conns.size === 0) slugMap.delete(slug);
}

/** Encode an SSE frame with optional event id. */
function sseFrame(event: string, data: unknown, id?: number): Uint8Array {
  const idLine = id != null ? `id: ${id}\n` : '';
  const line = `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(line);
}

/** Push an event into the replay ring buffer for a slug. */
function bufferEvent(slug: string, event: string, data: unknown): number {
  const id = ++nextEventId;
  let buf = replayBuffers.get(slug);
  if (!buf) { buf = []; replayBuffers.set(slug, buf); }
  buf.push({ id, event, data });
  if (buf.length > REPLAY_BUFFER_SIZE) buf.shift();
  return id;
}

/** Replay missed events since lastEventId for a slug. */
function replayFrom(slug: string, lastId: number, ctrl: Controller): void {
  const buf = replayBuffers.get(slug);
  if (!buf) return;
  for (const evt of buf) {
    if (evt.id <= lastId) continue;
    safeSendRaw(ctrl, sseFrame(evt.event, evt.data, evt.id));
  }
}

/** Send raw bytes to a controller (no slug tracking). */
function safeSendRaw(ctrl: Controller, bytes: Uint8Array): void {
  try { ctrl.enqueue(bytes); }
  catch { /* client gone */ }
}

/** Stale timeout for a connection (mobile gets longer window). */
function staleMs(conn: Connection): number {
  return conn.mobile ? STALE_MOBILE_MS : STALE_MS;
}

/** Send bytes to a controller, removing on failure. */
function safeSend(slug: string, conn: Connection, bytes: Uint8Array): void {
  try { conn.ctrl.enqueue(bytes); }
  catch { removeConn(slug, conn.id); }
}

/** Broadcast reader count to all connections on a slug. */
function broadcastCount(slug: string): void {
  const conns = slugMap.get(slug);
  if (!conns) return;
  const id = bufferEvent(slug, 'presence', { readers: conns.size });
  const payload = sseFrame('presence', { readers: conns.size }, id);
  conns.forEach(conn => safeSend(slug, conn, payload));
}

/** Broadcast a revival ripple to all connections on a slug. */
function broadcastRevival(slug: string, ts: number): void {
  const conns = slugMap.get(slug);
  if (!conns) return;
  const id = bufferEvent(slug, 'revival', { slug, ts });
  const payload = sseFrame('revival', { slug, ts }, id);
  conns.forEach(conn => safeSend(slug, conn, payload));
}

/** Total readers across all slug maps + global-only connections. */
function getGlobalCount(): number {
  return totalSlugConns() + globalMap.size;
}

/** Sum of connections across all slug buckets. */
function totalSlugConns(): number {
  let n = 0;
  slugMap.forEach(conns => { n += conns.size; });
  return n;
}

/** Send global reader count to every global-scope connection. */
function broadcastGlobal(): void {
  if (globalMap.size === 0) return;
  const payload = sseFrame('presence', { readers: getGlobalCount() });
  globalMap.forEach(conn => safeSendGlobal(conn, payload));
}

/** Send bytes to a global connection, removing on failure. */
function safeSendGlobal(conn: Connection, bytes: Uint8Array): void {
  try { conn.ctrl.enqueue(bytes); }
  catch { globalMap.delete(conn.id); }
}

/** Send a keepalive ping to every active connection (slugs + global). */
function pingAll(): void {
  const ping = new TextEncoder().encode(': keepalive\n\n');
  slugMap.forEach((conns, slug) => {
    conns.forEach(conn => safeSend(slug, conn, ping));
  });
  globalMap.forEach(conn => safeSendGlobal(conn, ping));
}

/** Sweep stale connections that missed heartbeats. */
function reapStale(): void {
  const now = Date.now();
  slugMap.forEach((conns, slug) => {
    conns.forEach((conn, id) => {
      if (now - conn.lastSeen > staleMs(conn)) removeConn(slug, id);
    });
    if (conns.size === 0) slugMap.delete(slug);
  });
  reapGlobalStale(now);
  maybeStopTimers();
}

/** Sweep stale global connections and broadcast updated count. */
function reapGlobalStale(now: number): void {
  let reaped = false;
  globalMap.forEach((conn, id) => {
    if (now - conn.lastSeen > staleMs(conn)) { globalMap.delete(id); reaped = true; }
  });
  if (reaped) broadcastGlobal();
}

/** Start timers if connections exist and timers are idle. */
function ensureTimers(): void {
  if (!reaperTimer) reaperTimer = setInterval(reapStale, STALE_MS);
  if (!keepaliveTimer) keepaliveTimer = setInterval(pingAll, KEEPALIVE_MS);
}

/** Stop timers when no connections remain. */
function maybeStopTimers(): void {
  if (totalConnections() > 0) return;
  if (reaperTimer) { clearInterval(reaperTimer); reaperTimer = null; }
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Total connections across all slugs + global (diagnostics). */
export function totalConnections(): number {
  return totalSlugConns() + globalMap.size;
}

/** Reader count for a specific slug. */
export function getCount(slug: string): number {
  return slugMap.get(slug)?.size ?? 0;
}

/** Add a connection to a slug and broadcast the new count. */
function addConn(slug: string, id: string, ctrl: Controller, mobile: boolean): void {
  const conn: Connection = { id, ctrl, lastSeen: Date.now(), mobile };
  ensureSlug(slug).set(id, conn);
  broadcastCount(slug);
  broadcastGlobal();
}

/** Drop a connection from a slug and broadcast the new count. */
function dropConn(slug: string, id: string): void {
  removeConn(slug, id);
  broadcastCount(slug);
  broadcastGlobal();
  maybeStopTimers();
}

/** Add a global-scope connection (homepage visitor). */
function addGlobalConn(id: string, ctrl: Controller, mobile: boolean): void {
  const conn: Connection = { id, ctrl, lastSeen: Date.now(), mobile };
  globalMap.set(id, conn);
  broadcastGlobal();
}

/** Drop a global-scope connection. */
function dropGlobalConn(id: string): void {
  globalMap.delete(id);
  broadcastGlobal();
  maybeStopTimers();
}

/** Options for joining a presence channel. */
interface JoinOpts {
  mobile?: boolean;
  lastEventId?: number;
}

/** Lifecycle hooks returned by join/joinGlobal. */
interface JoinHandle {
  id: string;
  start: (ctrl: Controller) => void;
  cleanup: () => void;
}

/** Register a new reader on a slug. Returns id + lifecycle hooks. */
export function join(slug: string, opts: JoinOpts = {}): JoinHandle {
  const id = `p-${++nextId}`;
  const mobile = opts.mobile ?? false;
  const lastId = opts.lastEventId ?? 0;
  ensureTimers();
  return {
    id,
    start: (ctrl: Controller) => {
      addConn(slug, id, ctrl, mobile);
      if (lastId > 0) replayFrom(slug, lastId, ctrl);
    },
    cleanup: () => dropConn(slug, id),
  };
}

/** Register a homepage visitor (global scope, no slug). */
export function joinGlobal(opts: JoinOpts = {}): JoinHandle {
  const id = `g-${++nextId}`;
  const mobile = opts.mobile ?? false;
  ensureTimers();
  return {
    id,
    start: (ctrl: Controller) => addGlobalConn(id, ctrl, mobile),
    cleanup: () => dropGlobalConn(id),
  };
}

/** Global count exported for initial SSE frame. */
export { getGlobalCount };

/** Mark a connection alive (called on client heartbeat). */
export function touch(slug: string, id: string): void {
  const conn = slugMap.get(slug)?.get(id);
  if (conn) conn.lastSeen = Date.now();
}

/** Mark a global connection alive. */
export function touchGlobal(id: string): void {
  const conn = globalMap.get(id);
  if (conn) conn.lastSeen = Date.now();
}

/** Notify all readers of a slug that a revival just happened. */
export function revive(slug: string): void {
  broadcastRevival(slug, Date.now());
}

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
}

/** Per-slug connection set + broadcast helpers. */
const slugMap = new Map<string, Map<string, Connection>>();

const STALE_MS = 60_000;
const KEEPALIVE_MS = 30_000;

let nextId = 0;
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

/** Encode an SSE frame. */
function sseFrame(event: string, data: unknown): Uint8Array {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(line);
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
  const payload = sseFrame('presence', { readers: conns.size });
  conns.forEach(conn => safeSend(slug, conn, payload));
}

/** Broadcast a revival ripple to all connections on a slug. */
function broadcastRevival(slug: string, ts: number): void {
  const conns = slugMap.get(slug);
  if (!conns) return;
  const payload = sseFrame('revival', { slug, ts });
  conns.forEach(conn => safeSend(slug, conn, payload));
}

/** Send a keepalive ping to every active connection. */
function pingAll(): void {
  const ping = new TextEncoder().encode(': keepalive\n\n');
  slugMap.forEach((conns, slug) => {
    conns.forEach(conn => safeSend(slug, conn, ping));
  });
}

/** Sweep stale connections that missed heartbeats. */
function reapStale(): void {
  const now = Date.now();
  slugMap.forEach((conns, slug) => {
    conns.forEach((conn, id) => {
      if (now - conn.lastSeen > STALE_MS) removeConn(slug, id);
    });
    if (conns.size === 0) slugMap.delete(slug);
  });
  maybeStopTimers();
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

/** Total connections across all slugs (diagnostics). */
export function totalConnections(): number {
  let n = 0;
  slugMap.forEach(conns => { n += conns.size; });
  return n;
}

/** Reader count for a specific slug. */
export function getCount(slug: string): number {
  return slugMap.get(slug)?.size ?? 0;
}

/** Add a connection to a slug and broadcast the new count. */
function addConn(slug: string, id: string, ctrl: Controller): void {
  const conn: Connection = { id, ctrl, lastSeen: Date.now() };
  ensureSlug(slug).set(id, conn);
  broadcastCount(slug);
}

/** Drop a connection from a slug and broadcast the new count. */
function dropConn(slug: string, id: string): void {
  removeConn(slug, id);
  broadcastCount(slug);
  maybeStopTimers();
}

/** Register a new reader on a slug. Returns id + lifecycle hooks. */
export function join(slug: string): { id: string; start: (ctrl: Controller) => void; cleanup: () => void } {
  const id = `p-${++nextId}`;
  ensureTimers();
  return {
    id,
    start: (ctrl: Controller) => addConn(slug, id, ctrl),
    cleanup: () => dropConn(slug, id),
  };
}

/** Mark a connection alive (called on client heartbeat). */
export function touch(slug: string, id: string): void {
  const conn = slugMap.get(slug)?.get(id);
  if (conn) conn.lastSeen = Date.now();
}

/** Notify all readers of a slug that a revival just happened. */
export function revive(slug: string): void {
  broadcastRevival(slug, Date.now());
}

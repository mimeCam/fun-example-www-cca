// src/lib/heartbeatClient.ts
// Client-side EventSource wrapper for real-time heartbeat events.
// Connects to /api/heartbeat, debounces rapid-fire events per slug,
// dispatches 'heartbeat:revival' CustomEvent on document.
// Progressive enhancement — if SSE fails, nothing breaks.

/** Shape of the custom event detail. */
export interface HeartbeatDetail {
  slug: string;
  count: number;
  ts: number;
}

const DEBOUNCE_MS = 500;
const ENDPOINT = '/api/heartbeat';

/** Returns an inline IIFE script string for BaseLayout injection. */
export function heartbeatClientScript(): string {
  return `(${clientIIFE.toString()})();`;
}

/** The actual client logic, serialized as an IIFE. */
function clientIIFE(): void {
  if (typeof EventSource === 'undefined') return;

  const debounceMap = new Map<string, number>();
  let source: EventSource | null = null;

  function connect(): void {
    source = new EventSource('/api/heartbeat');
    source.addEventListener('revival', onRevival);
    source.addEventListener('error', onError);
  }

  function onRevival(e: MessageEvent): void {
    const data = safeParse(e.data);
    if (!data || !data.slug) return;
    if (isOwnRevival(data.slug)) return;
    debounced(data.slug, data.count, data.ts);
  }

  function onError(): void {
    // EventSource auto-reconnects. Nothing to do.
  }

  /** Skip events triggered by this browser tab's own revival. */
  function isOwnRevival(slug: string): boolean {
    const key = 'kept:' + slug;
    const kept = sessionStorage.getItem(key);
    if (!kept) return false;
    const elapsed = Date.now() - parseInt(kept, 10);
    return elapsed < 5000;
  }

  /** Debounce rapid-fire events for the same slug. */
  function debounced(slug: string, count: number, ts: number): void {
    const prev = debounceMap.get(slug);
    if (prev) clearTimeout(prev);
    const timer = window.setTimeout(() => {
      debounceMap.delete(slug);
      dispatch(slug, count, ts);
    }, 500);
    debounceMap.set(slug, timer);
  }

  /** Dispatch the custom event for other modules to consume. */
  function dispatch(slug: string, count: number, ts: number): void {
    document.dispatchEvent(
      new CustomEvent('heartbeat:revival', {
        detail: { slug, count, ts },
      })
    );
  }

  /** Safe JSON parse. */
  function safeParse(raw: string): Record<string, unknown> | null {
    try { return JSON.parse(raw); }
    catch { return null; }
  }

  connect();
}

// src/lib/heartbeatBridge.ts
// Bridges the gap between heartbeatFx (pulse) and bloomOrchestrator (bloom).
// Listens for 'heartbeat:revival' and re-dispatches as 'revival:success'
// so remote revivals trigger the full bloom sequence, not just a weak pulse.
// Without this bridge, only local revivals (from reviveClient) trigger bloom.

/** Returns an inline IIFE script string for BaseLayout injection. */
export function heartbeatBridgeScript(): string {
  return `(${bridgeIIFE.toString()})();`;
}

/** The bridge logic, serialized as an IIFE. */
function bridgeIIFE(): void {
  document.addEventListener('heartbeat:revival', ((e: CustomEvent) => {
    const detail = e.detail;
    if (!detail || !detail.slug) return;
    dispatchBloom(detail.slug, detail.count);
  }) as EventListener);

  /** Re-dispatch as revival:success so bloomOrchestrator picks it up. */
  function dispatchBloom(slug: string, count: number): void {
    document.dispatchEvent(
      new CustomEvent('revival:success', {
        detail: { slug, newCount: count || 1, source: 'heartbeat' },
      })
    );
  }
}

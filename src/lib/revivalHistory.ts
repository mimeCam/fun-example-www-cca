// src/lib/revivalHistory.ts
// Pure functions for Ghost Echoes sparkline. No side-effects. No DB access.
// All DB access lives in collectiveMemory.ts (existing contract).
//
// Credits: Mike (architecture spec), Tanya (UX spec — adaptive pulse rhythm)

const WEEK_MS = 7 * 24 * 3_600_000;

// ---------------------------------------------------------------------------
// Bucket shaping
// ---------------------------------------------------------------------------

/**
 * Bin raw Unix-ms timestamps into weekly buckets, oldest-first.
 * Timestamps outside the window are silently ignored.
 */
export function shapeBuckets(timestamps: number[], windowWeeks = 8): number[] {
  const now = Date.now();
  const buckets = new Array<number>(windowWeeks).fill(0);
  for (const ts of timestamps) {
    const weekIdx = Math.floor((now - ts) / WEEK_MS);
    if (weekIdx >= 0 && weekIdx < windowWeeks) buckets[windowWeeks - 1 - weekIdx]++;
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// SVG polyline
// ---------------------------------------------------------------------------

/**
 * Produce a SVG polyline points string from a bucket array.
 * Normalises to the local max so the sparkline always fills vertical space.
 */
export function bucketToSVGPoints(buckets: number[], width = 120, height = 24): string {
  const max = Math.max(...buckets, 1);
  const step = buckets.length > 1 ? width / (buckets.length - 1) : 0;
  return buckets
    .map((v, i) => {
      const x = Math.round(i * step);
      const y = Math.round(height - (v / max) * (height - 4) - 2);
      return `${x},${y}`;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Narrative label
// ---------------------------------------------------------------------------

/** Human-readable provenance: "27 readers have kept this alive — last tended 4d ago" */
export function narrativeLabel(total: number, lastAt: string | null): string {
  if (total === 0) return '';
  const who = total === 1 ? '1 reader has' : `${total} readers have`;
  if (!lastAt) return `${who} kept this alive`;
  return `${who} kept this alive — last tended ${relativeTime(new Date(lastAt))}`;
}

// ---------------------------------------------------------------------------
// Adaptive echo interval
// ---------------------------------------------------------------------------

/**
 * Return pulse interval in ms based on recent activity in the last 2 weeks.
 * High activity → fast pulse (3s). Dormant → slow pulse (12s).
 */
export function echoIntervalMs(buckets: number[]): number {
  const recent = buckets.slice(-2).reduce((a, b) => a + b, 0);
  if (recent >= 10) return 3_000;
  if (recent >= 3)  return 6_000;
  return 12_000;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1)  return 'today';
  if (days < 7)  return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? '1w ago' : `${weeks}w ago`;
}

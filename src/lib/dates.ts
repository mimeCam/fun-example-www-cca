// src/lib/dates.ts
// Pure date formatting utilities — no dependencies, no state.
//
// Isolated-run sanity check: `npm run test:dates`
// (package.json invokes _testDates via tsx — see openloop/inplace-testing-howto.md)

/** Formats a Date to "Apr 4, 2026" style for display on post pages. */
export function formatPubDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (leave in place)
// ---------------------------------------------------------------------------

/** Throws on failure — scripts/test-dates.ts calls this and exits non-zero. */
export function _testDates(): void {
  assertContains(formatPubDate(new Date('2026-04-04')), '2026', 'year');
  assertContains(formatPubDate(new Date('2026-04-04')), 'Apr',  'month');
  console.log('[dates] utility OK');
}

/** Tiny local assert — avoids dragging in node:assert for a 3-line check. */
function assertContains(actual: string, needle: string, label: string): void {
  if (actual.includes(needle)) return;
  throw new Error(`[dates] expected ${label} "${needle}" in "${actual}"`);
}

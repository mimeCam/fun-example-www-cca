// src/lib/dates.ts
// Pure date formatting utilities — no dependencies, no state.
//
// TODO: wire _testDates() into build script (see openloop/inplace-testing-howto.md)

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

export function _testDates(): void {
  const d = new Date('2026-04-04');
  const formatted = formatPubDate(d);
  console.assert(formatted.includes('2026'), `expected year in "${formatted}"`);
  console.assert(formatted.includes('Apr'), `expected month in "${formatted}"`);
  console.log('[dates] utility OK');
}

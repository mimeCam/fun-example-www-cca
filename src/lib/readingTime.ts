// src/lib/readingTime.ts
// Pure utility — compute post reading time from raw markdown body string.
// No dependencies, no state. Call getReadingTime(post.body) at build time.
//
// TODO: wire _testReadingTime() into a build script (see openloop/inplace-testing-howto.md)

const WPM = 200; // average adult silent reading speed

/** Returns estimated reading time in minutes; minimum 1. */
export function getReadingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WPM));
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (leave in place — see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testReadingTime(): void {
  console.assert(getReadingTime('') === 1, 'empty body → 1 min');
  console.assert(getReadingTime('word '.repeat(200)) === 1, '200 words → 1 min');
  console.assert(getReadingTime('word '.repeat(201)) === 2, '201 words → 2 min');
  console.assert(getReadingTime('word '.repeat(400)) === 2, '400 words → 2 min');
  console.log('[readingTime] utility OK');
}

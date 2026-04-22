// scripts/test-dates.ts
// Runs the _testDates() sanity check as an isolated-run entrypoint.
// Usage: `npm run test:dates` (see package.json).
// Pattern follows openloop/inplace-testing-howto.md — run, assert, exit.
// Credits: Mike (§6.9 wire test hygiene), Krystle (original sprint catch).

import { _testDates } from '../src/lib/dates.ts';

try {
  _testDates();
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

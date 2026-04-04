// src/lib/pendingStore.ts
// Atomic read/write for the moderation queue (wall-pending.json).
// Mirrors cli/lib/store.mjs pattern: write temp → rename.
// Only the SSR endpoint writes; CLI reads for moderation.
//
// TODO: add file locking for concurrent writes (v2)

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PendingWhisper } from './wallSubmit';

const DATA_DIR  = join(import.meta.dirname, '..', 'data');
const PENDING   = join(DATA_DIR, 'wall-pending.json');
const TEMP      = join(DATA_DIR, '.wall-pending.json.tmp');

/** Read pending whispers. Returns [] if file missing. */
export function readPending(): PendingWhisper[] {
  if (!existsSync(PENDING)) return [];
  return JSON.parse(readFileSync(PENDING, 'utf-8'));
}

/** Write pending whispers atomically. */
export function writePending(entries: PendingWhisper[]): void {
  writeFileSync(TEMP, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  renameSync(TEMP, PENDING);
}

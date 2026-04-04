// cli/lib/store.mjs
// Atomic read/write for data/wall.json.
// Writes to a temp file first, then renames — oldest trick in the book.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR  = join(import.meta.dirname, '..', '..', 'src', 'data');
const WALL_PATH = join(DATA_DIR, 'wall.json');
const TEMP_PATH = join(DATA_DIR, '.wall.json.tmp');

/** Read current entries from wall.json. */
export function readEntries() {
  const raw = readFileSync(WALL_PATH, 'utf-8');
  return JSON.parse(raw);
}

/** Create a new entry object with generated ID and today's date. */
export function createEntry(text, mood) {
  return {
    id: crypto.randomUUID().slice(0, 8),
    text: text.trim(),
    posted: new Date().toISOString().slice(0, 10),
    mood,
  };
}

/** Append an entry and write atomically. Newest first. */
export function appendEntry(entry) {
  const entries = readEntries();
  entries.unshift(entry);
  const json = JSON.stringify(entries, null, 2) + '\n';
  writeFileSync(TEMP_PATH, json, 'utf-8');
  renameSync(TEMP_PATH, WALL_PATH);
  return entries.length;
}

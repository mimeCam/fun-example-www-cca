#!/usr/bin/env node
// cli/whisper.mjs
// CLI entry point for adding whispers to the wall.
// Usage: node cli/whisper.mjs "your thought" --mood focus
//   or:  npm run whisper -- "your thought" --mood jazz

import { validateText, validateMood, inferMood } from './lib/validate.mjs';
import { createEntry, appendEntry } from './lib/store.mjs';

const args = process.argv.slice(2);

/** Extract a --flag value from args array. */
function extractFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

/** Collect all positional args (not flags or flag values). */
function collectText() {
  const skip = new Set();
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { skip.add(i); skip.add(i + 1); i++; }
  }
  return args.filter((_, i) => !skip.has(i)).join(' ');
}

function die(msg) { console.error(`\x1b[31m${msg}\x1b[0m`); process.exit(1); }
function ok(msg)  { console.log(`\x1b[32m${msg}\x1b[0m`); }

// --- main ---
const text = collectText();
const explicit = extractFlag('--mood');
const mood = explicit ?? inferMood(text);

const textErr = validateText(text);
if (textErr) die(textErr);

const moodErr = validateMood(mood);
if (moodErr) die(moodErr);

const entry = createEntry(text, mood);
const total = appendEntry(entry);

ok(`Whispered (${entry.text.length} chars, mood: ${mood})`);
ok(`Wall now has ${total} entries.`);

// src/lib/wallSubmit.ts
// Shared validation & pending-queue helpers for visitor whisper submissions.
// Moderation-first: every submission lands in wall-pending.json until approved.
// Reuses MoodId from mood.ts. Zero side-effects in pure functions.
//
// TODO: add rate-limit token bucket per IP (v2)
// TODO: add profanity word list filter (v2)

/** Honeypot field name — looks real to bots, invisible to humans. */
export const HONEYPOT_FIELD = 'website';

/** Returns true if the honeypot was filled (i.e. likely bot). */
export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

import type { MoodId } from './mood';
import { MOODS } from './mood';

export const MAX_CHARS = 280;
export const MIN_CHARS = 2;
const VALID_MOODS = Object.keys(MOODS) as MoodId[];

export interface PendingWhisper {
  id: string;
  text: string;
  mood: MoodId;
  submitted: string;   // ISO date
  ip?: string;         // stripped before approval
}

/** Returns null when valid, error string otherwise. */
export function validateText(text: unknown): string | null {
  if (typeof text !== 'string') return 'Text must be a string.';
  const t = text.trim();
  if (t.length < MIN_CHARS) return 'Too short — say a little more.';
  if (t.length > MAX_CHARS) return `${t.length}/${MAX_CHARS} chars — trim it down.`;
  return null;
}

/** Returns null when valid, error string otherwise. */
export function validateMood(mood: unknown): string | null {
  if (typeof mood !== 'string') return 'Mood must be a string.';
  if (!VALID_MOODS.includes(mood as MoodId)) {
    return `Unknown mood. Pick: ${VALID_MOODS.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testWallSubmit(): void {
  console.assert(validateText('') !== null, 'empty text rejected');
  console.assert(validateText('hi') === null, 'short text OK');
  console.assert(validateText('x'.repeat(281)) !== null, 'overflow rejected');
  console.assert(validateMood('lo-fi') === null, 'valid mood OK');
  console.assert(validateMood('reggae') !== null, 'invalid mood rejected');
  console.assert(isHoneypotTripped('') === false, 'empty honeypot OK');
  console.assert(isHoneypotTripped('spam') === true, 'filled honeypot caught');
  console.log('[wallSubmit] validation OK');
}

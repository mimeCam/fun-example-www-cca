// cli/lib/validate.mjs
// Validates whisper input before it touches the store.
// Pure functions, no side-effects, no dependencies.

const MAX_CHARS = 280;
const VALID_MOODS = ['lo-fi', 'focus', 'hyperpop', 'jazz', 'default'];

/** Returns null if valid, or an error string if not. */
export function validateText(text) {
  if (!text || text.trim().length === 0) return 'Text is required.';
  if (text.length > MAX_CHARS) return `Too long: ${text.length}/${MAX_CHARS} chars.`;
  return null;
}

/** Returns the mood if valid, or throws with allowed list. */
export function validateMood(mood) {
  if (!VALID_MOODS.includes(mood)) {
    return `Invalid mood "${mood}". Pick one: ${VALID_MOODS.join(', ')}`;
  }
  return null;
}

export { MAX_CHARS, VALID_MOODS };

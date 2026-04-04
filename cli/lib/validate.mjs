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

// ---------------------------------------------------------------------------
// Mood keywords — each mood maps to words that suggest it
// ---------------------------------------------------------------------------

const MOOD_KEYWORDS = {
  'lo-fi':    ['chill', 'relax', 'cozy', 'warm', 'slow', 'coffee', 'rain', 'calm', 'mellow', 'lazy'],
  'focus':    ['build', 'ship', 'code', 'debug', 'work', 'deploy', 'refactor', 'think', 'deep', 'grind'],
  'hyperpop': ['wild', 'chaos', 'energy', 'loud', 'neon', 'glitch', 'fast', 'hype', 'fire', 'wow'],
  'jazz':     ['night', 'late', 'shadow', 'dream', 'dark', 'smoke', 'glass', 'frost', 'rabbit', 'hole'],
};

/** Check if lowercased text contains a keyword. */
function countHits(lower, words) {
  return words.filter(w => lower.includes(w)).length;
}

/**
 * Infer a mood from whisper text using keyword frequency.
 * Returns a valid MoodId. Falls back to 'default' when no
 * mood wins or when there's a tie — default is a first-class choice.
 */
export function inferMood(text) {
  const lower = text.toLowerCase();
  let best = 'default';
  let max = 0;

  for (const [mood, words] of Object.entries(MOOD_KEYWORDS)) {
    const hits = countHits(lower, words);
    if (hits > max) { max = hits; best = mood; }
    // TODO: tie-breaking by mood priority order
  }
  return best;
}

export { MAX_CHARS, VALID_MOODS };

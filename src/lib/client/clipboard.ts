// src/lib/client/clipboard.ts
// Tiny clipboard helper — one async function, one fallback path.
//
// Extracted from ShareSealButton.astro (v150b, Mike §6 "no second copy
// abstraction"). Two call sites today: ShareSealButton and cell-cite.
// Extracting keeps the fallback logic in one place; the legacy
// `execCommand` branch is a single source of truth.
//
// Pure DOM — no framework, no state, no side effects beyond a
// temporary <textarea> that cleans itself up. Returns a boolean so
// callers can decide their own UX (toast vs. inline confirm).
//
// Credits: Paul (non-negotiable — the string is the product),
//          Mike (§6 anti-pattern: duplicate clipboard path),
//          existing ShareSealButton.astro pattern.

/**
 * Copy `text` to the user's clipboard. Prefers the modern async API;
 * falls back to `document.execCommand('copy')` on hostile contexts
 * (older browsers, non-secure origins, some iframes).
 *
 * Resolves `true` when either path succeeds, `false` otherwise.
 * Never throws — the caller owns the user-facing failure message.
 */
export async function copyText(text: string): Promise<boolean> {
  if (await modernCopy(text)) return true;
  return legacyCopy(text);
}

async function modernCopy(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(ta);
  try {
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

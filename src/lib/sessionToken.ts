// src/lib/sessionToken.ts
// Visitor session identity — anonymous UUID persisted in localStorage.
// Gives each browser a stable identity for session-scoped rate limiting.
// Solves the shared-NAT problem: offices, families, and mobile users on the
// same IP can each revive posts independently.
// Zero dependencies, no PII, no server round-trip.

/** localStorage key for the anonymous session UUID. */
export const SESSION_KEY = '_sid';

/** Header name the revival API reads to prefer session-based rate limiting. */
export const SESSION_HEADER = 'X-Session-Id';

// ---------------------------------------------------------------------------
// UUID generation — prefers Web Crypto, falls back to entropy mix
// ---------------------------------------------------------------------------

function uuidFromBytes(b: Uint8Array): string {
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (v) => v.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function generateUUID(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read or create the session ID in localStorage.
 * Returns null on SSR or when storage is blocked (private browsing strict mode).
 */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const fresh = generateUUID();
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inline script — inject into <head>, runs before any revival calls
// ---------------------------------------------------------------------------

/**
 * Returns a self-executing inline script that sets window.__sessionId.
 * Must be injected before revivalController so the header is available.
 * sessionStorage is NOT used here — localStorage survives tab close,
 * giving a stable per-browser identity across sessions.
 */
export function sessionTokenScript(): string {
  return `(function(){
  var k='${SESSION_KEY}';
  try{
    var s=localStorage.getItem(k);
    if(!s){
      var b=crypto.getRandomValues(new Uint8Array(16));
      b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
      s=[].slice.call(b).map(function(v,i){
        return([4,6,8,10].indexOf(i)>-1?'-':'')+('0'+v.toString(16)).slice(-2);
      }).join('');
      localStorage.setItem(k,s);
    }
    window.__sessionId=s;
    /* Tab-scoped token for per-tab revival idempotency (X-Session-Id header). */
    if(!sessionStorage.getItem('session-token')){
      var t=(typeof crypto.randomUUID==='function')?crypto.randomUUID():'t-'+Math.random().toString(36).slice(2);
      sessionStorage.setItem('session-token',t);
    }
  }catch(e){window.__sessionId='s-'+Math.random().toString(36).slice(2);}
})();`;
}

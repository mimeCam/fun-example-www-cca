// src/lib/visitorFingerprint.ts
// Lightweight, privacy-respecting browser fingerprint for abuse detection.
// Hashes ~8 navigator/screen signals client-side via SHA-256.
// Server only sees the hash — cannot reverse to identify individuals.
// No canvas, no WebGL, no cookies, no tracking pixels.

/** Header name for the fingerprint hash. */
export const FP_HEADER = 'X-Visitor-Fp';

/**
 * Returns an inline script that computes a fingerprint hash
 * and stores it on window.__visitorFp (a Promise<string>).
 */
export function visitorFingerprintScript(): string {
  return `window.__visitorFp=(function(){
  var s=window.screen||{};
  var n=navigator||{};
  var signals=[
    s.width||0,
    s.height||0,
    s.colorDepth||0,
    n.language||'',
    n.platform||'',
    n.hardwareConcurrency||0,
    new Date().getTimezoneOffset(),
    n.maxTouchPoints||0
  ].join('|');
  return crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(signals)
  ).then(function(buf){
    var a=new Uint8Array(buf);
    var h='';
    for(var i=0;i<a.length;i++)h+=('0'+a[i].toString(16)).slice(-2);
    return h;
  }).catch(function(){return 'unknown';});
})();`;
}

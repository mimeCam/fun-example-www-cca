// src/lib/proofOfWork.ts
// Lightweight hashcash-style proof-of-work for revival anti-gaming.
// Server generates challenges; client solves them before POST /api/revive.
// Uses Web Crypto API (client) and Node crypto (server). Zero dependencies.

import { createHash, randomBytes } from 'crypto';

/** Challenge validity window (5 minutes). */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Default difficulty: 16 leading zero bits (~50ms desktop, ~200ms low-end). */
const DEFAULT_DIFFICULTY = 16;

// ---------------------------------------------------------------------------
// Server: generate + verify
// ---------------------------------------------------------------------------

/** Generate a timestamped challenge token. */
export function generateChallenge(): string {
  const ts = Date.now().toString(36);
  const rand = randomBytes(12).toString('hex');
  return `${ts}:${rand}`;
}

/** Extract the timestamp from a challenge string. */
function challengeTimestamp(challenge: string): number {
  const ts = challenge.split(':')[0] ?? '';
  return parseInt(ts, 36) || 0;
}

/** True if the challenge was issued within the TTL window. */
function isFresh(challenge: string): boolean {
  const age = Date.now() - challengeTimestamp(challenge);
  return age >= 0 && age <= CHALLENGE_TTL_MS;
}

/** Count leading zero bits in a Buffer. */
function leadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

type ProofResult = { valid: boolean; reason?: string };

/** Split challenge:nonce from header, return null if malformed. */
function parseProofHeader(header: string): { challenge: string; nonce: string } | null {
  const sep = header.lastIndexOf(':');
  if (sep <= 0) return null;
  const challenge = header.slice(0, sep);
  const nonce = header.slice(sep + 1);
  return (challenge && nonce) ? { challenge, nonce } : null;
}

/** Verify the hash meets the required difficulty. */
function verifyHash(challenge: string, nonce: string, difficulty: number): boolean {
  const hash = createHash('sha256').update(challenge + nonce).digest();
  return leadingZeroBits(hash) >= difficulty;
}

/** Verify a proof-of-work header value: "challenge:nonce". */
export function verifyProof(header: string | null, difficulty = DEFAULT_DIFFICULTY): ProofResult {
  if (!header) return { valid: false, reason: 'missing-proof' };
  const parts = parseProofHeader(header);
  if (!parts) return { valid: false, reason: 'malformed-proof' };
  if (!isFresh(parts.challenge)) return { valid: false, reason: 'stale-challenge' };
  if (!verifyHash(parts.challenge, parts.nonce, difficulty)) {
    return { valid: false, reason: 'insufficient-work' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Client: inline script that solves challenges in the browser
// ---------------------------------------------------------------------------

/** Returns an inline script that exposes window.__solvePoW(challenge). */
export function proofOfWorkClientScript(challenge: string): string {
  return `window.__powChallenge="${challenge}";
window.__solvePoW=function(c,d){
  d=d||${DEFAULT_DIFFICULTY};
  return new Promise(function(res){
    var i=0;
    function step(){
      var end=i+4096;
      for(;i<end;i++){
        var n=i.toString(36);
        var data=new TextEncoder().encode(c+n);
        crypto.subtle.digest('SHA-256',data).then(function(buf){
          var a=new Uint8Array(buf),bits=0,j=0;
          while(j<a.length&&a[j]===0){bits+=8;j++;}
          if(j<a.length)bits+=Math.clz32(a[j])-24;
          if(bits>=d)res(c+':'+this);
        }.bind(n));
      }
      if(i<2e7)requestIdleCallback?requestIdleCallback(step):setTimeout(step,0);
    }
    step();
  });
};
window.__powReady=null;
(function preSolve(){
  if(!window.__powChallenge)return;
  window.__powReady=window.__solvePoW(window.__powChallenge);
})();`;
}

/** Optimised client script using synchronous loop with async digest. */
export function powSolverScript(challenge: string): string {
  return `window.__powChallenge="${challenge}";
window.__powReady=(function(){
  var ch="${challenge}",df=${DEFAULT_DIFFICULTY};
  return new Promise(function(resolve){
    var n=0;
    function batch(){
      var promises=[];
      for(var i=0;i<1024;i++,n++){
        var s=n.toString(36);
        promises.push(
          crypto.subtle.digest('SHA-256',new TextEncoder().encode(ch+s))
          .then((function(nn){return function(buf){
            var a=new Uint8Array(buf),b=0,j=0;
            while(j<a.length&&a[j]===0){b+=8;j++;}
            if(j<a.length)b+=Math.clz32(a[j])-24;
            if(b>=df)return nn;
            return null;
          };})(s))
        );
      }
      Promise.all(promises).then(function(results){
        for(var k=0;k<results.length;k++){
          if(results[k]!=null){resolve(ch+':'+results[k]);return;}
        }
        if(typeof requestIdleCallback!=='undefined')
          requestIdleCallback(batch);
        else setTimeout(batch,0);
      });
    }
    batch();
  });
})();`;
}

// src/lib/rfc3161-verifier.ts
// RFC 3161 CMS SignedData verifier — full cryptographic proof via pkijs.
// Validates the TSA signature against the bundled FreeTSA root CA cert.
// "verified: true" = CMS signature is valid, not just parseable.
//
// Credits: Mike (arch §rfc3161-verifier, §Points-of-Interest), Tanya (§TrustBadge)

import { readFileSync }  from 'node:fs';
import { resolve }       from 'node:path';
import { webcrypto }     from 'node:crypto';
import * as pkijs        from 'pkijs';

// ── Crypto engine (one-time setup — MUST precede any pkijs call) ──────────
pkijs.setEngine('WebCrypto', new pkijs.CryptoEngine({
  name:   'WebCrypto',
  crypto: webcrypto as Crypto,
}));

// ── Public type ───────────────────────────────────────────────────────────

export interface TstVerifyResult {
  verified:  boolean;   // true = CMS signature valid + genTime extracted
  timestamp: Date | null;
  tsaName:   string;
}

// ── CA cert singleton (avoids re-reading DER on every post at build time) ─

let _caCert: pkijs.Certificate | null = null;

function getFreeTsaCert(): pkijs.Certificate {
  if (_caCert) return _caCert;
  const buf  = readFileSync(resolve(process.cwd(), 'src/assets/freetsa-ca.der'));
  const der  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  _caCert = pkijs.Certificate.fromBER(der);
  return _caCert;
}

// ── Byte-scanner: fast GenTime extraction (cross-check vs pkijs) ──────────

function parseGenTime(s: string): Date {
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T` +
    `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`,
  );
}

function findGenTime(buf: Buffer): Date | null {
  for (let i = 0; i < buf.length - 17; i++) {
    if (buf[i] !== 0x18 || buf[i + 1] !== 15) continue;
    const s = buf.slice(i + 2, i + 17).toString('ascii');
    if (/^\d{14}Z$/.test(s)) return parseGenTime(s);
  }
  return null;
}

// ── pkijs CMS helpers ─────────────────────────────────────────────────────

function parseSignedData(der: ArrayBuffer): pkijs.SignedData {
  const ci = pkijs.ContentInfo.fromBER(der);
  return new pkijs.SignedData({ schema: ci.content });
}

function extractTstGenTime(sd: pkijs.SignedData): Date | null {
  const raw = sd.encapContentInfo?.eContent?.valueBlock?.valueHexView;
  if (!raw) return null;
  const tstInfo = pkijs.TSTInfo.fromBER(raw);
  return tstInfo?.genTime ?? null;
}

async function verifyCmsSignature(sd: pkijs.SignedData): Promise<boolean> {
  return sd.verify({
    signer:       0,
    checkChain:   true,
    trustedCerts: [getFreeTsaCert()],
  });
}

// ── Cross-check: byte-scanner vs pkijs genTime must agree (±1 s) ─────────

function assertGenTimesMatch(a: Date | null, b: Date | null): void {
  if (!a || !b) return;
  if (Math.abs(a.getTime() - b.getTime()) > 1000) {
    throw new Error(`genTime mismatch: scanner=${a.toISOString()} pkijs=${b.toISOString()}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Cryptographically verify a base64-encoded RFC 3161 TimeStampToken.
 * Returns verified=true only when CMS SignedData signature validates
 * against the bundled FreeTSA root CA cert.
 */
export async function verifyToken(base64Token: string): Promise<TstVerifyResult> {
  try {
    const buf       = Buffer.from(base64Token, 'base64');
    const der       = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const sd        = parseSignedData(der);
    const [sigOk, pkijsTime, scanTime] = await Promise.all([
      verifyCmsSignature(sd),
      Promise.resolve(extractTstGenTime(sd)),
      Promise.resolve(findGenTime(buf)),
    ]);
    assertGenTimesMatch(scanTime, pkijsTime);
    const timestamp = pkijsTime ?? scanTime;
    return { verified: sigOk && timestamp !== null, timestamp, tsaName: 'FreeTSA.org' };
  } catch {
    return { verified: false, timestamp: null, tsaName: 'FreeTSA.org' };
  }
}

// src/lib/rfc3161-client.ts
// RFC 3161 Trusted Timestamp client — POSTs SHA-256 hash to FreeTSA.org.
// Returns base64-encoded TimeStampToken (raw DER) for independent verification.
// Manual DER encoding for the request — known fixed structure, no extra library.
// Graceful degradation: callers catch errors (TSA down ≠ broken seal).
//
// Credits: Mike (arch §rfc3161-client), DevBrain (RFC 3161 / TLS notarization)

import { createHash, randomBytes } from 'crypto';

const TSA_URL    = 'https://freetsa.org/tsr';
// SHA-256 OID 2.16.840.1.101.3.4.2.1 — pre-encoded as hex DER
const SHA256_OID = Buffer.from('608648016503040201', 'hex');

// ---------------------------------------------------------------------------
// DER primitives — each ≤ 5 lines
// ---------------------------------------------------------------------------

function encLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const b = n > 0xff ? Buffer.from([(n >> 8) & 0xff, n & 0xff]) : Buffer.from([n & 0xff]);
  return Buffer.concat([Buffer.from([0x80 | b.length]), b]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encLen(content.length), content]);
}

function encSeq(...parts: Buffer[]): Buffer { return tlv(0x30, Buffer.concat(parts)); }
function encOctetStr(b: Buffer): Buffer     { return tlv(0x04, b); }
function encOID(b: Buffer): Buffer          { return tlv(0x06, b); }
function encInt(n: number): Buffer          { return tlv(0x02, Buffer.from([n])); }
function encBool(v: boolean): Buffer        { return Buffer.from([0x01, 0x01, v ? 0xff : 0x00]); }

/** Nonce INTEGER — prepend 0x00 to prevent sign-bit misinterpretation. */
function encNonce(b: Buffer): Buffer {
  return tlv(0x02, Buffer.concat([Buffer.from([0x00]), b]));
}

// ---------------------------------------------------------------------------
// TimeStampReq builder
// ---------------------------------------------------------------------------

function buildReq(hash: Buffer, nonce: Buffer): Buffer {
  const hashAlg    = encSeq(encOID(SHA256_OID), Buffer.from([0x05, 0x00]));
  const msgImprint = encSeq(hashAlg, encOctetStr(hash));
  return encSeq(encInt(1), msgImprint, encNonce(nonce), encBool(true));
}

// ---------------------------------------------------------------------------
// TimeStampResp parser — extract PKIStatus + TimeStampToken
// ---------------------------------------------------------------------------

function readLen(buf: Buffer, pos: number): { len: number; next: number } {
  const b = buf[pos++];
  if (!(b & 0x80)) return { len: b, next: pos };
  const n = b & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | buf[pos++];
  return { len, next: pos };
}

function extractToken(resp: Buffer): string {
  // TimeStampResp = SEQUENCE { PKIStatusInfo, [TimeStampToken] }
  const { next: outerBody }        = readLen(resp, 1);          // skip outer SEQUENCE tag
  if (resp[outerBody] !== 0x30) throw new Error('TSA: bad PKIStatusInfo tag');
  const { len: pkiLen, next: pkiBody } = readLen(resp, outerBody + 1);
  // PKIStatusInfo body starts with INTEGER (status): tag=0x02, len=0x01, value
  const status = resp[pkiBody + 2];
  if (status !== 0 && status !== 1) throw new Error(`TSA denied request: PKIStatus=${status}`);
  // TimeStampToken starts immediately after PKIStatusInfo
  const tokenStart = pkiBody + pkiLen;
  if (tokenStart >= resp.length) throw new Error('TSA: no TimeStampToken in response');
  return resp.slice(tokenStart).toString('base64');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TstResult { token: string; tsaName: string }

export async function stamp(contentHash: Buffer): Promise<TstResult> {
  const nonce = randomBytes(8);
  const body  = buildReq(contentHash, nonce);
  const res   = await fetch(TSA_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body,
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FreeTSA HTTP ${res.status}`);
  const token = extractToken(Buffer.from(await res.arrayBuffer()));
  return { token, tsaName: 'FreeTSA.org' };
}

/** SHA-256 of a UTF-8 preimage — same input used for HMAC, fed to RFC 3161. */
export function hashContent(preimage: string): Buffer {
  return createHash('sha256').update(preimage, 'utf8').digest();
}

// src/lib/rfc3161-verifier.ts
// RFC 3161 token parser — extracts genTime for display and verified badge.
// Uses byte-level search for GeneralizedTime (tag 0x18, length 15). This tag
// appears exactly once in a TST and encodes "YYYYMMDDHHmmssZ" (always UTC).
//
// TODO: use pkijs to fully validate the CMS SignedData signature against the
// bundled FreeTSA CA cert. That turns "parseable" → "cryptographically verified".
// Install: npm i pkijs  (MIT, ~180KB, used by Let's Encrypt tooling)
// Until then: the openssl command on /audit is the cryptographic proof for readers.
//
// Credits: Mike (arch §rfc3161-verifier)

export interface TstVerifyResult {
  verified:  boolean;   // true = token parseable + genTime found (sig check: TODO)
  timestamp: Date | null;
  tsaName:   string;
}

// ---------------------------------------------------------------------------
// GenTime extraction — single pass over raw DER bytes
// ---------------------------------------------------------------------------

/** Parse GeneralizedTime "YYYYMMDDHHmmssZ" → Date. */
function parseGenTime(s: string): Date {
  return new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T` +
    `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`,
  );
}

/** Scan raw DER for the first GeneralizedTime TLV (tag 0x18, length 15). */
function findGenTime(buf: Buffer): Date | null {
  for (let i = 0; i < buf.length - 17; i++) {
    if (buf[i] !== 0x18 || buf[i + 1] !== 15) continue;
    const s = buf.slice(i + 2, i + 17).toString('ascii');
    if (/^\d{14}Z$/.test(s)) return parseGenTime(s);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a base64-encoded TimeStampToken and extract the embedded timestamp.
 * "verified" = token is parseable and contains a valid genTime.
 * Full CMS signature validation is TODO (see file header).
 *
 * @param base64Token  Raw DER token from timestamp-store, encoded as base64.
 * @param _contentHash Optional: reserved for future pkijs sig verification.
 */
export function verifyToken(base64Token: string, _contentHash?: Buffer): TstVerifyResult {
  try {
    const buf       = Buffer.from(base64Token, 'base64');
    const timestamp = findGenTime(buf);
    return { verified: timestamp !== null, timestamp, tsaName: 'FreeTSA.org' };
  } catch {
    return { verified: false, timestamp: null, tsaName: 'FreeTSA.org' };
  }
}

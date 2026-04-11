// src/lib/ots-client.ts
// OpenTimestamps calendar client — submit hash, upgrade pending proof.
// Binary TLV protocol over HTTP. Zero extra npm dependencies.
// Credits: Mike (arch §ots-client), Peter Todd (OpenTimestamps spec)

import { createHash } from 'crypto';

const OTS_CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
];

const PENDING_TAG  = Buffer.from('83dfe30d2ef90c8e', 'hex');
const OTS_MAGIC    = Buffer.from('\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\x57\x90\x98\x6c\x4f\x94\x23\xd5\x1c\xe1\x4e\xf0\x79', 'binary');

export interface OtsPendingResult  { proofBytes: Buffer; calendarUrl: string; }
export interface OtsUpgradeResult  { proofBytes: Buffer; calendarUrl: string; }

// ---------------------------------------------------------------------------
// Binary helpers
// ---------------------------------------------------------------------------

/** Bitcoin-style varint decoder. Returns { len, next } where next = position after varint. */
export function readVarInt(buf: Buffer, pos: number): { len: number; next: number } {
  const b = buf[pos];
  if (b < 0xfd) return { len: b, next: pos + 1 };
  if (b === 0xfd) return { len: buf.readUInt16LE(pos + 1), next: pos + 3 };
  return { len: buf.readUInt32LE(pos + 1), next: pos + 5 };
}

/** Apply OTS ops chain to `hash`, stopping at attestation (0x00) or end-of-buffer. */
export function applyOps(hash: Buffer, proofBytes: Buffer): Buffer {
  let pos = 0;
  let cur = hash;
  while (pos < proofBytes.length) {
    const tag = proofBytes[pos++];
    if (tag === 0x08) { cur = createHash('sha256').update(cur).digest(); continue; }
    if (tag === 0xf0 || tag === 0xf1) {
      const { len, next } = readVarInt(proofBytes, pos);
      const data = proofBytes.slice(next, next + len);
      pos = next + len;
      cur = tag === 0xf0 ? Buffer.concat([cur, data]) : Buffer.concat([data, cur]);
      continue;
    }
    break; // 0x00 attestation tag or unknown — stop
  }
  return cur;
}

/** Return true if buf at pos starts with the 8-byte PENDING_TAG. */
function isPendingTag(buf: Buffer, pos: number): boolean {
  return pos + 8 <= buf.length && buf.slice(pos, pos + 8).equals(PENDING_TAG);
}

/** Strip the trailing pending attestation (0x00 + PENDING_TAG + payload) from proof bytes. */
export function stripPendingAttestation(proof: Buffer): Buffer {
  for (let i = proof.length - 9; i >= 0; i--) {
    if (proof[i] === 0x00 && isPendingTag(proof, i + 1)) return proof.slice(0, i);
  }
  return proof;
}

// ---------------------------------------------------------------------------
// Calendar HTTP API
// ---------------------------------------------------------------------------

async function postDigest(calendarUrl: string, hash: Buffer): Promise<Buffer> {
  const res = await fetch(`${calendarUrl}/digest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Accept': 'application/vnd.opentimestamps.v1' },
    body: hash,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OTS ${calendarUrl} HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Submit hash to all 3 calendars in parallel; return first success. Returns null if all fail. */
export async function submit(hash: Buffer): Promise<OtsPendingResult | null> {
  const results = await Promise.allSettled(
    OTS_CALENDARS.map(url => postDigest(url, hash).then(bytes => ({ bytes, url }))),
  );
  const ok = results.find(r => r.status === 'fulfilled');
  if (!ok || ok.status !== 'fulfilled') return null;
  return { proofBytes: ok.value.bytes, calendarUrl: ok.value.url };
}

async function fetchUpgrade(calendarUrl: string, commitment: Buffer): Promise<Buffer | null> {
  const url = `${calendarUrl}/timestamp/${commitment.toString('hex')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null; // not yet confirmed — retry later
  if (!res.ok) throw new Error(`OTS upgrade HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Upgrade a pending OTS proof to a confirmed one with Bitcoin block attestation.
 * Returns null if calendar has not yet anchored in Bitcoin (retry on next cron cycle).
 */
export async function upgrade(
  originalHash: Buffer,
  pendingProof: Buffer,
  calendarUrl: string,
): Promise<OtsUpgradeResult | null> {
  const commitment = applyOps(originalHash, pendingProof);
  const upgradedOps = await fetchUpgrade(calendarUrl, commitment).catch(() => null);
  if (!upgradedOps) return null;
  const combined = Buffer.concat([stripPendingAttestation(pendingProof), upgradedOps]);
  return { proofBytes: combined, calendarUrl };
}

/**
 * Wrap proof bytes in a DetachedTimestampFile envelope.
 * Produces bytes compatible with the opentimestamps.org web verifier.
 */
export function serializeDetachedFile(hash: Buffer, proofBytes: Buffer): Buffer {
  // Format: magic (31B) + version (1B=0x01) + fileHashOp (1B=0x08/sha256) + hash (32B) + ops
  return Buffer.concat([OTS_MAGIC, Buffer.from([0x01, 0x08]), hash, proofBytes]);
}

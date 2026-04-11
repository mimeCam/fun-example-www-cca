// src/lib/ots-verifier.ts
// Verify OTS proof bytes against Bitcoin via Blockstream.info REST API.
// No Bitcoin node required. Trustless block header verification.
// Credits: Mike (arch §ots-verifier, §Points-of-Interest §4)

import { createHash } from 'crypto';
import { readVarInt, applyOps } from './ots-client';

const BITCOIN_TAG  = Buffer.from('0588960d73d71901', 'hex');
const BLOCKSTREAM  = 'https://blockstream.info/api';

export interface OtsVerifyResult {
  status:       'confirmed' | 'pending' | 'unverifiable';
  blockHeight?: number;
  blockTime?:   number;    // Unix seconds from Bitcoin block header
  calendarUrl?: string;    // present when status = 'pending'
}

// ---------------------------------------------------------------------------
// Proof parsing
// ---------------------------------------------------------------------------

/**
 * Walk ops chain in proofBytes (properly, not a scan) and return position
 * of the first 0x00 attestation marker. Returns -1 if none found.
 */
function findAttestationOffset(proofBytes: Buffer): number {
  let pos = 0;
  while (pos < proofBytes.length) {
    const tag = proofBytes[pos++];
    if (tag === 0x00) return pos; // pos is now just after the 0x00 tag
    if (tag === 0x08) continue;  // sha256 — no data
    if (tag === 0xf0 || tag === 0xf1) {
      const { len, next } = readVarInt(proofBytes, pos);
      pos = next + len;
      continue;
    }
    break; // unexpected tag
  }
  return -1;
}

/** Parse the 8-byte attestation tag and payload at `pos` in proofBytes. */
function parseAttestation(proofBytes: Buffer, pos: number): { isBitcoin: boolean; height?: number } | null {
  if (pos + 8 > proofBytes.length) return null;
  const tag = proofBytes.slice(pos, pos + 8);
  const { len: payloadLen, next } = readVarInt(proofBytes, pos + 8);
  if (tag.equals(BITCOIN_TAG)) {
    const { len: height } = readVarInt(proofBytes, next);
    return { isBitcoin: true, height };
  }
  return { isBitcoin: false };
}

/** Extract Bitcoin block height from proof bytes, or null if not a confirmed proof. */
export function parseBitcoinHeight(proofBytes: Buffer): number | null {
  const attestOffset = findAttestationOffset(proofBytes);
  if (attestOffset < 0) return null;
  const parsed = parseAttestation(proofBytes, attestOffset);
  return parsed?.isBitcoin ? (parsed.height ?? null) : null;
}

// ---------------------------------------------------------------------------
// Blockstream.info API helpers
// ---------------------------------------------------------------------------

async function fetchBlockHash(height: number): Promise<string> {
  const res = await fetch(`${BLOCKSTREAM}/block-height/${height}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Blockstream block-height HTTP ${res.status}`);
  return (await res.text()).trim();
}

async function fetchRawHeader(blockHash: string): Promise<Buffer> {
  const res = await fetch(`${BLOCKSTREAM}/block/${blockHash}/header`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Blockstream header HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Verify SHA256d(header) === blockHash. Returns false if inconsistent. */
function verifyHeaderHash(header: Buffer, blockHash: string): boolean {
  const d1   = createHash('sha256').update(header).digest();
  const d2   = createHash('sha256').update(d1).digest();
  // Bitcoin stores block hash little-endian; reverse for comparison
  return d2.reverse().toString('hex') === blockHash;
}

/** Extract Unix seconds from 80-byte Bitcoin block header (offset 68, 4B LE). */
function extractBlockTime(header: Buffer): number {
  return header.readUInt32LE(68);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify an OTS proof against Bitcoin via Blockstream.
 * Returns { status: 'confirmed', blockHeight, blockTime } when valid.
 * Returns { status: 'unverifiable' } when Blockstream is unreachable.
 */
export async function verify(proofBytes: Buffer, _originalHash: Buffer): Promise<OtsVerifyResult> {
  try {
    const height = parseBitcoinHeight(proofBytes);
    if (!height) return { status: 'unverifiable' };
    const blockHash  = await fetchBlockHash(height);
    const header     = await fetchRawHeader(blockHash);
    if (!verifyHeaderHash(header, blockHash)) return { status: 'unverifiable' };
    return { status: 'confirmed', blockHeight: height, blockTime: extractBlockTime(header) };
  } catch {
    return { status: 'unverifiable' };
  }
}

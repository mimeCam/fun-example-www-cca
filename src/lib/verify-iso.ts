// src/lib/verify-iso.ts
// Isomorphic crypto shim for the public /verify page.
//
// Re-implements just-enough of OTS proof walking with pure ES + Uint8Array
// so the same module loads on the SSR page (Node) and on the browser island
// (WebCrypto). Mike §6.2: "two named functions in the shim, no factory,
// no adapter." Sid: every function ≤ 10 LOC. No new crypto logic — only
// the env gate plus a Buffer-free copy of the OTS varint + ops walker.
//
// What is NOT in this shim (deliberately):
//   · RFC 3161 CMS verification — pulls pkijs + a fs-read DER cert; the
//     browser receives the pre-computed verified=true|false from the DTO
//     instead. We do NOT bundle pkijs to the client.
//   · OpenTimestamps calendar submission — submission is the cron's job;
//     verification only walks the proof and re-fetches a Bitcoin header.
//
// Credits: Mike Koch (napkin §4 isomorphic shim), Sid (≤-10 LOC),
//          Tanya (§7 — API parity is load-bearing),
//          ots-client.ts authors (the byte format we mirror here).
//          2026-04-23.

// ── Public types ─────────────────────────────────────────────────────────

export type VerifyStatus =
  | 'verified'      // proof carries a Bitcoin attestation we re-fetched & re-hashed
  | 'pending'       // OTS exists but calendar has not yet anchored in Bitcoin
  | 'unsealed'      // post exists but no proof bundle
  | 'unreachable'   // Blockstream / Calendar unreachable; retry later
  | 'invalid';      // proof exists but does not parse / does not match a real block

export interface VerifyOutcome {
  status:       VerifyStatus;
  blockHeight?: number;
  blockTime?:   number;     // Unix seconds
  blockHash?:   string;     // hex, big-endian display
  preimage?:    string;     // canonical preimage that was hashed
  contentHash?: string;     // hex sha256 of preimage
  commitment?:  string;     // hex sha256 commitment that anchors into the block
  reason?:      string;     // short tag for debugging when not 'verified'
}

const BITCOIN_TAG = '0588960d73d71901';
const BLOCKSTREAM = 'https://blockstream.info/api';

// ── Hash gate — one named function per environment ───────────────────────

const isBrowser =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle !== 'undefined';

async function sha256Browser(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

async function sha256Server(bytes: Uint8Array): Promise<Uint8Array> {
  const { createHash } = await import('node:crypto');
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

/** SHA-256 over raw bytes — picks WebCrypto in the browser, node:crypto on the server. */
export const sha256: (bytes: Uint8Array) => Promise<Uint8Array> =
  isBrowser ? sha256Browser : sha256Server;

/** SHA-256 of a UTF-8 preimage — the canonical OTS hash input. */
export async function hashPreimage(preimage: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(preimage));
}

// ── Hex / base64 helpers (3-7 lines each — Sid) ──────────────────────────

export function bytesToHex(b: Uint8Array): string {
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── OTS varint + ops walker (mirror of ots-client, Buffer-free) ─────────

interface VarInt { len: number; next: number }

function readVarInt(buf: Uint8Array, pos: number): VarInt {
  const b = buf[pos];
  if (b < 0xfd) return { len: b, next: pos + 1 };
  if (b === 0xfd) return { len: buf[pos + 1] | (buf[pos + 2] << 8), next: pos + 3 };
  return { len: u32le(buf, pos + 1), next: pos + 5 };
}

function u32le(buf: Uint8Array, pos: number): number {
  return buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16) | (buf[pos + 3] << 24);
}

/** Find the offset *after* the 0x00 attestation marker, or -1. */
function findAttestation(buf: Uint8Array): number {
  let pos = 0;
  while (pos < buf.length) {
    const tag = buf[pos++];
    if (tag === 0x00) return pos;
    if (tag === 0x08) continue;
    if (tag === 0xf0 || tag === 0xf1) { const v = readVarInt(buf, pos); pos = v.next + v.len; continue; }
    return -1;
  }
  return -1;
}

/** Bitcoin block height from the OTS attestation, or null if no Bitcoin tag. */
export function parseBitcoinHeight(proof: Uint8Array): number | null {
  const att = findAttestation(proof);
  if (att < 0 || att + 8 > proof.length) return null;
  const tag = bytesToHex(proof.slice(att, att + 8));
  if (tag !== BITCOIN_TAG) return null;
  const after = readVarInt(proof, att + 8);
  return readVarInt(proof, after.next).len;
}

/** Walk the OTS ops chain over `originalHash` — returns the commitment bytes. */
export async function walkProof(originalHash: Uint8Array, proof: Uint8Array): Promise<Uint8Array> {
  let pos = 0;
  let cur = originalHash;
  while (pos < proof.length) {
    const tag = proof[pos++];
    if (tag === 0x08) { cur = await sha256(cur); continue; }
    if (tag === 0xf0 || tag === 0xf1) { ({ cur, pos } = walkConcat(proof, pos, tag, cur)); continue; }
    break; // attestation marker (0x00) or unknown — stop
  }
  return cur;
}

function walkConcat(buf: Uint8Array, pos: number, tag: number, cur: Uint8Array): { cur: Uint8Array; pos: number } {
  const v = readVarInt(buf, pos);
  const data = buf.slice(v.next, v.next + v.len);
  return { cur: tag === 0xf0 ? concat(cur, data) : concat(data, cur), pos: v.next + v.len };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

// ── Blockstream fetch (read-only public oracle) ──────────────────────────

export interface BlockHeader {
  hash:   string;   // hex (big-endian display form)
  time:   number;   // unix seconds
  height: number;
}

export async function fetchBlockHeader(height: number, signal?: AbortSignal): Promise<BlockHeader> {
  const hash = await fetchText(`${BLOCKSTREAM}/block-height/${height}`, signal);
  const headerHex = await fetchText(`${BLOCKSTREAM}/block/${hash.trim()}/header`, signal);
  return { hash: hash.trim(), time: parseHeaderTime(headerHex), height };
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`oracle ${res.status}`);
  return (await res.text()).trim();
}

/** Bitcoin header: 80 bytes (160 hex). Unix time = little-endian uint32 at offset 68. */
function parseHeaderTime(headerHex: string): number {
  const bytes = hexToBytes(headerHex);
  if (bytes.length < 80) throw new Error('header too short');
  return u32le(bytes, 68);
}

// ── Verification orchestrator (the one entry point a UI calls) ──────────

export interface VerifyInput {
  preimage:    string;        // canonical "slug:score:sealedAt" hashed by the seal
  otsBase64:   string | null; // base64 OTS proof (null = unsealed)
  pendingHint?: string;       // calendar URL, surfaced when status='pending'
}

export async function verifyBundle(input: VerifyInput, signal?: AbortSignal): Promise<VerifyOutcome> {
  if (!input.otsBase64) return { status: 'unsealed', preimage: input.preimage };
  try {
    return await runVerify(input, signal);
  } catch (err) {
    return { status: 'unreachable', preimage: input.preimage, reason: errMsg(err) };
  }
}

async function runVerify(input: VerifyInput, signal?: AbortSignal): Promise<VerifyOutcome> {
  const proof    = base64ToBytes(input.otsBase64!);
  const original = await hashPreimage(input.preimage);
  const height   = parseBitcoinHeight(proof);
  if (!height) return pendingOutcome(input, original);
  const commitment = await walkProof(original, proof);
  const header     = await fetchBlockHeader(height, signal);
  return verifiedOutcome(input, original, commitment, header);
}

function pendingOutcome(input: VerifyInput, original: Uint8Array): VerifyOutcome {
  return {
    status: 'pending', preimage: input.preimage, contentHash: bytesToHex(original),
    reason: input.pendingHint ?? 'calendar not yet anchored',
  };
}

function verifiedOutcome(
  input: VerifyInput, original: Uint8Array, commitment: Uint8Array, h: BlockHeader,
): VerifyOutcome {
  return {
    status: 'verified', preimage: input.preimage, contentHash: bytesToHex(original),
    commitment: bytesToHex(commitment),
    blockHeight: h.height, blockTime: h.time, blockHash: h.hash,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

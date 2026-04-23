// src/lib/verdict-resolver.ts
// Runtime verdict sealing — the closing HMAC in the accountability loop.
// Mirrors conviction-ledger.ts pattern: one write path, idempotency guard.
// HMAC-SHA256(secret, slug:verdict:originalScore:timestamp) proves server wrote it.
// Credits: Mike (architecture spec §verdict-resolution)

import Database from 'better-sqlite3';
import { createHash, createHmac } from 'crypto';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { getLockedScore } from './conviction-ledger';
import { getDisputeResolution, getResolvedVerdictCount as _getResolvedCount } from './verdict-dispute';
// 2026-04-23 ledger wedge (v173, Sid): seal stamp reads from the seam.
import { now as clockNow } from './clock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerdictOutcome = 'still-true' | 'evolved' | 'wrong' | 'abandoned';

/**
 * Full lifecycle state of a post's verdict + community dispute outcome.
 * Mike §1 state machine: unaudited → pending → contested → upheld | overturned.
 */
export type VerdictState = 'unaudited' | 'pending' | 'contested' | 'upheld' | 'overturned';

export interface VerdictTransition {
  slug:              string;
  from:              VerdictState;
  to:                VerdictState;
  resolvedAt:        number;
  challengeSharePct: number;
}

export interface VerdictRecord {
  post_slug:    string;
  verdict:      VerdictOutcome;
  originalScore: number;
  note:         string;
  hmac_seal:    string;
  sealedAt:     number;
  /** Chain hash of the verdict row — needed by RFC 3161 TST store. */
  hash:         string;
}

export class VerdictAlreadySealedError extends Error {
  constructor(slug: string) {
    super(`Verdict already sealed: ${slug}`);
    this.name = 'VerdictAlreadySealedError';
  }
}

// ---------------------------------------------------------------------------
// DB — opens same revivals.db as conviction-ledger (WAL mode)
// ---------------------------------------------------------------------------

const VERDICT_INSERT_SQL = `
  INSERT INTO conviction_ledger
    (post_slug, event_type, conviction_score, author_note, revival_count,
     reader_seconds, payload_json, timestamp, prev_hash, hash, hmac_seal)
  VALUES (?, 'verdict', ?, ?, 0, 0, ?, ?, ?, ?, ?)
`;

let _db: Database.Database | null = null;

function dbPath(): string {
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL');
  return _db;
}

// ---------------------------------------------------------------------------
// Helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

function hasExistingVerdict(slug: string): boolean {
  const row = db()
    .prepare("SELECT id FROM conviction_ledger WHERE post_slug = ? AND event_type = 'verdict' LIMIT 1")
    .get(slug);
  return !!row;
}

function prevHashForSlug(slug: string): string {
  const row = db()
    .prepare('SELECT hash FROM conviction_ledger WHERE post_slug = ? ORDER BY id DESC LIMIT 1')
    .get(slug) as { hash: string } | undefined;
  return row?.hash ?? '0'.repeat(64);
}

function computeChainHash(slug: string, ts: number, prevHash: string): string {
  const raw = `${slug}:verdict:${ts}:${prevHash}`;
  return createHash('sha256').update(raw).digest('hex');
}

function computeHmac(slug: string, verdict: string, score: number, ts: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${slug}:${verdict}:${score}:${ts}`)
    .digest('hex');
}

function insertVerdictRow(
  slug: string, verdict: VerdictOutcome, score: number, note: string,
  ts: number, hmac: string,
): string {
  const prevHash = prevHashForSlug(slug);
  const hash     = computeChainHash(slug, ts, prevHash);
  db().prepare(VERDICT_INSERT_SQL)
    .run(slug, score, note, JSON.stringify({ verdict, note }), ts, prevHash, hash, hmac);
  return hash;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seal a final verdict for a post at runtime.
 * Idempotent-guarded: throws VerdictAlreadySealedError if already sealed.
 * Requires ADMIN_SECRET — never call this from client-side code.
 */
export function resolveVerdict(
  slug: string,
  verdict: VerdictOutcome,
  note: string,
  secret: string,
): VerdictRecord {
  if (hasExistingVerdict(slug)) throw new VerdictAlreadySealedError(slug);
  const originalScore = getLockedScore(slug) ?? 0;
  const ts   = clockNow();
  const hmac = computeHmac(slug, verdict, originalScore, ts, secret);
  const hash = insertVerdictRow(slug, verdict, originalScore, note, ts, hmac);
  return { post_slug: slug, verdict, originalScore, note, hmac_seal: hmac, sealedAt: ts, hash };
}

/** Build a VerdictRecord from a raw conviction_ledger row. */
export function rowToVerdictRecord(row: {
  post_slug:        string;
  conviction_score: number | null;
  payload_json:     string | null;
  timestamp:        number;
  hmac_seal:        string | null;
  hash?:            string;
}): VerdictRecord {
  const payload = row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : {};
  return {
    post_slug:     row.post_slug,
    verdict:       (payload.verdict as VerdictOutcome) ?? 'wrong',
    originalScore: row.conviction_score ?? 0,
    note:          (payload.note as string) ?? '',
    hmac_seal:     row.hmac_seal ?? '',
    sealedAt:      row.timestamp,
    hash:          row.hash ?? '',
  };
}

// ---------------------------------------------------------------------------
// Public read — single-slug lookup for the ceremony page
// ---------------------------------------------------------------------------

/**
 * Retrieve the sealed verdict record for a slug.
 * Returns null if the verdict has not been resolved yet.
 * Read-only: never writes; safe to call from any SSR route.
 */
export function getVerdictRecord(slug: string): VerdictRecord | null {
  const row = db()
    .prepare(
      "SELECT post_slug, conviction_score, payload_json, timestamp, hmac_seal, hash " +
      "FROM conviction_ledger WHERE post_slug = ? AND event_type = 'verdict' LIMIT 1",
    )
    .get(slug) as Parameters<typeof rowToVerdictRecord>[0] | undefined;
  return row ? rowToVerdictRecord(row) : null;
}

// ---------------------------------------------------------------------------
// Public — verdict state machine reads
// ---------------------------------------------------------------------------

/**
 * Compute the full VerdictState for a post.
 * Combines sealed verdict + community dispute resolution into one value.
 * Read-only: safe to call from any SSR route.
 */
export function getVerdictState(slug: string): VerdictState {
  const verdict = getVerdictRecord(slug);
  if (!verdict) return 'unaudited';
  const resolution = getDisputeResolution(slug);
  if (!resolution) return 'pending';       // verdict sealed, window still open
  return resolution.state;                 // 'upheld' or 'overturned'
}

/**
 * Count posts with a final community verdict resolution.
 * BattingAverageHero gate: hide % until ≥3 resolved verdicts (Mike §4).
 */
export function getResolvedVerdictCount(): number {
  return _getResolvedCount();
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testVerdictResolver(): void {
  console.assert(
    new VerdictAlreadySealedError('x').name === 'VerdictAlreadySealedError',
    'error name correct',
  );
  const fakeRow = { post_slug: 'x', conviction_score: 8, payload_json: '{"verdict":"still-true","note":"yes"}', timestamp: 1000, hmac_seal: 'abc' };
  const rec = rowToVerdictRecord(fakeRow);
  console.assert(rec.verdict === 'still-true', 'verdict parsed');
  console.assert(rec.originalScore === 8, 'score preserved');
  console.log('[verdict-resolver] utility OK');
}

// src/lib/conviction-ledger.ts
// Append-only hash-chained ledger for author conviction scores.
// One event schema. One hash function. One write path. No polymorphism.
// Credits: Mike (architecture spec), DevBrain (SQLite audit trail patterns)

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LedgerEventType = 'seal' | 'revival' | 'death' | 'resurrection';

export interface LedgerEntry {
  id: number;
  post_slug: string;
  event_type: LedgerEventType;
  conviction_score: number | null;
  author_note: string | null;
  revival_count: number;
  reader_seconds: number;
  payload_json: string | null;
  timestamp: number;
  prev_hash: string;
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  entries: LedgerEntry[];
  brokenAt?: number;
}

export class ConvictionAlreadySealedError extends Error {
  constructor(slug: string) {
    super(`Conviction already sealed: ${slug}`);
    this.name = 'ConvictionAlreadySealedError';
  }
}

// ---------------------------------------------------------------------------
// DB singleton — opens the same revivals.db as collectiveMemory (WAL mode)
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0'.repeat(64);

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
  initTable(_db);
  return _db;
}

function initTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS conviction_ledger (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      post_slug        TEXT    NOT NULL,
      event_type       TEXT    NOT NULL,
      conviction_score INTEGER,
      author_note      TEXT,
      revival_count    INTEGER DEFAULT 0,
      reader_seconds   INTEGER DEFAULT 0,
      payload_json     TEXT,
      timestamp        INTEGER NOT NULL,
      prev_hash        TEXT    NOT NULL,
      hash             TEXT    NOT NULL UNIQUE,
      CHECK (event_type != 'seal' OR conviction_score IS NOT NULL)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_ledger_slug ON conviction_ledger(post_slug, id);
  `);
}

// ---------------------------------------------------------------------------
// Hash computation — SHA-256(slug:event:score:timestamp:prevHash)
// ---------------------------------------------------------------------------

function computeHash(
  slug: string,
  eventType: string,
  score: number | null,
  timestamp: number,
  prevHash: string,
): string {
  const raw = `${slug}:${eventType}:${score ?? ''}:${timestamp}:${prevHash}`;
  return createHash('sha256').update(raw).digest('hex');
}

function prevHashForSlug(slug: string): string {
  const row = db()
    .prepare('SELECT hash FROM conviction_ledger WHERE post_slug = ? ORDER BY id DESC LIMIT 1')
    .get(slug) as { hash: string } | undefined;
  return row?.hash ?? GENESIS_HASH;
}

// ---------------------------------------------------------------------------
// Core insert — single write path for all events
// ---------------------------------------------------------------------------

function buildChainParams(
  slug: string,
  eventType: LedgerEventType,
  score: number | null,
  payload: object | null,
): { ts: number; prevHash: string; hash: string; payloadJson: string | null } {
  const ts = Date.now();
  const prevHash = prevHashForSlug(slug);
  const hash = computeHash(slug, eventType, score, ts, prevHash);
  return { ts, prevHash, hash, payloadJson: payload ? JSON.stringify(payload) : null };
}

function runInsert(
  slug: string,
  eventType: LedgerEventType,
  score: number | null,
  authorNote: string | null,
  revivalCount: number,
  readerSeconds: number,
  payloadJson: string | null,
  ts: number,
  prevHash: string,
  hash: string,
): void {
  db().prepare(`
    INSERT INTO conviction_ledger
      (post_slug, event_type, conviction_score, author_note, revival_count,
       reader_seconds, payload_json, timestamp, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, eventType, score, authorNote, revivalCount, readerSeconds,
         payloadJson, ts, prevHash, hash);
}

function insertEvent(
  slug: string,
  eventType: LedgerEventType,
  score: number | null,
  authorNote: string | null,
  revivalCount: number,
  readerSeconds: number,
  payload: object | null,
): LedgerEntry {
  const { ts, prevHash, hash, payloadJson } = buildChainParams(slug, eventType, score, payload);
  runInsert(slug, eventType, score, authorNote, revivalCount, readerSeconds, payloadJson, ts, prevHash, hash);
  return db().prepare('SELECT * FROM conviction_ledger WHERE hash = ?').get(hash) as LedgerEntry;
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/**
 * Seal the conviction score at publish time.
 * Idempotent-guarded: throws ConvictionAlreadySealedError if already sealed.
 * This is the hard wall — no bypass path.
 */
export function sealConviction(slug: string, score: number, authorNote: string): LedgerEntry {
  const existing = db()
    .prepare("SELECT id FROM conviction_ledger WHERE post_slug = ? AND event_type = 'seal'")
    .get(slug);
  if (existing) throw new ConvictionAlreadySealedError(slug);
  return insertEvent(slug, 'seal', score, authorNote, 0, 0, null);
}

/**
 * Append a resonance event (revival | death | resurrection) to the chain.
 * Called from api/revive.ts and api/entomb.ts — never called with 'seal'.
 */
export function appendResonance(
  slug: string,
  eventType: Exclude<LedgerEventType, 'seal'>,
  payload: { revivalCount?: number; readerSeconds?: number; [key: string]: unknown },
): LedgerEntry {
  const revivalCount = payload.revivalCount ?? 0;
  const readerSeconds = payload.readerSeconds ?? 0;
  return insertEvent(slug, eventType, null, null, revivalCount, readerSeconds, payload);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** Verify the hash chain for a slug. O(n) scan — fast for <100 entries per post. */
export function verifyChain(slug: string): ChainVerification {
  const entries = db()
    .prepare('SELECT * FROM conviction_ledger WHERE post_slug = ? ORDER BY id ASC')
    .all(slug) as LedgerEntry[];
  if (!entries.length) return { valid: true, entries };

  let prevHash = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expected = computeHash(e.post_slug, e.event_type, e.conviction_score, e.timestamp, prevHash);
    if (expected !== e.hash || e.prev_hash !== prevHash) return { valid: false, entries, brokenAt: i };
    prevHash = e.hash;
  }
  return { valid: true, entries };
}

/**
 * Returns the immutable sealed score for a slug, or null if not yet sealed.
 * Decay engine uses this instead of frontmatter — null = fall back to frontmatter.
 */
export function getLockedScore(slug: string): number | null {
  const row = db()
    .prepare("SELECT conviction_score FROM conviction_ledger WHERE post_slug = ? AND event_type = 'seal'")
    .get(slug) as { conviction_score: number } | undefined;
  return row?.conviction_score ?? null;
}

/** Get the seal entry for a slug (null if post has not been sealed). */
export function getSealEntry(slug: string): LedgerEntry | null {
  const row = db()
    .prepare("SELECT * FROM conviction_ledger WHERE post_slug = ? AND event_type = 'seal'")
    .get(slug) as LedgerEntry | undefined;
  return row ?? null;
}

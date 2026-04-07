// src/lib/conviction-ledger.ts
// Append-only ledger for author conviction scores.
// One event schema. One hash function. One write path. No polymorphism.
// Credits: Mike (architecture spec), DevBrain (SQLite audit trail patterns)
//
// HMAC seal (2026-04-07): dropped SHA-256 chain display (Elon's call — it was
// blockchain cosplay with no external anchor). Replaced with HMAC-based seal:
// proves the server wrote it, nothing more, nothing less.

import Database from 'better-sqlite3';
import { createHash, createHmac } from 'crypto';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LedgerEventType = 'seal' | 'revival' | 'death' | 'resurrection' | 'verdict';

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
  hmac_seal: string | null;
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
  // Migrate: add hmac_seal column for honest server-side seal verification.
  // Nullable — old rows have null, new seals carry the HMAC.
  try {
    d.exec(`ALTER TABLE conviction_ledger ADD COLUMN hmac_seal TEXT DEFAULT NULL`);
  } catch {
    // Column already exists — safe to ignore.
  }
  // Migrate: anchor columns for external Gist tamper-evidence (2026-04-07).
  // Nullable — rows sealed before this feature ships carry null (pre-anchor era).
  try {
    d.exec(`ALTER TABLE conviction_ledger ADD COLUMN anchor_gist_id TEXT DEFAULT NULL`);
  } catch { /* already exists */ }
  try {
    d.exec(`ALTER TABLE conviction_ledger ADD COLUMN anchor_url TEXT DEFAULT NULL`);
  } catch { /* already exists */ }
  try {
    d.exec(`ALTER TABLE conviction_ledger ADD COLUMN anchor_raw_url TEXT DEFAULT NULL`);
  } catch { /* already exists */ }
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

/** HMAC seal: proves the server wrote this entry at this time.
 *  Not a blockchain — just an honest server signature. */
function hmacSeal(slug: string, score: number, timestamp: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${slug}:${score}:${timestamp}`)
    .digest('hex');
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
  hmac: string | null,
): void {
  db().prepare(`
    INSERT INTO conviction_ledger
      (post_slug, event_type, conviction_score, author_note, revival_count,
       reader_seconds, payload_json, timestamp, prev_hash, hash, hmac_seal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, eventType, score, authorNote, revivalCount, readerSeconds,
         payloadJson, ts, prevHash, hash, hmac);
}

function insertEvent(
  slug: string,
  eventType: LedgerEventType,
  score: number | null,
  authorNote: string | null,
  revivalCount: number,
  readerSeconds: number,
  payload: object | null,
  hmac: string | null = null,
): LedgerEntry {
  const { ts, prevHash, hash, payloadJson } = buildChainParams(slug, eventType, score, payload);
  runInsert(slug, eventType, score, authorNote, revivalCount, readerSeconds, payloadJson, ts, prevHash, hash, hmac);
  return db().prepare('SELECT * FROM conviction_ledger WHERE hash = ?').get(hash) as LedgerEntry;
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/**
 * Seal the conviction score at publish time.
 * Idempotent-guarded: throws ConvictionAlreadySealedError if already sealed.
 * Attaches HMAC proof using ADMIN_SECRET (server-side only — never in HTML).
 */
export function sealConviction(slug: string, score: number, authorNote: string): LedgerEntry {
  const existing = db()
    .prepare("SELECT id FROM conviction_ledger WHERE post_slug = ? AND event_type = 'seal'")
    .get(slug);
  if (existing) throw new ConvictionAlreadySealedError(slug);
  // Compute HMAC if ADMIN_SECRET is set; null otherwise (CLI fallback).
  const secret = process.env.ADMIN_SECRET ?? '';
  const ts = Date.now();
  const hmac = secret ? hmacSeal(slug, score, ts, secret) : null;
  // Use a fixed timestamp so HMAC and chain hash share the same ts.
  const prevHash = prevHashForSlug(slug);
  const hash = computeHash(slug, 'seal', score, ts, prevHash);
  runInsert(slug, 'seal', score, authorNote, 0, 0, null, ts, prevHash, hash, hmac);
  return db().prepare('SELECT * FROM conviction_ledger WHERE hash = ?').get(hash) as LedgerEntry;
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

/**
 * Returns all ledger entries for a slug in chronological order.
 * Used by ConvictionAuditTrail — no chain verification (dropped: Elon §blockchain cosplay).
 */
export function getEntriesForSlug(slug: string): LedgerEntry[] {
  return db()
    .prepare('SELECT * FROM conviction_ledger WHERE post_slug = ? ORDER BY id ASC')
    .all(slug) as LedgerEntry[];
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

// ---------------------------------------------------------------------------
// Anchor read/write — external Gist tamper-evidence
// ---------------------------------------------------------------------------

/** Persist Gist anchor data on the conviction seal row (identified by chain hash). */
export function updateAnchor(hash: string, gistId: string, url: string, rawUrl: string): void {
  db().prepare(`
    UPDATE conviction_ledger
    SET anchor_gist_id = ?, anchor_url = ?, anchor_raw_url = ?
    WHERE hash = ?
  `).run(gistId, url, rawUrl, hash);
}

/** Return anchor data for the seal row of a slug, or null if not yet anchored. */
export function getAnchorData(slug: string): { gistId: string; url: string; rawUrl: string } | null {
  const row = db()
    .prepare("SELECT anchor_gist_id, anchor_url, anchor_raw_url FROM conviction_ledger WHERE post_slug = ? AND event_type = 'seal'")
    .get(slug) as { anchor_gist_id: string | null; anchor_url: string | null; anchor_raw_url: string | null } | undefined;
  if (!row?.anchor_gist_id || !row.anchor_url) return null;
  return { gistId: row.anchor_gist_id, url: row.anchor_url, rawUrl: row.anchor_raw_url ?? '' };
}

/** Convenience read: returns just the Gist ID for verdict append calls. */
export function getAnchorGistId(slug: string): string | null {
  return getAnchorData(slug)?.gistId ?? null;
}

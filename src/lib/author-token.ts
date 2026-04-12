// src/lib/author-token.ts
// Single-use HMAC capability tokens for self-service conviction sealing.
// token = HMAC(HMAC_SECRET, `${authorSlug}:${postSlug}:${nonce}:${expiryEpoch}`)
// Nonce stored in author_tokens for single-use replay prevention.
// Credits: Mike (architecture spec), DevBrain (capability token pattern)

import Database from 'better-sqlite3';
import { createHmac, randomBytes, createHash } from 'crypto';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// DB singleton — same revivals.db file, WAL mode, separate connection
// ---------------------------------------------------------------------------

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
  initTokenTable(_db);
  return _db;
}

function initTokenTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS author_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash  TEXT    NOT NULL UNIQUE,
      author_slug TEXT    NOT NULL,
      post_slug   TEXT    NOT NULL,
      expires_at  INTEGER NOT NULL,
      used_at     INTEGER DEFAULT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_author_tokens_hash ON author_tokens(token_hash);
  `);
}

// ---------------------------------------------------------------------------
// Crypto helpers — each ≤ 5 lines
// ---------------------------------------------------------------------------

function hmacSecret(): string {
  return process.env.HMAC_SECRET ?? 'dev-hmac-secret';
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function signToken(authorSlug: string, postSlug: string, nonce: string, expiryEpoch: number): string {
  const payload = `${authorSlug}:${postSlug}:${nonce}:${expiryEpoch}`;
  return createHmac('sha256', hmacSecret()).update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TokenResult {
  token:     string;
  expiresAt: number;
}

/** Issue a single-use 15-minute capability token for the given author/post pair. */
export function issueToken(authorSlug: string, postSlug: string): TokenResult {
  const nonce     = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const token     = signToken(authorSlug, postSlug, nonce, expiresAt);
  db()
    .prepare('INSERT INTO author_tokens (token_hash, author_slug, post_slug, expires_at) VALUES (?,?,?,?)')
    .run(hashToken(token), authorSlug, postSlug, expiresAt);
  return { token, expiresAt };
}

interface TokenRow {
  token_hash:  string;
  author_slug: string;
  post_slug:   string;
  expires_at:  number;
  used_at:     number | null;
}

function loadRow(token: string): TokenRow | undefined {
  return db()
    .prepare('SELECT * FROM author_tokens WHERE token_hash = ?')
    .get(hashToken(token)) as TokenRow | undefined;
}

function markUsed(tokenHash: string): void {
  db()
    .prepare('UPDATE author_tokens SET used_at = ? WHERE token_hash = ?')
    .run(Date.now(), tokenHash);
}

function rowValid(row: TokenRow, authorSlug: string, postSlug: string): boolean {
  return (
    row.used_at    === null          &&
    row.expires_at  >  Date.now()   &&
    row.author_slug === authorSlug  &&
    row.post_slug   === postSlug
  );
}

/**
 * Validate and atomically consume a token.
 * Returns false if token is unknown, expired, already used, or slug mismatch.
 */
export function validateAndConsume(token: string, authorSlug: string, postSlug: string): boolean {
  const row = loadRow(token);
  if (!row || !rowValid(row, authorSlug, postSlug)) return false;
  markUsed(row.token_hash);
  return true;
}

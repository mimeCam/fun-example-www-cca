// src/lib/communityPosts.ts
// DB layer for community (user-submitted) posts.
// Mirrors the collectiveMemory.ts singleton pattern — same revivals.db file,
// separate connection (WAL mode supports multiple readers/writers in-process).
// All functions are synchronous (better-sqlite3 contract).

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Lazy DB singleton
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

/** Resolve the DB file location. `COMMUNITY_DB_PATH` env overrides (e.g.
 *  `:memory:` for the journey-witness guard — see scripts/check-user-journey.ts
 *  and src/lib/journey-witness.ts). Unset → default `data/revivals.db`. */
function dbPath(): string {
  const override = process.env.COMMUNITY_DB_PATH;
  if (override) return override;
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath());
  if (dbPath() !== ':memory:') _db.pragma('journal_mode = WAL');
  ensureTable(_db);
  return _db;
}

/** Drop the cached handle — lets a test re-open against a new DB_PATH env.
 *  Never called from production code paths; gated for journey-witness reuse. */
export function resetCommunityPostsDb(): void {
  if (_db) { try { _db.close(); } catch { /* already closed */ } }
  _db = null;
}

function ensureTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT    UNIQUE NOT NULL,
      title        TEXT    NOT NULL,
      body         TEXT    NOT NULL,
      author_label TEXT,
      pow_nonce    INTEGER NOT NULL,
      pow_hash     TEXT    NOT NULL,
      submitted_at TEXT    NOT NULL DEFAULT (datetime('now')),
      status       TEXT    NOT NULL DEFAULT 'live'
    );
    CREATE INDEX IF NOT EXISTS idx_community_posts_status
      ON community_posts(status);
  `);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Community posts decay twice as fast as blog posts (180d vs 365d).
 *  Faster decay increases revival urgency — the product's emotional core. */
export const COMMUNITY_MAX_DAYS = 180;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommunityPost {
  id: number;
  slug: string;
  title: string;
  body: string;
  author_label: string | null;
  pow_nonce: number;
  pow_hash: string;
  submitted_at: string;
  status: string;
}

export interface InsertPostData {
  slug: string;
  title: string;
  body: string;
  author_label?: string | null;
  pow_nonce: number;
  pow_hash: string;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Insert a new community post; returns the created row. */
export function insertPost(data: InsertPostData): CommunityPost {
  const stmt = db().prepare(`
    INSERT INTO community_posts (slug, title, body, author_label, pow_nonce, pow_hash)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(
    data.slug, data.title, data.body,
    data.author_label ?? null, data.pow_nonce, data.pow_hash,
  ) as CommunityPost;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** All live posts, newest first. */
export function getLivePosts(): CommunityPost[] {
  return db()
    .prepare("SELECT * FROM community_posts WHERE status = 'live' ORDER BY id DESC")
    .all() as CommunityPost[];
}

/** Single post by slug, or null if not found. */
export function getPostBySlug(slug: string): CommunityPost | null {
  const row = db()
    .prepare('SELECT * FROM community_posts WHERE slug = ?')
    .get(slug) as CommunityPost | undefined;
  return row ?? null;
}

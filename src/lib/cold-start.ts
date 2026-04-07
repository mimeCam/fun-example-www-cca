// src/lib/cold-start.ts
// Cold-Start Grace System — suspends the decay clock until a readership
// threshold is met OR the grace period elapses, whichever comes first.
//
// The death spiral: no readers → no revivals → posts die → site looks
// abandoned → fewer readers. This breaks the loop at the source.
//
// GraceState is a discriminated union — no boolean spaghetti.
//   warming=true  → threshold not met, clock paused, reader count shown
//   warming=false → threshold met or grace elapsed, decay active
//
// Credits: Mike (architecture spec §Key Design Decisions),
//          Elon (cold-start death spiral diagnosis)

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { daysSince } from './temporal';

// ---------------------------------------------------------------------------
// Types — discriminated union, not boolean flags (Mike §1)
// ---------------------------------------------------------------------------

export type GraceState =
  | { warming: true;  readerCount: number; threshold: number; daysUntilClockStarts: number }
  | { warming: false; decayFactor: number; daysRemaining: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const READER_THRESHOLD = 50;
export const GRACE_DAYS = 90;

// ---------------------------------------------------------------------------
// Lazy DB singleton — same revivals.db, WAL mode (safe for concurrent reads)
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
  initTable(_db);
  return _db;
}

function initTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS reader_events (
      slug        TEXT    NOT NULL,
      fingerprint TEXT    NOT NULL,
      first_seen  INTEGER NOT NULL,
      PRIMARY KEY (slug, fingerprint)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_reader_events_slug ON reader_events(slug);
  `);
}

// ---------------------------------------------------------------------------
// Fingerprint — privacy-safe: SHA-256(ip:ua), raw values never stored
// ---------------------------------------------------------------------------

function fingerprintReader(ip: string, ua: string): string {
  return createHash('sha256').update(`${ip}:${ua}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** Count unique readers for a slug. */
export function readerCount(slug: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS c FROM reader_events WHERE slug = ?')
    .get(slug) as { c: number };
  return row.c;
}

/** True when the grace period is still active — clock not yet started. */
export function isWarming(slug: string, pubDate: string): boolean {
  if (daysSince(pubDate) >= GRACE_DAYS) return false;
  return readerCount(slug) < READER_THRESHOLD;
}

/**
 * Full grace state snapshot.
 * Pass currentDecay + daysRemaining from decay-engine so ConvictionHero
 * has everything it needs in a single call.
 */
export function getGraceState(
  slug: string,
  pubDate: string,
  currentDecay: number,
  daysRemaining: number,
): GraceState {
  const daysOld = daysSince(pubDate);
  const count   = readerCount(slug);
  if (count >= READER_THRESHOLD || daysOld >= GRACE_DAYS) {
    return { warming: false, decayFactor: currentDecay, daysRemaining };
  }
  return {
    warming: true,
    readerCount: count,
    threshold: READER_THRESHOLD,
    daysUntilClockStarts: Math.max(0, GRACE_DAYS - daysOld),
  };
}

// ---------------------------------------------------------------------------
// Public writes
// ---------------------------------------------------------------------------

/** Record a unique reader visit. Fingerprint derived from ip+ua; raw values discarded. */
export function recordReader(slug: string, ip: string, ua: string): void {
  const fp = fingerprintReader(ip, ua);
  db().prepare(
    'INSERT OR IGNORE INTO reader_events (slug, fingerprint, first_seen) VALUES (?, ?, ?)',
  ).run(slug, fp, Date.now());
}

// ---------------------------------------------------------------------------
// Sanity checks (inplace-testing-howto.md pattern)
// ---------------------------------------------------------------------------

export function _testColdStart(): void {
  const warming: GraceState = {
    warming: true, readerCount: 5, threshold: 50, daysUntilClockStarts: 85,
  };
  const active: GraceState = {
    warming: false, decayFactor: 0.3, daysRemaining: 200,
  };

  console.assert(warming.warming === true,  'warming union discriminant');
  console.assert(active.warming  === false, 'active union discriminant');

  if (warming.warming) {
    console.assert(warming.readerCount === 5,    'warming.readerCount');
    console.assert(warming.threshold   === 50,   'warming.threshold');
  }
  if (!active.warming) {
    console.assert(active.daysRemaining === 200, 'active.daysRemaining');
    console.assert(active.decayFactor   === 0.3, 'active.decayFactor');
  }

  console.log('[cold-start] OK — discriminated union narrowing verified');
}

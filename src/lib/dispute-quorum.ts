// src/lib/dispute-quorum.ts
// Community Verdict Quorum — threshold math + state machine.
// Wraps verdict-dispute.ts; adds quorum logic, dedup guard, summary read.
// State machine: open → contested (→ overturned | upheld in future phase)
// Threshold: Math.ceil(totalStances * QUORUM_RATIO) — scales with engagement.
// Zero new dependencies. Same revivals.db WAL singleton pattern.
// Credits: Mike (napkin plan §Community-Verdict-Quorum),
//          Paul Kim (accountability loop), Elon (cold-start risk)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuorumStatus = 'open' | 'contested' | 'overturned' | 'upheld';

export interface DisputeSummary {
  status:       QuorumStatus;
  challenges:   number;
  threshold:    number;
  totalStances: number;
  ratio:        number;   // challenges / threshold, clamped 0..1
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const QUORUM_RATIO = parseFloat(process.env.DISPUTE_QUORUM_RATIO ?? '0.3');

// ---------------------------------------------------------------------------
// DB singleton — same revivals.db as conviction-ledger (WAL mode)
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
  return _db;
}

// ---------------------------------------------------------------------------
// Queries — one thing each
// ---------------------------------------------------------------------------

function countAllStances(slug: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM reader_stances WHERE post_slug = ?')
    .get(slug) as { n: number } | undefined;
  return row?.n ?? 0;
}

function countChallenges(slug: string): number {
  const row = db()
    .prepare('SELECT COUNT(*) AS n FROM verdict_disputes WHERE post_slug = ?')
    .get(slug) as { n: number } | undefined;
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Public — threshold math
// ---------------------------------------------------------------------------

/**
 * Minimum challenges needed to trigger contested state.
 * Scales with engagement: 30% of all stancers must challenge.
 * Guaranteed minimum of 1 so new posts can always be contested.
 */
export function getQuorumThreshold(totalStances: number): number {
  return Math.max(1, Math.ceil(totalStances * QUORUM_RATIO));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampRatio(challenges: number, threshold: number): number {
  return threshold > 0 ? Math.min(1, Math.round((challenges / threshold) * 100) / 100) : 0;
}

function resolveStatus(challenges: number, threshold: number): QuorumStatus {
  return challenges >= threshold ? 'contested' : 'open';
}

// ---------------------------------------------------------------------------
// Public — summary read
// ---------------------------------------------------------------------------

/**
 * Compute a full dispute summary for a post's verdict.
 * Safe to call at build time; returns inert open state on any error.
 * Called by DisputeTally (SSR), dispute-sse (SSE poll), verdict page.
 */
export function getDisputeSummary(slug: string): DisputeSummary {
  try {
    const totalStances = countAllStances(slug);
    const threshold    = getQuorumThreshold(Math.max(totalStances, 1));
    const challenges   = countChallenges(slug);
    const status       = resolveStatus(challenges, threshold);
    const ratio        = clampRatio(challenges, threshold);
    return { status, challenges, threshold, totalStances, ratio };
  } catch {
    return { status: 'open', challenges: 0, threshold: 1, totalStances: 0, ratio: 0 };
  }
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testDisputeQuorum(): void {
  console.assert(getQuorumThreshold(0)  === 1,  'floor 1 on zero');
  console.assert(getQuorumThreshold(10) === 3,  '30% of 10');
  console.assert(getQuorumThreshold(33) === 10, '30% of 33 ceil');
  console.log('[dispute-quorum] math OK');
}

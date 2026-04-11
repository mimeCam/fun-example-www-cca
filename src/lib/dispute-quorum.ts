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
import {
  getWindowOpenedAt,
  getDisputeResolution,
  writeDisputeResolution,
  getContestedSlugs,
} from './verdict-dispute';
import type { DisputeResolutionState } from './verdict-dispute';

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

const QUORUM_RATIO      = parseFloat(process.env.DISPUTE_QUORUM_RATIO ?? '0.3');
const QUORUM_WINDOW_MS  = 72 * 60 * 60 * 1000;  // 72h window from first dispute

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

function toSharePct(challenges: number, total: number): number {
  return total > 0 ? Math.round((challenges / total) * 100) / 100 : 0;
}

function resolvedState(challenges: number, threshold: number): DisputeResolutionState {
  return challenges >= threshold ? 'overturned' : 'upheld';
}

function windowExpired(windowOpenedAt: number): boolean {
  return Date.now() - windowOpenedAt >= QUORUM_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Public — summary read
// ---------------------------------------------------------------------------

/**
 * Compute a full dispute summary for a post's verdict.
 * Checks dispute_resolutions first — final state is authoritative.
 * Safe to call at build time; returns inert open state on any error.
 * Called by DisputeTally (SSR), dispute-sse (SSE poll), verdict page.
 */
export function getDisputeSummary(slug: string): DisputeSummary {
  try {
    const resolution = getDisputeResolution(slug);
    const totalStances = countAllStances(slug);
    const threshold    = getQuorumThreshold(Math.max(totalStances, 1));
    const challenges   = countChallenges(slug);
    const ratio        = clampRatio(challenges, threshold);
    if (resolution) {
      return { status: resolution.state, challenges, threshold, totalStances, ratio };
    }
    const status = resolveStatus(challenges, threshold);
    return { status, challenges, threshold, totalStances, ratio };
  } catch {
    return { status: 'open', challenges: 0, threshold: 1, totalStances: 0, ratio: 0 };
  }
}

// ---------------------------------------------------------------------------
// Public — quorum resolution
// ---------------------------------------------------------------------------

export interface QuorumResolutionResult {
  alreadyResolved: boolean;
  windowOpen:      boolean;   // true = 72h not yet elapsed
  resolved:        boolean;   // true = newly resolved this call
  state?:          QuorumStatus;
}

/**
 * Attempt to close the dispute window for a slug.
 * Idempotent: repeated calls on an already-resolved slug return immediately.
 * Called by: verdict-dispute API on each new dispute, deadline-sweep cron.
 */
export function resolveIfQuorumExpired(slug: string): QuorumResolutionResult {
  try {
    const existing = getDisputeResolution(slug);
    if (existing) return { alreadyResolved: true, windowOpen: false, resolved: false, state: existing.state };
    const openedAt = getWindowOpenedAt(slug);
    if (!openedAt || !windowExpired(openedAt)) return { alreadyResolved: false, windowOpen: true, resolved: false };
    const totalStances = countAllStances(slug);
    const threshold    = getQuorumThreshold(Math.max(totalStances, 1));
    const challenges   = countChallenges(slug);
    const state        = resolvedState(challenges, threshold);
    const sharePct     = toSharePct(challenges, Math.max(totalStances, 1));
    writeDisputeResolution(slug, state, sharePct);
    return { alreadyResolved: false, windowOpen: false, resolved: true, state };
  } catch {
    return { alreadyResolved: false, windowOpen: false, resolved: false };
  }
}

/** Sweep all contested (unresolved) slugs through the quorum window check. */
export function resolveAllExpiredDisputes(): QuorumResolutionResult[] {
  return getContestedSlugs().map(slug => ({ slug, ...resolveIfQuorumExpired(slug) })) as unknown as QuorumResolutionResult[];
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

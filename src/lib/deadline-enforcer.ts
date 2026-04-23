// src/lib/deadline-enforcer.ts
// Core deadline logic: classify status, find expired-unsealed posts, auto-seal.
// Calls verdict-resolver.ts via its public API — no schema changes, no migration.
// DB access is read-only here; the only write is via resolveVerdict().
// Credits: Mike (architecture spec §deadline-enforcer)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { resolveVerdict, VerdictAlreadySealedError } from './verdict-resolver';
import { nowDate } from './clock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeadlineStatus =
  | { status: 'no-deadline' }
  | { status: 'pending';          deadline: Date; daysRemaining: number }
  | { status: 'imminent';         deadline: Date; daysRemaining: number } // < 7 days
  | { status: 'critical';         deadline: Date; daysRemaining: number } // < 2 days
  | { status: 'expired-unsealed'; deadline: Date; expiredMs: number }     // overdue, not yet swept
  | { status: 'auto-resolved';    sealedAt: number };                     // swept, verdict in ledger

export interface SweepResult {
  slug: string;
  outcome: 'sealed' | 'skipped' | 'error';
  error?: string;
}

// Minimal shape required from blog posts — avoids astro:content import in lib.
export interface PostDeadlineRecord {
  slug: string;
  data: { resolution_deadline?: Date; pubDate: Date };
}

// ---------------------------------------------------------------------------
// DB — lazy singleton, read-only verdict probe
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function dbPath(): string {
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function enforceDb(): Database.Database | null {
  if (_db) return _db;
  try {
    _db = new Database(dbPath());
    _db.pragma('journal_mode = WAL');
    return _db;
  } catch { return null; }
}

function getVerdictRow(slug: string): { timestamp: number } | undefined {
  const d = enforceDb();
  if (!d) return undefined;
  return d
    .prepare("SELECT timestamp FROM conviction_ledger WHERE post_slug = ? AND event_type = 'verdict' LIMIT 1")
    .get(slug) as { timestamp: number } | undefined;
}

// ---------------------------------------------------------------------------
// Pure classification — no DB
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function daysLeft(deadline: Date, now: Date): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / MS_PER_DAY);
}

function classifyByDays(deadline: Date, days: number): DeadlineStatus {
  if (days < 2) return { status: 'critical', deadline, daysRemaining: days };
  if (days < 7) return { status: 'imminent', deadline, daysRemaining: days };
  return { status: 'pending', deadline, daysRemaining: days };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Classify the full deadline state for one post at request/build time. */
export function getDeadlineStatus(
  slug: string,
  deadline: Date | undefined,
  now: Date = nowDate(),
): DeadlineStatus {
  if (!deadline) return { status: 'no-deadline' };
  const row = getVerdictRow(slug);
  if (row) return { status: 'auto-resolved', sealedAt: row.timestamp };
  const days = daysLeft(deadline, now);
  if (days <= 0) return { status: 'expired-unsealed', deadline, expiredMs: now.getTime() - deadline.getTime() };
  return classifyByDays(deadline, days);
}

/** Posts whose deadline has passed and carry no sealed verdict. */
export function findExpiredUnsealed(
  posts: PostDeadlineRecord[],
  now: Date = nowDate(),
): PostDeadlineRecord[] {
  return posts.filter(p => {
    const dl = p.data.resolution_deadline;
    if (!dl || dl.getTime() > now.getTime()) return false;
    return !getVerdictRow(p.slug);
  });
}

/** Auto-seal one expired post as `abandoned`. Idempotent — skips if already sealed. */
export function autoSealExpired(slug: string, secret: string): SweepResult {
  try {
    resolveVerdict(slug, 'abandoned', 'Auto-sealed: deadline expired without verdict.', secret);
    return { slug, outcome: 'sealed' };
  } catch (err) {
    if (err instanceof VerdictAlreadySealedError) return { slug, outcome: 'skipped' };
    return { slug, outcome: 'error', error: String(err) };
  }
}

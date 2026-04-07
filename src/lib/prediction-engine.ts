// src/lib/prediction-engine.ts
// Prediction Vault engine — status derivation, stats, grouping, DB ledger init.
// Pure functions only: no side effects, no DB reads for display logic.
// DB (predictions_ledger) is the append-only audit proof; frontmatter is canonical.
//
// Credits: Mike (arch spec §Prediction-Vault), Tanya (UX §12 new feature placement)

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Types — discriminated unions, no nullable primitives in logic paths
// ---------------------------------------------------------------------------

export type PredictionVerdict = 'correct' | 'incorrect' | 'partial';
export type PredictionStatus  = 'pending' | 'overdue' | PredictionVerdict;

export interface Prediction {
  id: string;
  claim: string;
  resolution_criteria: string;
  resolution_deadline: Date;
  verdict: PredictionVerdict | null;
}

export interface FlatPrediction extends Prediction {
  slug: string;
  postTitle: string;
  status: PredictionStatus;
}

export interface PredictionStats {
  correct: number;
  incorrect: number;
  partial: number;
  pending: number;
  overdue: number;
  total: number;
  accuracy: number | null; // null when no resolved predictions yet
}

/** Minimal post shape needed by the engine — avoids astro:content import in lib/ */
export interface PostData {
  slug: string;
  data: { title: string; predictions?: Prediction[] };
}

// ---------------------------------------------------------------------------
// DB singleton — same revivals.db, predictions_ledger table auto-created
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function dbPath(): string {
  const dir = resolve(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'revivals.db');
}

function initTable(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS predictions_ledger (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT    NOT NULL,
      prediction_id TEXT    NOT NULL,
      verdict       TEXT    NOT NULL,
      sealed_at     INTEGER NOT NULL,
      hmac          TEXT    NOT NULL,
      UNIQUE(slug, prediction_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_pred_slug ON predictions_ledger(slug);
  `);
}

/** Lazy DB singleton with table migration. Returns null if DB unavailable. */
export function predDb(): Database.Database | null {
  if (_db) return _db;
  try {
    _db = new Database(dbPath());
    _db.pragma('journal_mode = WAL');
    initTable(_db);
    return _db;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Pure: status derivation — no DB, no side effects
// ---------------------------------------------------------------------------

/** Derive current prediction status from frontmatter state + wall-clock time. */
export function derivePredictionStatus(p: Prediction, now: Date): PredictionStatus {
  if (p.verdict !== null) return p.verdict;
  if (now > p.resolution_deadline) return 'overdue';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Pure: data shaping
// ---------------------------------------------------------------------------

/** Flatten all post predictions into a single list with status derived at call time. */
export function flattenPredictions(posts: PostData[], now: Date): FlatPrediction[] {
  return posts.flatMap(post =>
    (post.data.predictions ?? []).map(p => ({
      ...p,
      slug:      post.slug,
      postTitle: post.data.title,
      status:    derivePredictionStatus(p, now),
    }))
  );
}

/** Filter a flat list to a single post's predictions. */
export function filterBySlug(slug: string, fps: FlatPrediction[]): FlatPrediction[] {
  return fps.filter(fp => fp.slug === slug);
}

// ---------------------------------------------------------------------------
// Pure: stats computation
// ---------------------------------------------------------------------------

function incrementStatus(c: Omit<PredictionStats, 'total' | 'accuracy'>, status: PredictionStatus): void {
  if (status === 'correct')   { c.correct++;   return; }
  if (status === 'incorrect') { c.incorrect++; return; }
  if (status === 'partial')   { c.partial++;   return; }
  if (status === 'pending')   { c.pending++;   return; }
  if (status === 'overdue')   { c.overdue++;   return; }
}

function accuracyPct(correct: number, incorrect: number, partial: number): number | null {
  const denom = correct + incorrect + partial;
  return denom > 0 ? Math.round((correct / denom) * 100) : null;
}

/** Compute accuracy stats over a flat prediction list. Pure — no DB. */
export function computeStats(fps: FlatPrediction[]): PredictionStats {
  const c = { correct: 0, incorrect: 0, partial: 0, pending: 0, overdue: 0 };
  for (const fp of fps) incrementStatus(c, fp.status);
  return { ...c, total: fps.length, accuracy: accuracyPct(c.correct, c.incorrect, c.partial) };
}

// ---------------------------------------------------------------------------
// Pure: grouping for UI display order (Overdue → Pending → Resolved)
// ---------------------------------------------------------------------------

/** Group a flat list into display buckets for PredictionVault. */
export function groupByStatus(fps: FlatPrediction[]): {
  overdue:  FlatPrediction[];
  pending:  FlatPrediction[];
  resolved: FlatPrediction[];
} {
  return {
    overdue:  fps.filter(fp => fp.status === 'overdue'),
    pending:  fps.filter(fp => fp.status === 'pending'),
    resolved: fps.filter(fp => fp.status === 'correct' || fp.status === 'incorrect' || fp.status === 'partial'),
  };
}

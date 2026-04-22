// src/lib/cell-event-ledger.ts
// v150c — the cited-cell round-trip ledger. Pure functions over one table.
//
// Records two events: `copy` (user copies a citation from /api/docs) and
// `arrive` (someone lands on a cell's anchor via a pasted URL). A client-
// generated `ref` joins the two so a copy can be causally linked to an
// arrival without a login, a cookie wall, or any PII.
//
// One source of truth for the round-trip metric: `roundTripRatio()` below.
// The API layer and any future dashboard read the same number, so they
// cannot drift. Mike napkin §5: "A second definition of the metric in a
// SQL string is where reality splits — keep it in code."
//
// Anti-scope: no dashboard UI, no third-party analytics, no parallel rate
// limiter (uses the shared SQLite handle from collectiveMemory).
//
// Credits: Mike Koch (napkin §2 schema, §5 metric definition, §7 compliance
//          guard), Paul Kim (the ratio is his), Elon Musk (falsifiability,
//          fire-and-forget contract), Tanya Donska (§7 event vocabulary),
//          Sid (ten-line functions).

import type Database from 'better-sqlite3';
import { sharedDatabase } from './collectiveMemory';
import { STAGE_AXES } from './stage-axes';
import type { Axis } from './stage-axes';
import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';

// ── Public contract ───────────────────────────────────────────────────────

/** The two event verbs the ledger accepts. Freeze early (Mike §3). */
export type CellEventKind = 'copy' | 'arrive';

/** Single row the ingest endpoint hands to `record()`. */
export interface CellEventRow {
  event: CellEventKind;
  axis: Axis;
  stage: DecayStage;
  ref: string;       // client-generated nonce; joins copy↔arrive
  ts: number;        // wall-clock ms; clamped by validator
  ua?: string;       // server-extracted UA header, never client-supplied
}

/** Shape returned by `baseline()` — the single round-trip snapshot. */
export interface RoundTripBaseline {
  windowDays: number;
  sinceIso: string;
  copies: number;
  arrivals: number;
  roundTripRatio: number;  // arrivals_with_matching_ref / copies
  byCell: CellCount[];
}

/** Per-(axis,stage) counter used by baseline + future dashboards. */
export interface CellCount {
  axis: Axis;
  stage: DecayStage;
  copies: number;
  arrivals: number;
}

/** The rolling window used for the headline number. Mike §5, Paul §154. */
export const ROUND_TRIP_WINDOW_DAYS = 7;

/** Days of ledger history required before "never-cited" turns from dormant
 *  (cold start) into unseen (genuine silence). Elon's guardrail, Tanya §4. */
export const COLD_START_DAYS = 7;

/** All-time per-cell counters + most-recent event timestamp. No window.
 *  Callers use this to classify cell heat (see `cell-heat.ts`). */
export interface CellLifetime {
  axis: Axis;
  stage: DecayStage;
  copies: number;
  arrivals: number;
  lastTs: number | null;   // ms of most recent event, null if none
}

/** Ledger-maturity snapshot. `ready` is the only boolean consumers need;
 *  `ageDays` + `coldStartDays` surface the threshold for screen readers. */
export interface LedgerMaturity {
  ageDays: number;         // 0 when the ledger is empty
  ready: boolean;          // true when `ageDays >= coldStartDays`
  coldStartDays: number;   // mirrors COLD_START_DAYS (constant, exposed for JSON)
}

// ── Schema (idempotent) ───────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS cell_events (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT    NOT NULL,
    axis  TEXT    NOT NULL,
    stage TEXT    NOT NULL,
    ref   TEXT    NOT NULL,
    ts    INTEGER NOT NULL,
    ua    TEXT    DEFAULT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cell_events_event_ts ON cell_events(event, ts);
  CREATE INDEX IF NOT EXISTS idx_cell_events_ref      ON cell_events(ref);
`;

let _schemaReady = false;

/** Create the table + indexes once per process. Safe to call repeatedly. */
export function ensureSchema(): void {
  if (_schemaReady) return;
  sharedDatabase().exec(SCHEMA_SQL);
  _schemaReady = true;
}

/** @internal Test-only: rerun schema on a swapped-in DB without process reset. */
export function __resetSchemaFlagForTests(): void {
  _schemaReady = false;
}

// ── Validation (server-side guardrails) ───────────────────────────────────

const AXIS_SET: ReadonlySet<string> = new Set(STAGE_AXES);
const STAGE_SET: ReadonlySet<string> = new Set(DECAY_STAGES);
const EVENT_SET: ReadonlySet<string> = new Set(['copy', 'arrive']);
const REF_RE = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_SKEW_MS = 3_600_000;  // server clamps client wall-clock to ±1h

/** True if (axis, stage) is inside the 7×5 product. No 36th cell. */
export function isValidCell(axis: string, stage: string): boolean {
  return AXIS_SET.has(axis) && STAGE_SET.has(stage);
}

/** True if every field in `row` conforms to the wire contract. */
export function isValidEventRow(row: Partial<CellEventRow>): boolean {
  if (!row.event || !EVENT_SET.has(row.event)) return false;
  if (!isValidCell(row.axis ?? '', row.stage ?? '')) return false;
  if (!row.ref || !REF_RE.test(row.ref)) return false;
  return typeof row.ts === 'number' && Number.isFinite(row.ts);
}

/** Clamp wall-clock to a server-trusted ±1h window around now. */
export function clampTimestamp(ts: number, now = Date.now()): number {
  if (!Number.isFinite(ts)) return now;
  if (ts < now - MAX_SKEW_MS) return now - MAX_SKEW_MS;
  if (ts > now + MAX_SKEW_MS) return now + MAX_SKEW_MS;
  return ts;
}

// ── Write path ────────────────────────────────────────────────────────────

/**
 * Record one event. Returns the inserted row id. Callers must have already
 * validated via `isValidEventRow()` — this is a thin INSERT wrapper.
 */
export function record(row: CellEventRow): number {
  ensureSchema();
  const ts = clampTimestamp(row.ts);
  const stmt = sharedDatabase().prepare(`
    INSERT INTO cell_events (event, axis, stage, ref, ts, ua)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(row.event, row.axis, row.stage, row.ref, ts, row.ua ?? null);
  return Number(info.lastInsertRowid);
}

// ── Read path ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** ms cutoff for "last N days" windows, exclusive of events older than that. */
function windowCutoff(days: number, now = Date.now()): number {
  return now - Math.max(1, days) * DAY_MS;
}

/** Count events of a verb newer than cutoff. Scalar — sub-ms on SQLite. */
function countEvents(db: Database.Database, event: CellEventKind, cutoff: number): number {
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM cell_events WHERE event = ? AND ts >= ?',
  ).get(event, cutoff) as { c: number };
  return row.c;
}

/** Arrivals whose `ref` matches some earlier `copy` in the same window. */
function matchedArrivals(db: Database.Database, cutoff: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM cell_events a
    WHERE a.event = 'arrive' AND a.ts >= ?
      AND EXISTS (
        SELECT 1 FROM cell_events c
        WHERE c.event = 'copy' AND c.ref = a.ref AND c.ts <= a.ts
      )
  `).get(cutoff) as { c: number };
  return row.c;
}

/** Per-(axis,stage) copy + arrival counters in the window. */
function countByCell(db: Database.Database, cutoff: number): CellCount[] {
  const rows = db.prepare(`
    SELECT axis, stage, event, COUNT(*) AS c
    FROM cell_events WHERE ts >= ?
    GROUP BY axis, stage, event
  `).all(cutoff) as Array<{ axis: string; stage: string; event: string; c: number }>;
  return foldCellRows(rows);
}

/** Merge per-event rows into one (axis,stage) record. */
function foldCellRows(
  rows: Array<{ axis: string; stage: string; event: string; c: number }>,
): CellCount[] {
  const out = new Map<string, CellCount>();
  for (const r of rows) {
    if (!isValidCell(r.axis, r.stage)) continue;
    const key = `${r.axis}:${r.stage}`;
    const cur = out.get(key) ?? { axis: r.axis as Axis, stage: r.stage as DecayStage, copies: 0, arrivals: 0 };
    if (r.event === 'copy') cur.copies += r.c;
    if (r.event === 'arrive') cur.arrivals += r.c;
    out.set(key, cur);
  }
  return [...out.values()];
}

/** Safe division: 0 / 0 → 0, everything else rounded to 4 decimals. */
export function ratio(num: number, denom: number): number {
  if (!denom || !Number.isFinite(num / denom)) return 0;
  return Math.round((num / denom) * 10_000) / 10_000;
}

/**
 * Headline number: arrivals-with-matching-ref divided by copies in the
 * same rolling window. Single source; API and dashboard both read this.
 */
export function roundTripRatio(windowDays = ROUND_TRIP_WINDOW_DAYS): number {
  ensureSchema();
  const db = sharedDatabase();
  const cutoff = windowCutoff(windowDays);
  return ratio(matchedArrivals(db, cutoff), countEvents(db, 'copy', cutoff));
}

/**
 * One-shot snapshot for the /metrics endpoint. Rolling 7-day window
 * (Mike §5, Paul §154). Returns copies, arrivals, ratio, by-cell counts.
 */
export function baseline(windowDays = ROUND_TRIP_WINDOW_DAYS): RoundTripBaseline {
  ensureSchema();
  const db = sharedDatabase();
  const cutoff = windowCutoff(windowDays);
  const copies = countEvents(db, 'copy', cutoff);
  const arrivals = matchedArrivals(db, cutoff);
  return {
    windowDays, sinceIso: new Date(cutoff).toISOString(),
    copies, arrivals,
    roundTripRatio: ratio(arrivals, copies),
    byCell: countByCell(db, cutoff),
  };
}

// ── Lifetime + maturity (v150d — /api/docs cited-cell heat, Mike §) ──────

/** Per-(axis,stage) all-time counters + last-seen timestamp. Single indexed
 *  GROUP BY — sub-ms on SQLite, same class as `baseline()`. */
export function lifetimeByCell(): CellLifetime[] {
  ensureSchema();
  const rows = sharedDatabase().prepare(`
    SELECT axis, stage, event, COUNT(*) AS c, MAX(ts) AS last
    FROM cell_events GROUP BY axis, stage, event
  `).all() as Array<{ axis: string; stage: string; event: string; c: number; last: number }>;
  return foldLifetimeRows(rows);
}

/** Merge the per-event group-by into one (axis,stage) summary per cell. */
function foldLifetimeRows(
  rows: Array<{ axis: string; stage: string; event: string; c: number; last: number }>,
): CellLifetime[] {
  const out = new Map<string, CellLifetime>();
  for (const r of rows) mergeLifetimeRow(out, r);
  return [...out.values()];
}

/** Fold one event's aggregate row into the running (axis,stage) summary. */
function mergeLifetimeRow(
  out: Map<string, CellLifetime>,
  r: { axis: string; stage: string; event: string; c: number; last: number },
): void {
  if (!isValidCell(r.axis, r.stage)) return;
  const key = `${r.axis}:${r.stage}`;
  const cur = out.get(key) ?? emptyLifetime(r.axis as Axis, r.stage as DecayStage);
  if (r.event === 'copy')   cur.copies   += r.c;
  if (r.event === 'arrive') cur.arrivals += r.c;
  cur.lastTs = cur.lastTs === null ? r.last : Math.max(cur.lastTs, r.last);
  out.set(key, cur);
}

/** Zeroed lifetime row for a (axis,stage) pair. Pure, trivially testable. */
function emptyLifetime(axis: Axis, stage: DecayStage): CellLifetime {
  return { axis, stage, copies: 0, arrivals: 0, lastTs: null };
}

/** Age of the oldest ledger event. Empty ledger → ageDays=0, ready=false
 *  (cold-start guardrail — Elon's "don't ship a lie on day one"). */
export function ledgerMaturity(now = Date.now()): LedgerMaturity {
  ensureSchema();
  const row = sharedDatabase().prepare(
    'SELECT MIN(ts) AS first FROM cell_events',
  ).get() as { first: number | null };
  if (row.first === null) return { ageDays: 0, ready: false, coldStartDays: COLD_START_DAYS };
  const ageDays = (now - row.first) / DAY_MS;
  return { ageDays, ready: ageDays >= COLD_START_DAYS, coldStartDays: COLD_START_DAYS };
}

// src/lib/cell-heat.ts
// v150d — cited-cell heat classifier. Pure, stateless, SSR-safe.
//
// Two readers, one producer:
//   · /api/docs SSR emits `data-heat="…"` on each of the 35 matrix cells.
//   · /api/metrics/cited-cells JSON publishes the same per-cell levels.
// Both call `heatedGrid()` below so the page and the JSON cannot drift.
//
// Vocabulary is DELIBERATELY distinct from `DecayStage` (Tanya §2). The
// 35 grid cells already carry `data-decay-stage` for their labeled identity;
// stacking citation heat on the same attribute would collide two meanings
// on the same pixels. Two attributes, two surfaces, two non-overlapping
// literal sets. The compliance guard's freeze stays untouched.
//
// Cold-start discipline: until the ledger is `COLD_START_DAYS` old, every
// cell returns `dormant` — neutral tint, not "unseen". This is Elon's
// "don't ship a lie on day one" rule, expressed as a pure function.
//
// Credits: Mike Koch (napkin §classifier-rule, single producer), Tanya
//          Donska (§2 layer-collision, §4 heat vocabulary, §7 ARIA
//          sentence), Elon Musk (cold-start guardrail, window discipline),
//          Paul Kim (API-parity vow — SSR + JSON share one function),
//          Sid (each helper ≤ 10 lines).

import { STAGE_AXES } from './stage-axes';
import type { Axis } from './stage-axes';
import { DECAY_STAGES } from './decay-engine';
import type { DecayStage } from './decay-engine';
import type { CellLifetime, LedgerMaturity } from './cell-event-ledger';

// ── Heat vocabulary (does NOT overlap DecayStage literals) ───────────────

/** The five heat levels. Frozen tuple — mirrors DECAY_STAGES in cardinality
 *  only; the literal values are intentionally different so `data-heat` and
 *  `data-decay-stage` never collide on the wire, in CSS, or in tests. */
export const HEAT_LEVELS = ['warm', 'cooling', 'cold', 'unseen', 'dormant'] as const;
export type HeatLevel = typeof HEAT_LEVELS[number];

// ── Time windows (named constants — no magic numbers, no inline days) ────

const DAY_MS = 86_400_000;
/** Cited within this window → `warm`. Mirrors ROUND_TRIP_WINDOW_DAYS. */
export const HEAT_WARM_DAYS = 7;
/** Cited within this window (but beyond warm) → `cooling`. */
export const HEAT_COOL_DAYS = 30;

// ── Classifier (single source of truth) ──────────────────────────────────

/** Input shape for the pure classifier. `now` is injected for tests. */
export interface HeatInput {
  lastTs: number | null;
  now: number;
  ledgerReady: boolean;
}

/** Deterministic: same input → same output. No DB, no Date.now(), no I/O. */
export function cellHeat(input: HeatInput): HeatLevel {
  if (!input.ledgerReady) return 'dormant';
  if (input.lastTs === null) return 'unseen';
  const ageDays = (input.now - input.lastTs) / DAY_MS;
  if (ageDays <= HEAT_WARM_DAYS) return 'warm';
  if (ageDays <= HEAT_COOL_DAYS) return 'cooling';
  return 'cold';
}

// ── Full-grid projection (what /api/docs + /api/metrics consume) ─────────

/** One cell's published heat record — carries counts, last-seen, and level. */
export interface HeatedCell {
  axis: Axis;
  stage: DecayStage;
  heat: HeatLevel;
  lastTs: number | null;
  copies: number;
  arrivals: number;
}

/** Build the full 7×5 grid. Cells with no events render `unseen`/`dormant`
 *  (never missing). Guarantees the SSR never has a gap. */
export function heatedGrid(
  lifetime: readonly CellLifetime[],
  maturity: Pick<LedgerMaturity, 'ready'>,
  now: number = Date.now(),
): HeatedCell[] {
  const byKey = indexLifetime(lifetime);
  return enumerateGrid((axis, stage) =>
    toHeatedCell(axis, stage, byKey.get(cellKey(axis, stage)), maturity.ready, now));
}

/** Index lifetime rows by `${axis}:${stage}` for O(1) cell lookup. */
function indexLifetime(lifetime: readonly CellLifetime[]): Map<string, CellLifetime> {
  const out = new Map<string, CellLifetime>();
  for (const row of lifetime) out.set(cellKey(row.axis, row.stage), row);
  return out;
}

/** Stable grid walker — row-major (axis outer, stage inner). */
function enumerateGrid<T>(fn: (axis: Axis, stage: DecayStage) => T): T[] {
  const out: T[] = [];
  for (const axis of STAGE_AXES)
    for (const stage of DECAY_STAGES) out.push(fn(axis, stage));
  return out;
}

/** Project one cell's lifetime row (or its absence) into the public shape. */
function toHeatedCell(
  axis: Axis,
  stage: DecayStage,
  row: CellLifetime | undefined,
  ready: boolean,
  now: number,
): HeatedCell {
  const copies = row?.copies ?? 0;
  const arrivals = row?.arrivals ?? 0;
  const lastTs = row?.lastTs ?? null;
  const heat = cellHeat({ lastTs, now, ledgerReady: ready });
  return { axis, stage, heat, lastTs, copies, arrivals };
}

/** Composite lookup key for a (axis, stage) pair. */
function cellKey(axis: Axis, stage: DecayStage): string {
  return `${axis}:${stage}`;
}

// ── Human sentences (for `aria-describedby` in the docs matrix) ──────────

/** Screen-reader sentence carrying the same story the tint carries.
 *  Plain, declarative — designed to be readable by TalkBack/VoiceOver
 *  without losing cadence. Tanya §7. */
export function heatSentence(cell: HeatedCell, now: number = Date.now()): string {
  const id = `${cell.axis} at ${cell.stage}`;
  if (cell.heat === 'dormant') return `${id}; telemetry warms up over the first week.`;
  if (cell.heat === 'unseen')  return `${id}; not yet cited.`;
  return `${id}; cited ${pluralize(cell.copies, 'time', 'times')}${lastSeenPhrase(cell.lastTs, now)}.`;
}

/** English pluraliser — one / many. */
function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "today" / "N days ago" suffix for the ARIA sentence. */
function lastSeenPhrase(lastTs: number | null, now: number): string {
  if (lastTs === null) return '';
  const ageDays = Math.max(0, Math.floor((now - lastTs) / DAY_MS));
  if (ageDays === 0) return ', last today';
  return `, last ${pluralize(ageDays, 'day', 'days')} ago`;
}

// src/pages/api/metrics/cited-cells.ts
// v150c — GET snapshot of the cited-cell round-trip baseline.
// v150d — extended: same endpoint publishes per-cell heat + ledger maturity
//         so external consumers agree byte-for-byte with the /api/docs tint
//         (Paul's API-parity vow — Tanya §8).
//
// Read-only JSON for the one metric that arbitrates the next cycle's
// brief (Mike napkin §5, Paul §154): copies, matched arrivals, and the
// ratio over a rolling window. Window is 7 days by default and can be
// narrowed via `?days=N` (1..30) for quick spot-checks.
//
// Response shape is additive: the original v150c fields (`window`, `copies`,
// `arrivals`, `roundTripRatio`, `byCell`) stay byte-identical. The new
// `heatByCell` + `ledger` blocks are appended — existing consumers parse
// forward without change.
//
// SLA: sub-50ms on SQLite — three indexed scalar queries + two group-bys.
//
// Credits: Mike (napkin §5 shared metric definition), Paul (windowed
//          ratio, API parity), Tanya (heat vocabulary + window label),
//          Elon (baseline-before-target, cold-start guardrail),
//          Sid (helpers ≤ 10 LOC).

import type { APIRoute } from 'astro';
import {
  baseline,
  lifetimeByCell,
  ledgerMaturity,
  ROUND_TRIP_WINDOW_DAYS,
  COLD_START_DAYS,
  type RoundTripBaseline,
  type LedgerMaturity,
} from '../../../lib/cell-event-ledger';
import { heatedGrid, type HeatedCell } from '../../../lib/cell-heat';

const MAX_WINDOW_DAYS = 30;

export const GET: APIRoute = ({ url }) => {
  const days = parseDays(url.searchParams.get('days'));
  const snapshot = baseline(days);
  const maturity = ledgerMaturity();
  const heated = heatedGrid(lifetimeByCell(), maturity);
  return json(shape(snapshot, heated, maturity));
};

// Reject non-GET verbs cleanly — this endpoint is a read-only view.
export const POST: APIRoute = () =>
  new Response(null, { status: 405, headers: { Allow: 'GET' } });

// ── Helpers (each under 10 lines) ────────────────────────────────────────

/** Clamp `?days=` to a sane 1..30 range; falls back to the module default. */
function parseDays(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return ROUND_TRIP_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.floor(n)));
}

/** Shape the ledger snapshot for JSON consumers (stable public contract). */
function shape(
  snap: RoundTripBaseline,
  heated: HeatedCell[],
  maturity: LedgerMaturity,
): Record<string, unknown> {
  return {
    window: { days: snap.windowDays, since: snap.sinceIso },
    copies: snap.copies,
    arrivals: snap.arrivals,
    roundTripRatio: snap.roundTripRatio,
    byCell: snap.byCell,
    heatByCell: heated,
    ledger: shapeLedger(maturity),
  };
}

/** Public ledger-maturity block. `ready` is the boolean consumers branch on. */
function shapeLedger(m: LedgerMaturity): Record<string, unknown> {
  return {
    ready: m.ready,
    ageDays: round(m.ageDays, 2),
    coldStartDays: m.coldStartDays,
    warmDays: COLD_START_DAYS,   // publish the window so headlines can't lie
  };
}

/** Decimal rounder — keeps JSON output stable across runs. */
function round(n: number, places: number): number {
  const k = 10 ** places;
  return Math.round(n * k) / k;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30',  // refresh-friendly for tooling
    },
  });
}

// src/lib/jobs/deadline-sweeper.ts
// Cron job: sweep expired verdicts and auto-seal abandoned posts.
// Calls POST /api/deadline-sweep — idempotent, safe to run every 60 min.
// Self-HTTP: auth layer exercised identically to ops.
//
// Credits: Mike (arch §deadline-sweeper),
//          Sid (2026-04-23 ledger wedge v173: local stderr stamp retired —
//          curried wrapper around `clock.logJson`).

import { logJson as clockLogJson } from '../clock';

// ---------------------------------------------------------------------------
// Structured logger — 1-line curry over the seam
// ---------------------------------------------------------------------------

type LogEvent = 'start' | 'result' | 'error';

function logJson(event: LogEvent, data: Record<string, unknown>): void {
  clockLogJson('deadline-sweeper', event, data);
}

// ---------------------------------------------------------------------------
// HTTP call to own sweep endpoint
// ---------------------------------------------------------------------------

interface SweepResponse {
  ok: boolean;
  swept: number;
  skipped: number;
  errors: number;
  disputeResolved: number;
}

async function callSweepApi(baseUrl: string): Promise<SweepResponse> {
  const secret = process.env.ADMIN_SECRET ?? '';
  const res = await fetch(`${baseUrl}/api/deadline-sweep`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`deadline-sweep HTTP ${res.status}`);
  return res.json() as Promise<SweepResponse>;
}

// ---------------------------------------------------------------------------
// Exported job — called by CronRunner on each tick
// ---------------------------------------------------------------------------

export interface DeadlineSweeperResult {
  swept: number;
  errors: number;
  status: 'ok' | 'partial' | 'error';
}

export async function deadlineSweeperRun(baseUrl: string): Promise<DeadlineSweeperResult> {
  logJson('start', { baseUrl });
  const result = await callSweepApi(baseUrl);
  const status = result.errors > 0 ? (result.swept > 0 ? 'partial' : 'error') : 'ok';
  logJson('result', { swept: result.swept, skipped: result.skipped, errors: result.errors, disputeResolved: result.disputeResolved, status });
  return { swept: result.swept, errors: result.errors, status };
}

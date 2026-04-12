// src/lib/jobs/ots-poller.ts
// Cron job: upgrade pending OTS proofs via POST /api/ots-upgrade.
// Uses self-HTTP so auth layer and idempotency are exercised identically to ops.
// Also checks for "stuck" seals (pending > 4h = warn, > 24h = error log).
// Uses Promise.allSettled semantics: one calendar down ≠ abort the batch.
//
// Credits: Mike (arch §ots-poller), Peter Todd (OTS spec)

import { getPendingOtsSeals } from '../conviction-ledger';

// ---------------------------------------------------------------------------
// Structured logger — all cron lines are JSON readable by any Docker log driver
// ---------------------------------------------------------------------------

type LogEvent = 'start' | 'stuck_warn' | 'stuck_alert' | 'result' | 'alert' | 'error';

interface LogPayload {
  ts: string;
  job: 'ots-poller';
  event: LogEvent;
  data: Record<string, unknown>;
}

function logJson(event: LogEvent, data: Record<string, unknown>): void {
  const entry: LogPayload = { ts: new Date().toISOString(), job: 'ots-poller', event, data };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------------------
// Stuck-seal detection — read-only observability, no writes
// ---------------------------------------------------------------------------

const FOUR_HOURS_MS   = 4  * 60 * 60 * 1000;
const TWENTY_FOUR_HRS = 24 * 60 * 60 * 1000;

function warnStuckSeals(): void {
  const pending = getPendingOtsSeals(100);
  const now     = Date.now();
  for (const seal of pending) {
    const age = now - seal.timestamp;
    if (age > TWENTY_FOUR_HRS) {
      logJson('stuck_alert', { slug: seal.post_slug, pendingHours: Math.floor(age / 3_600_000) });
    } else if (age > FOUR_HOURS_MS) {
      logJson('stuck_warn', { slug: seal.post_slug, pendingHours: Math.floor(age / 3_600_000) });
    }
  }
}

// ---------------------------------------------------------------------------
// HTTP call to own upgrade endpoint
// ---------------------------------------------------------------------------

interface UpgradeResponse {
  upgraded: number;
  stillPending: number;
  failed: number;
  errors: string[];
}

async function callUpgradeApi(baseUrl: string): Promise<UpgradeResponse> {
  const secret = process.env.ADMIN_SECRET ?? '';
  const res = await fetch(`${baseUrl}/api/ots-upgrade`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
    },
    body: JSON.stringify({ limit: 50 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ots-upgrade HTTP ${res.status}`);
  return res.json() as Promise<UpgradeResponse>;
}

// ---------------------------------------------------------------------------
// Derive CronStatus from result
// ---------------------------------------------------------------------------

function deriveStatus(result: UpgradeResponse): 'ok' | 'partial' | 'error' {
  if (result.failed === 0) return 'ok';
  if (result.upgraded > 0 || result.stillPending > 0) return 'partial';
  return 'error';
}

// ---------------------------------------------------------------------------
// Exported job — called by CronRunner on each tick
// ---------------------------------------------------------------------------

export interface OtsPollerResult {
  upgraded: number;
  stillPending: number;
  failed: number;
  status: 'ok' | 'partial' | 'error';
}

export async function otsPollerRun(baseUrl: string): Promise<OtsPollerResult> {
  logJson('start', { baseUrl });
  warnStuckSeals();
  const result = await callUpgradeApi(baseUrl);
  const status = deriveStatus(result);
  logJson('result', { ...result, status });
  if (result.failed > 0) {
    logJson('alert', { msg: 'OTS upgrade had failures', errors: result.errors });
  }
  return { upgraded: result.upgraded, stillPending: result.stillPending, failed: result.failed, status };
}

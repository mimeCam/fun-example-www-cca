// src/lib/cron-runner.ts
// In-process cron scheduler. Boots once via astro:server:start integration hook.
// Two jobs: OTS poller (30 min) + deadline sweeper (60 min).
// No ICronJob interface. No abstract scheduler. Two functions. One flat array.
//
// Design decisions (Mike arch §1-7):
//   - setInterval: zero deps, no sub-second precision needed
//   - Self-HTTP: cron calls own API endpoints — auth layer exercised in prod
//   - 5s cold-start delay: server must bind port before first HTTP self-call
//   - `booted` flag: prevents double-registration in Astro dev hot-reload
//   - SIGTERM handler: clears intervals, logs final state before Docker stop
//
// Credits: Mike (arch §cron-runner), Elon (first-principles: ignition switch only),
//          Sid (2026-04-23 ledger wedge v173: local `logJson` retired; stderr
//          stamp flows through the shared clock seam — Mike napkin §2).

import { recordStart, recordFinish, recordError } from './cron-store';
import { otsPollerRun }       from './jobs/ots-poller';
import { deadlineSweeperRun } from './jobs/deadline-sweeper';
import { logJson as clockLogJson } from './clock';

// ---------------------------------------------------------------------------
// Types — plain objects, no class hierarchy
// ---------------------------------------------------------------------------

interface JobDef {
  name:       string;
  intervalMs: number;
  run:        (baseUrl: string) => Promise<{ upgraded?: number; stillPending?: number; failed?: number; swept?: number; errors?: number; status: 'ok' | 'partial' | 'error' }>;
}

interface AddressInfo {
  address: string;
  port:    number;
  family?: string;
}

// ---------------------------------------------------------------------------
// Module-level state — single source of truth, no class singleton
// ---------------------------------------------------------------------------

let booted  = false;
let baseUrl = '';
const handles: ReturnType<typeof setInterval>[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHost(addr: AddressInfo): string {
  const raw = addr.address;
  if (!raw || raw === '::' || raw === '0.0.0.0') return '127.0.0.1';
  if (raw.includes(':')) return `[${raw}]`; // IPv6
  return raw;
}

function buildBaseUrl(addr: AddressInfo): string {
  return `http://${normalizeHost(addr)}:${addr.port}`;
}

/** Job-name curry of the shared stderr stamp (clock.ts). Keeps every callsite
 *  below at two args while the `ts` is pinned through `nowISO()`. */
function logJson(event: string, data: Record<string, unknown>): void {
  clockLogJson('cron-runner', event, data);
}

// ---------------------------------------------------------------------------
// Job runner wrapper — records start/finish/error around each tick
// ---------------------------------------------------------------------------

async function runWrapped(job: JobDef): Promise<void> {
  const runId = recordStart(job.name);
  try {
    const result = await job.run(baseUrl);
    const upgraded    = result.upgraded    ?? 0;
    const stillPending = result.stillPending ?? 0;
    const failed      = (result.failed ?? 0) + (result.errors ?? 0);
    recordFinish(runId, result.status, upgraded, stillPending, failed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordError(runId, msg);
    logJson('job_error', { job: job.name, error: msg });
  }
}

// ---------------------------------------------------------------------------
// Job registry — append a third job here if a third one ever exists
// ---------------------------------------------------------------------------

const JOBS: JobDef[] = [
  { name: 'ots-poller',        intervalMs: 30 * 60 * 1000, run: otsPollerRun },
  { name: 'deadline-sweeper',  intervalMs: 60 * 60 * 1000, run: deadlineSweeperRun },
];

// ---------------------------------------------------------------------------
// Public API — two functions, zero classes
// ---------------------------------------------------------------------------

/** Boot the cron runner after the HTTP server is listening.
 *  Idempotent: safe to call multiple times (dev hot-reload guard). */
export async function boot(addr: AddressInfo): Promise<void> {
  if (booted) return;
  booted  = true;
  baseUrl = buildBaseUrl(addr);
  logJson('boot', { baseUrl, jobs: JOBS.map(j => ({ name: j.name, intervalMs: j.intervalMs })) });

  // 5s cold-start delay: guarantee HTTP server is fully bound before first tick
  await new Promise<void>(resolve => setTimeout(resolve, 5_000));

  for (const job of JOBS) {
    // First tick immediately after cold-start delay
    void runWrapped(job);
    handles.push(setInterval(() => void runWrapped(job), job.intervalMs));
  }

  process.on('SIGTERM', shutdown);
}

/** Clear all intervals and log final state. Called on SIGTERM (Docker stop). */
export function shutdown(): void {
  logJson('shutdown', { cleared: handles.length });
  for (const h of handles) clearInterval(h);
  handles.length = 0;
  booted = false;
}

// ---------------------------------------------------------------------------
// Production lazy-boot seam (Sid — 2026-04-23 deployment.log fix)
// ---------------------------------------------------------------------------
//
// Why: the `astro:server:start` integration hook in astro.config.mjs only
// fires under `astro dev` / `astro preview`. The compiled standalone Node
// server (`dist/server/entry.mjs`) does not run Astro's integration pipeline,
// so in production the cron NEVER booted — deadline-sweeper and OTS-poller
// never ticked. The deploy-time witness caught it:
//
//   ==> [deploy] cron-runner boot witness: boot-lines=0 · ts-iso-lines=0
//   ==> [deploy] ⚠ v173 cron-runner boot stderr line NOT seen in docker logs
//
// Fix: expose an env-driven boot that the middleware calls once per process
// on the first request. `booted` guard already makes it idempotent; the
// middleware is included in the production bundle (verified in dist/server).
// HOST/PORT come from Docker env (see Dockerfile `ENV PORT=7100`).
//
// TODO: once Astro exposes a production `server:listen` hook, wire it in
//       astro.config.mjs alongside the dev hook and drop this seam.

/** Boot once from env vars (HOST/PORT) — safe to call on every request. */
export function bootFromEnv(): void {
  if (booted) return;
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT) || 7100;
  void boot({ address: host, port }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logJson('boot_error', { error: msg });
  });
}

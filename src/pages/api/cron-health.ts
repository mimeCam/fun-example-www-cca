// src/pages/api/cron-health.ts
// GET /api/cron-health — ops-only health check for the in-process cron runner.
// Auth: Authorization: Bearer <ADMIN_SECRET>
// Response 200: { jobs: [{ name, lastRun, lastStatus, failureStreak, pendingOtsCount }] }
// Response 500: same shape, but at least one job has failureStreak >= 3
// Response 403: missing / wrong Bearer token
//
// Used by monitoring / Docker health probes — not a user-facing endpoint.
// Credits: Mike (arch §cron-health)

import type { APIRoute }    from 'astro';
import { getLastRuns, getFailureStreak } from '../../lib/cron-store';
import { getPendingOtsSeals }            from '../../lib/conviction-ledger';

export const prerender = false;

const ALERT_STREAK = 3;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET ?? '';
  if (!secret) return false;
  return request.headers.get('Authorization') === `Bearer ${secret}`;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Job health shape
// ---------------------------------------------------------------------------

interface JobHealth {
  name:           string;
  lastRunAt:      number | null;
  lastStatus:     string | null;
  failureStreak:  number;
  pendingOtsCount?: number;
}

function buildJobHealth(jobName: string): JobHealth {
  const runs = getLastRuns().filter(r => r.job_name === jobName);
  const last = runs[0] ?? null;
  return {
    name:          jobName,
    lastRunAt:     last?.finished_at ?? null,
    lastStatus:    last?.status     ?? null,
    failureStreak: getFailureStreak(jobName),
    ...(jobName === 'ots-poller' ? { pendingOtsCount: getPendingOtsSeals(200).length } : {}),
  };
}

function allJobNames(): string[] {
  return ['ots-poller', 'deadline-sweeper'];
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const GET: APIRoute = ({ request }) => {
  if (!isAuthorized(request)) return json({ error: 'Forbidden' }, 403);

  const jobs = allJobNames().map(buildJobHealth);
  const degraded = jobs.some(j => j.failureStreak >= ALERT_STREAK);

  return json({ ok: !degraded, jobs }, degraded ? 500 : 200);
};

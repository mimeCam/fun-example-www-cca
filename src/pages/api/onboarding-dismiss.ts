// src/pages/api/onboarding-dismiss.ts
// POST /api/onboarding-dismiss
// Sets onboarding_seen cookie (1yr, SSR gate for return visits).
// Records drop-off step in conviction_ledger for funnel analytics.
// Returns: { dismissed: true, step }
//
// Credits: Mike Koch (arch spec 2026-04-11)

import type { APIRoute } from 'astro';
import { appendAnalytic } from '../../lib/conviction-ledger';

export const prerender = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseStep(req: Request): Promise<number | 'complete' | null> {
  try {
    const body = await req.json() as { step?: unknown };
    const s = body.step;
    if (s === 'complete') return 'complete';
    const n = Number(s);
    if (n >= 1 && n <= 3) return n;
    return null;
  } catch { return null; }
}

function setCookieHeader(): string {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  return `onboarding_seen=1; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function trackDismiss(step: number | 'complete'): void {
  appendAnalytic('__onboarding__', 'onboarding_dismiss', { step, ts: Date.now() });
}

function jsonResponse(data: object, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const step = await parseStep(request);
  trackDismiss(step ?? 1);
  return jsonResponse(
    { dismissed: true, step: step ?? 1 },
    { 'Set-Cookie': setCookieHeader() },
  );
};

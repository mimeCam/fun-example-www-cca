// src/pages/api/verdict-resolve.ts
// POST endpoint — author seals a final verdict at runtime.
// Called once per post; double-seal returns { ok: false, alreadySealed: true }.
// Guards: ADMIN_SECRET (cookie or body), slug existence, valid verdict value.
//
// Auth paths (both supported):
//   1. Cookie: admin_token=<hmac>          — Admin web UI
//   2. Body:   { ..., adminSecret: string } — CLI / curl
//
// Response: { ok, verdict, hmac_seal, sealedAt, hash, postSlug, newBattingAverage }
//
// Credits: Mike (arch §verdict-resolve endpoint), Tanya (UX §3 verdict page)

import type { APIRoute } from 'astro';
import { createHmac } from 'crypto';
import { getCollection } from 'astro:content';
import { broadcastNamed } from '../../lib/heartbeat';
import { resolveVerdict, VerdictAlreadySealedError } from '../../lib/verdict-resolver';
import type { VerdictOutcome } from '../../lib/verdict-resolver';
import { computeBattingAverage, getUnlockProgress, getThermalState, MIN_VERDICTS, simulateVerdictDelta, invalidateBACacheFor } from '../../lib/batting-average';
import { getAnchorGistId, getSealEntry } from '../../lib/conviction-ledger';
import { anchorVerdict }          from '../../lib/conviction-anchor';
import { stamp, hashContent }     from '../../lib/rfc3161-client';
import { storeTst }               from '../../lib/timestamp-store';

export const prerender = false;

const VALID_VERDICTS = new Set<VerdictOutcome>(['still-true', 'evolved', 'wrong', 'abandoned']);

// ---------------------------------------------------------------------------
// Auth helpers — mirrors conviction-seal.ts exactly
// ---------------------------------------------------------------------------

function adminSecret(): string {
  return process.env.ADMIN_SECRET ?? '';
}

function expectedToken(secret: string): string {
  return createHmac('sha256', secret).update('admin-session').digest('hex');
}

function cookieAuthed(request: Request): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  return match ? match[1] === expectedToken(secret) : false;
}

function bodyAuthed(secret: unknown): boolean {
  const s = adminSecret();
  return !!s && secret === s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(msg: string): Response { return json({ error: msg }, 400); }
function forbidden(): Response { return json({ error: 'Forbidden' }, 403); }

async function slugExists(slug: string): Promise<boolean> {
  const posts = await getCollection('blog');
  return posts.some(p => p.slug === slug);
}

function isValidVerdict(v: unknown): v is VerdictOutcome {
  return typeof v === 'string' && VALID_VERDICTS.has(v as VerdictOutcome);
}

// ---------------------------------------------------------------------------
// GET — BA delta preview (no auth, read-only, public data)
// Mike §napkin: "Pure simulation — reads current BA + applies one hypothetical
// verdict. No write. Preview is always stale-safe."
// ---------------------------------------------------------------------------

export const GET: APIRoute = async ({ request }) => {
  const url     = new URL(request.url);
  const slug    = url.searchParams.get('slug');
  const verdict = url.searchParams.get('verdict');

  if (!slug)                  return badRequest('Missing slug');
  if (!isValidVerdict(verdict)) return badRequest('Invalid verdict');
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  const preview = simulateVerdictDelta(verdict);
  return json({ slug, verdict, preview });
};

// ---------------------------------------------------------------------------
// POST — seal a final verdict (auth required)
// ---------------------------------------------------------------------------

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return badRequest('Invalid JSON');

  const { slug, verdict, note = '', adminSecret: bodySecret } = body;

  if (!cookieAuthed(request) && !bodyAuthed(bodySecret)) return forbidden();
  if (!slug || typeof slug !== 'string') return badRequest('Missing slug');
  if (!isValidVerdict(verdict)) return badRequest('verdict must be: still-true | evolved | wrong | abandoned');
  if (!(await slugExists(slug))) return badRequest('Unknown slug');

  try {
    const secret = adminSecret();
    const record = resolveVerdict(slug, verdict, String(note ?? '').trim(), secret);

    // Append verdict to the conviction Gist — fail-open.
    const pat = process.env.GITHUB_PAT;
    if (pat) {
      const gistId = getAnchorGistId(slug);
      if (gistId) {
        try {
          await anchorVerdict(gistId, slug, record.verdict, record.hmac_seal, record.sealedAt, pat);
        } catch { /* GitHub down — verdict is sealed locally; anchor pending */ }
      }
    }

    // RFC 3161 trusted timestamp on the verdict close event — fail-open.
    try {
      const preimage = `${slug}:${record.verdict}:${record.originalScore}:${record.sealedAt}`;
      const tst      = await stamp(hashContent(preimage));
      storeTst(record.hash, tst.token, tst.tsaName);
    } catch (tstErr) {
      console.warn('[verdict-resolve] RFC 3161 stamp failed (verdict still valid):', tstErr);
    }

    // Invalidate BA cache — verdict changes resolved count and batting average.
    // Do this before broadcast so any SSE subscriber reading BA gets fresh data.
    const authorSlug = getSealEntry(slug)?.author_slug ?? 'host';
    invalidateBACacheFor(authorSlug);

    // Broadcast verdict:declared — non-blocking, fire-and-forget (never rejects POST).
    const batting = computeBattingAverage();
    const newBattingAverage = batting.status === 'live' ? batting.pct : null;
    try {
      const correct       = batting.status === 'live' ? batting.correct  : 0;
      const wrong         = batting.status === 'live' ? batting.wrong    : 0;
      const pending       = batting.status === 'live' ? batting.pending  : 0;
      const resolvedTotal = correct + wrong;
      const thermalState  = getThermalState(resolvedTotal);
      broadcastNamed('verdict:declared', {
        slug, verdict, newBattingAvg: newBattingAverage,
        correct, wrong, pending, resolvedTotal, thermalState,
        sealedAt: record.sealedAt,
      });
    } catch { /* broadcast failure must never reject the POST */ }

    // Broadcast batting-unlock if this verdict just crossed the unlock threshold.
    // Derived state — no new ledger event; count it, don't write it (Mike §POI #9).
    try {
      const progress = getUnlockProgress(authorSlug);
      if (progress.resolved === MIN_VERDICTS) {
        broadcastNamed('batting-unlock', { type: 'batting-unlock', authorSlug, ts: Date.now() });
      }
    } catch { /* non-critical — verdict already committed */ }

    // Structured response — contract for API consumers (Mike §verdict-resolve endpoint).
    return json({
      ok:                true,
      postSlug:          slug,
      verdict:           record.verdict,
      hmac_seal:         record.hmac_seal,
      sealedAt:          record.sealedAt,
      hash:              record.hash,
      newBattingAverage,
    });
  } catch (err) {
    if (err instanceof VerdictAlreadySealedError) {
      return json({ ok: false, alreadySealed: true, error: 'Verdict already sealed' }, 409);
    }
    throw err;
  }
};

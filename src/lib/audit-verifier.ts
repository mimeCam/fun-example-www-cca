// src/lib/audit-verifier.ts
// Pure data assembly for the /audit/[slug] conviction proof page.
// Read-only by contract: never calls sealConviction or appendResonance.
// Key security invariant: hmac_seal is NEVER included in any exported type.
// Every function ≤ 10 lines. No side effects.
//
// Credits: Mike (architecture spec — Conviction Audit Trail napkin plan)

import { getEntriesForSlug, getSealEntry } from './conviction-ledger';
import type { LedgerEntry, LedgerEventType } from './conviction-ledger';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Proof-safe seal — hmac_seal stripped. HMAC key stays server-side only. */
export interface RedactedSeal {
  slug: string;
  score: number;
  sealedAt: number;           // Unix ms
  hashPrefix: string;         // first 16 hex chars — enough for human verification
  verifyInstruction: string;  // openssl command readers can run themselves
}

/** One event in the public timeline. Flat struct — no subclassing. */
export interface TimelineEvent {
  eventType: LedgerEventType;
  timestamp: number;
  revivalCount: number;
  label: string;  // human-readable
}

/** Complete audit payload for a slug. */
export interface AuditPayload {
  slug: string;
  seal: RedactedSeal | null;  // null = post exists but not yet sealed
  timeline: TimelineEvent[];
  postTitle: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const EVENT_LABEL: Record<LedgerEventType, string> = {
  seal:          '🔒 Sealed',
  revival:       '💚 Revival',
  death:         '💀 Death',
  resurrection:  '🌱 Resurrection',
};

/** Build the openssl verify command shown to power users. */
function buildVerifyInstruction(slug: string, score: number, ts: number): string {
  return `echo -n "${slug}:${score}:${ts}" | openssl dgst -sha256 -hmac "$ADMIN_SECRET"`;
}

/** Strip hmac_seal from a LedgerEntry and produce a RedactedSeal. */
export function redactedSeal(entry: LedgerEntry): RedactedSeal {
  const score = entry.conviction_score ?? 0;
  return {
    slug:              entry.post_slug,
    score,
    sealedAt:          entry.timestamp,
    hashPrefix:        entry.hash.slice(0, 16),
    verifyInstruction: buildVerifyInstruction(entry.post_slug, score, entry.timestamp),
  };
}

/** Map LedgerEntry array to flat TimelineEvent array. No polymorphism. */
export function formatTimeline(entries: LedgerEntry[]): TimelineEvent[] {
  return entries.map(e => ({
    eventType:    e.event_type,
    timestamp:    e.timestamp,
    revivalCount: e.revival_count,
    label:        EVENT_LABEL[e.event_type] ?? e.event_type,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble the full audit payload for a slug.
 * Returns seal: null when the post has not been sealed — honest, not hidden.
 */
export function assembleAuditPayload(slug: string, postTitle: string): AuditPayload {
  const entries  = safeRead(() => getEntriesForSlug(slug), []);
  const sealRow  = safeRead(() => getSealEntry(slug), null);
  return {
    slug,
    postTitle,
    seal:     sealRow ? redactedSeal(sealRow) : null,
    timeline: formatTimeline(entries),
  };
}

/** Wrap a DB read that may fail during build (DB not yet seeded). */
function safeRead<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

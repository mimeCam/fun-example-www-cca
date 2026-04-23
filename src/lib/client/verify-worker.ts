// src/lib/client/verify-worker.ts
// Client island for /verify — fetches the canonical bundle DTO, then runs the
// pure verification math in the browser via the shared `verify-iso` shim.
//
// Architecture mirror of `live-conviction.ts` / `verdict-reveal.ts`:
//   · No framework. DOM events + a single `<section data-verify-root>`.
//   · CustomEvent bus only:
//       'verify:progress' { phase: 'fetch' | 'walk' | 'oracle', message }
//       'verify:done'     { outcome: VerifyOutcome }
//       'verify:fail'     { error: string }
//   · The receipt component listens with an inline `<script>` and paints.
//
// What this worker does NOT do (Mike §6.10 scope creep watch):
//   · Share buttons, embeds, QR codes, dashboards. Those are v+1.
//
// Credits: Mike Koch (napkin §6.6 "one island, not a framework"),
//          Sid (≤-10 LOC), Tanya (§7 "API parity is load-bearing").
//          2026-04-23.

import { verifyBundle } from '../verify-iso';
import type { VerifyOutcome } from '../verify-iso';

interface BundleDto {
  slug: string; sealed: boolean; status: string;
  preimage: string | null; otsBase64: string | null; calendarUrl: string | null;
}

const FETCH_TIMEOUT_MS = 5_000;
const ORACLE_TIMEOUT_MS = 8_000;

// ── DOM helpers ──────────────────────────────────────────────────────────

function findRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-verify-root]');
}

function progress(root: HTMLElement, phase: string, message: string): void {
  root.dispatchEvent(new CustomEvent('verify:progress', { detail: { phase, message } }));
}

function done(root: HTMLElement, outcome: VerifyOutcome): void {
  root.dispatchEvent(new CustomEvent('verify:done', { detail: { outcome } }));
}

function fail(root: HTMLElement, error: string): void {
  root.dispatchEvent(new CustomEvent('verify:fail', { detail: { error } }));
}

// ── Bundle fetch ─────────────────────────────────────────────────────────

async function fetchBundle(slug: string, signal: AbortSignal): Promise<BundleDto> {
  const res = await fetch(`/api/verify-bundle/${encodeURIComponent(slug)}`, { signal });
  if (!res.ok) throw new Error(`bundle ${res.status}`);
  return await res.json() as BundleDto;
}

function combinedSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  if (parent) return AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]);
  return AbortSignal.timeout(timeoutMs);
}

// ── Verification phases ──────────────────────────────────────────────────

async function loadBundle(root: HTMLElement, slug: string): Promise<BundleDto> {
  progress(root, 'fetch', 'fetching proof bundle…');
  return fetchBundle(slug, combinedSignal(FETCH_TIMEOUT_MS));
}

async function runVerify(root: HTMLElement, dto: BundleDto): Promise<VerifyOutcome> {
  progress(root, 'walk', 'walking proof against Bitcoin…');
  return verifyBundle({
    preimage: dto.preimage ?? '',
    otsBase64: dto.otsBase64,
    pendingHint: dto.calendarUrl ?? undefined,
  }, combinedSignal(ORACLE_TIMEOUT_MS));
}

// ── Public entry ─────────────────────────────────────────────────────────

/** Re-runs verification on the current root. Idempotent — safe to call again. */
export async function verifyCurrent(): Promise<VerifyOutcome | null> {
  const root = findRoot();
  if (!root) return null;
  const slug = root.dataset.slug ?? '';
  if (!slug) { fail(root, 'no slug'); return null; }
  return runFlow(root, slug);
}

async function runFlow(root: HTMLElement, slug: string): Promise<VerifyOutcome | null> {
  try {
    const dto = await loadBundle(root, slug);
    const outcome = await runVerify(root, dto);
    done(root, outcome);
    return outcome;
  } catch (err) {
    fail(root, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Wire one-time auto-boot + the "Re-verify" button. */
export function bootVerify(): void {
  const root = findRoot();
  if (!root) return;
  void verifyCurrent();
  wireRerun(root);
}

function wireRerun(root: HTMLElement): void {
  root.addEventListener('click', e => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-verify-rerun]');
    if (btn) { e.preventDefault(); void verifyCurrent(); }
  });
}

// Auto-boot at import time. The page's island uses `client:visible` so this
// never runs until the receipt scrolls into view (consistent with Mike §1).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootVerify, { once: true });
  } else {
    bootVerify();
  }
}

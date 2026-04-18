// src/lib/seal-ceremony.test.ts
// Integration tests for the seal ceremony state machine (createCeremony).
//
// Run with Node's built-in test runner (no extra dependencies):
//   npx tsx --test src/lib/seal-ceremony.test.ts
//
// Coverage:
//   - compose → anchor → notarize → receipt  (happy path)
//   - compose → anchor → cancel → compose    (abort path)
//   - AlreadySealedError (409) graceful degradation
//   - Phase sequence integrity: receipt requires passing anchor first
//   - onNotarize fires before onReceipt
//   - onPress / onRelease do not change top-level phase
//   - onHover / onUnhover only fire in compose phase
//
// Credits: Mike (napkin spec §Tests — integration tests for state machine),
//          Tanya (UX spec §4 phase map)

import { test, describe, beforeEach, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCeremony, AlreadySealedError } from './seal-ceremony.js';
import type { ReceiptData, CeremonyCallbacks } from './seal-ceremony.js';
import type { SealPhase } from './seal-phases.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SLUG = 'test-post';

const RECEIPT_FIXTURE: ReceiptData = {
  postSlug:       SLUG,
  hash:           'abc123def456abc123def456abc123de',
  sealedAt:       '1713398400000', // 2026-04-18T00:00:00Z as ms string
  score:          8,
  authorNote:     'This will age well.',
  anchorUrl:      'https://gist.github.com/test/abc',
  tst_token:      'base64token==',
  ceremony_phase: 4,
};

function makeReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return { ...RECEIPT_FIXTURE, ...overrides };
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockFetchSuccess(receipt = makeReceipt()): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(receipt), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

function mockFetchConflict(): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Already sealed' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
}

function mockFetchServerError(): void {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
}

// Collect phase transitions during a test run.
function collectPhases(phases: SealPhase[]): (p: SealPhase) => void {
  return (p) => phases.push(p);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createCeremony — state machine', () => {
  // Restore original fetch after each test
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  test('happy path: compose → anchor → notarize → receipt', async () => {
    mockFetchSuccess();

    const phases: SealPhase[]     = [];
    const notarized: ReceiptData[] = [];
    const receipts:  ReceiptData[] = [];

    const ceremony = createCeremony(SLUG, {
      onPhase:    collectPhases(phases),
      onNotarize: (d) => notarized.push(d),
      onReceipt:  (d) => receipts.push(d),
      onError:    (msg) => assert.fail(`unexpected error: ${msg}`),
    });

    assert.equal(ceremony.phase(), 'compose', 'starts in compose');

    await ceremony.submit(8, 'Test conviction note');

    assert.deepEqual(
      phases,
      ['anchor', 'receipt'],
      'phase sequence: anchor → receipt',
    );
    assert.equal(notarized.length, 1, 'onNotarize fires once');
    assert.equal(receipts.length,  1, 'onReceipt fires once');
    assert.equal(ceremony.phase(), 'receipt', 'ends in receipt');
  });

  // ── onNotarize fires before onReceipt ───────────────────────────────────────

  test('onNotarize fires before onReceipt', async () => {
    mockFetchSuccess();

    const callOrder: string[] = [];

    await createCeremony(SLUG, {
      onPhase:    () => {},
      onNotarize: () => callOrder.push('notarize'),
      onReceipt:  () => callOrder.push('receipt'),
      onError:    (msg) => assert.fail(msg),
    }).submit(5, 'Ordering test');

    assert.deepEqual(callOrder, ['notarize', 'receipt'], 'notarize precedes receipt');
  });

  // ── Abort path ──────────────────────────────────────────────────────────────

  test('abort path: anchor → cancel → compose', async () => {
    // The mock must respect the AbortSignal — real fetch rejects with DOMException
    // when the signal fires. Without this, ceremony.cancel() is a no-op in tests.
    globalThis.fetch = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          rej(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });

    const phases: SealPhase[] = [];
    let cancelFired = false;

    const ceremony = createCeremony(SLUG, {
      onPhase:    collectPhases(phases),
      onNotarize: () => {},
      onReceipt:  () => {},
      onError:    (msg) => assert.fail(`unexpected error: ${msg}`),
      onCancel:   () => { cancelFired = true; },
    });

    const submitPromise = ceremony.submit(7, 'Cancellation test');
    // ceremony is now in anchor phase — cancel triggers AbortError → onCancel
    ceremony.cancel();
    await submitPromise;

    assert.ok(cancelFired, 'onCancel callback fires');
    assert.equal(ceremony.phase(), 'compose', 'returns to compose after cancel');
    assert.ok(phases.includes('anchor'), 'passed through anchor');
  });

  // ── 409 AlreadySealedError graceful degradation ─────────────────────────────

  test('409 triggers onAlreadySealed, not onError', async () => {
    mockFetchConflict();

    let alreadySealedFired = false;
    let errorFired = false;

    await createCeremony(SLUG, {
      onPhase:         () => {},
      onNotarize:      () => {},
      onReceipt:       () => {},
      onError:         () => { errorFired = true; },
      onAlreadySealed: () => { alreadySealedFired = true; },
    }).submit(6, 'Already sealed test');

    assert.ok(alreadySealedFired,  'onAlreadySealed fires on 409');
    assert.ok(!errorFired,         'onError does NOT fire on 409');
  });

  // ── Server error triggers onError ───────────────────────────────────────────

  test('5xx triggers onError with message', async () => {
    mockFetchServerError();

    let errorMsg = '';

    await createCeremony(SLUG, {
      onPhase:    () => {},
      onNotarize: () => {},
      onReceipt:  () => {},
      onError:    (msg) => { errorMsg = msg; },
    }).submit(5, 'Error test');

    assert.ok(errorMsg.length > 0, 'onError receives a message on 5xx');
  });

  // ── Phase sequence integrity ─────────────────────────────────────────────────
  // Cannot reach receipt without passing through anchor.

  test('phase() stays compose before submit()', () => {
    mockFetchSuccess();

    const ceremony = createCeremony(SLUG, {
      onPhase: () => {}, onNotarize: () => {}, onReceipt: () => {}, onError: () => {},
    });

    assert.equal(ceremony.phase(), 'compose', 'phase is compose before submit');
  });

  // ── Compose-layer micro-events don't change phase ────────────────────────────

  test('onPress / onRelease do not change top-level phase', () => {
    const phases: SealPhase[] = [];
    let pressCount   = 0;
    let releaseCount = 0;

    const ceremony = createCeremony(SLUG, {
      onPhase:   collectPhases(phases),
      onNotarize: () => {}, onReceipt: () => {}, onError: () => {},
      onPress:   () => { pressCount++;   },
      onRelease: () => { releaseCount++; },
    });

    ceremony.press();
    ceremony.release();
    ceremony.press();
    ceremony.release();

    assert.equal(pressCount,   2, 'onPress fires per call');
    assert.equal(releaseCount, 2, 'onRelease fires per call');
    assert.deepEqual(phases, [],  'no phase transitions from press/release');
    assert.equal(ceremony.phase(), 'compose', 'phase unchanged');
  });

  // ── Hover / unhover guard: only fires in compose phase ──────────────────────

  test('onHover / onUnhover only fire in compose phase', async () => {
    mockFetchSuccess();

    let hoverCount   = 0;
    let unhoverCount = 0;
    const phases: SealPhase[] = [];

    const ceremony = createCeremony(SLUG, {
      onPhase:   (p) => { phases.push(p); },
      onNotarize: () => {}, onReceipt: () => {}, onError: () => {},
      onHover:   () => { hoverCount++;   },
      onUnhover: () => { unhoverCount++; },
    });

    // In compose — should fire.
    ceremony.hover();
    ceremony.unhover();
    assert.equal(hoverCount,   1, 'hover fires in compose');
    assert.equal(unhoverCount, 1, 'unhover fires in compose');

    // Use abort-aware mock so cancel() produces the expected AbortError.
    globalThis.fetch = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          rej(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });

    // Advance past compose by submitting (enters anchor phase).
    const submitPromise = ceremony.submit(5, 'Hover guard test');
    // Cancel → AbortError → handleError → setPhase('compose')
    ceremony.cancel();
    await submitPromise;

    // Back in compose — hover should fire again.
    ceremony.hover();
    assert.equal(hoverCount, 2, 'hover fires again after returning to compose');
  });

  // ── cancel() is a no-op outside anchor phase ────────────────────────────────

  test('cancel() in compose phase is a no-op', () => {
    const ceremony = createCeremony(SLUG, {
      onPhase: () => {}, onNotarize: () => {}, onReceipt: () => {}, onError: () => {},
      onCancel: () => assert.fail('cancel should not fire in compose'),
    });

    // Should not throw, should not fire onCancel.
    ceremony.cancel();
    assert.equal(ceremony.phase(), 'compose', 'phase unchanged');
  });
});

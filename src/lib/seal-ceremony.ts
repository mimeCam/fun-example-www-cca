// src/lib/seal-ceremony.ts
// Seal ceremony orchestrator — state machine + fetch + phase 3.5 notarize moment.
// Phase 0: idle | 1: hover | 2: press | 3: lock (fetching) | 3.5: notarize | 4: receipt
//
// Credits: Mike (§Architecture §CSS-state-machine §Phase-3.5-design), Tanya (§Moment-1)

export type { SealPhase } from './seal-phases';
import { NOTARIZE }        from './seal-phases';
import type { SealPhase }  from './seal-phases';

/** Thrown when the server returns 409 — post already sealed (good news, not an error). */
export class AlreadySealedError extends Error {
  constructor() { super('Already sealed'); this.name = 'AlreadySealedError'; }
}

export interface ReceiptData {
  postSlug:       string;
  hash:           string;
  sealedAt:       string;
  score:          number;
  authorNote:     string;
  anchorUrl:      string | null;
  tst_token:      string | null;   // Base64 RFC 3161 token — null when TSA unavailable
  ceremony_phase: number;
}

export interface CeremonyCallbacks {
  onPhase:         (phase: SealPhase)  => void;
  onNotarize:      (data: ReceiptData) => void; // fires at 3.5 — populate stamp before pause
  onReceipt:       (data: ReceiptData) => void; // fires at 4 — after ceremonial pause
  onError:         (msg: string)       => void;
  onAlreadySealed?: ()                => void; // fires on 409 — good news, not an error
  onCancel?:        ()                => void; // fires when user cancels at phase 3
}

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function fetchSeal(
  slug: string, score: number, note: string, signal: AbortSignal,
): Promise<ReceiptData> {
  const res  = await fetch('/api/conviction-seal', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ slug, score, authorNote: note }),
    signal,
  });
  const data = await res.json() as ReceiptData & { error?: string };
  if (res.status === 409) throw new AlreadySealedError();
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export function createCeremony(slug: string, cb: CeremonyCallbacks) {
  let current:   SealPhase        = 0;
  let abortCtrl: AbortController | null = null;

  const setPhase = (n: SealPhase): void => { current = n; cb.onPhase(n); };

  const hover   = (): void => { if (current === 0) setPhase(1); };
  const unhover = (): void => { if (current === 1) setPhase(0); };
  const press   = (): void => { if (current <= 1)  setPhase(2); };
  const release = (): void => { if (current === 2) setPhase(0); };

  /** Cancel the in-flight POST at phase 3. Safe if fetch already resolved. */
  function cancel(): void {
    if (current !== 3 || !abortCtrl) return;
    abortCtrl.abort();
  }

  async function notarize(data: ReceiptData): Promise<void> {
    setPhase(NOTARIZE);
    cb.onNotarize(data);
    // Ceremonial pause: do not remove, do not shorten. This is the product.
    // The 800 ms is the psychological weight of the moment before receipt expansion.
    await delay(800);
    setPhase(4);
    cb.onReceipt(data);
  }

  function handleError(e: unknown): void {
    abortCtrl = null;
    if (e instanceof DOMException && e.name === 'AbortError') {
      setPhase(0);
      cb.onCancel?.();
      return;
    }
    setPhase(0);
    if (e instanceof AlreadySealedError) cb.onAlreadySealed?.();
    else cb.onError(e instanceof Error ? e.message : 'Seal failed');
  }

  async function submit(score: number, authorNote: string): Promise<void> {
    abortCtrl = new AbortController();
    setPhase(3);
    try {
      const data = await fetchSeal(slug, score, authorNote, abortCtrl.signal);
      abortCtrl = null;
      await notarize(data);
    } catch (e) { handleError(e); }
  }

  return {
    start:   (): void      => setPhase(0),
    hover,
    unhover,
    press,
    release,
    cancel,
    submit,
    phase:   (): SealPhase => current,
  };
}

// src/lib/seal-ceremony.ts
// Seal ceremony orchestrator — state machine + fetch + notarize moment.
//
// Phases (conviction variant — no confirm step, compose → anchor directly):
//   compose  → score entry + note (user is filling in the form)
//   anchor   → POST in flight, gold arc (1800ms minimum)
//   receipt  → sealed document displayed
//
// The notarize moment is a sub-state of anchor. onNotarize fires between
// the fetch resolving and the receipt becoming visible. The caller is
// responsible for setting data-seal-phase="notarize" to trigger CSS animations.
//
// Compose-layer micro-events (hover/press/release) fire dedicated callbacks
// without changing the top-level SealPhase — they drive arc fill and haptics.
//
// Credits: Mike (§Architecture §Phase-unification), Tanya (§Moment-1)

export type { SealPhase } from './seal-phases';
import type { SealPhase } from './seal-phases';

/** Thrown when the server returns 409 — already sealed is good news, not an error. */
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
  onPhase:          (phase: SealPhase)  => void;
  onNotarize:       (data: ReceiptData) => void; // fires mid-anchor — populate stamp before pause
  onReceipt:        (data: ReceiptData) => void; // fires at receipt — after ceremonial pause
  onError:          (msg: string)       => void;
  onAlreadySealed?: ()                  => void; // 409 — graceful degradation, not an error
  onCancel?:        ()                  => void; // AbortError — user cancelled at anchor
  // Compose-layer micro-events — drive arc animation / haptics without phase change
  onHover?:         () => void;
  onUnhover?:       () => void;
  onPress?:         () => void;
  onRelease?:       () => void;
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
  let current:   SealPhase             = 'compose';
  let abortCtrl: AbortController | null = null;

  const setPhase = (p: SealPhase): void => { current = p; cb.onPhase(p); };

  // Compose-layer micro-events — do not change top-level phase.
  // Guards ensure they only fire when the ceremony is in compose.
  const hover   = (): void => { if (current === 'compose') cb.onHover?.();   };
  const unhover = (): void => { if (current === 'compose') cb.onUnhover?.(); };
  const press   = (): void => { if (current === 'compose') cb.onPress?.();   };
  const release = (): void => { if (current === 'compose') cb.onRelease?.(); };

  /** Cancel the in-flight POST at anchor phase. Safe if fetch already resolved. */
  function cancel(): void {
    if (current !== 'anchor' || !abortCtrl) return;
    abortCtrl.abort();
  }

  async function notarize(data: ReceiptData): Promise<void> {
    cb.onNotarize(data);
    // Ceremonial pause — do not remove, do not shorten.
    // 800ms is the psychological weight of irreversibility sinking in.
    await delay(800);
    setPhase('receipt');
    cb.onReceipt(data);
  }

  function handleError(e: unknown): void {
    abortCtrl = null;
    if (e instanceof DOMException && e.name === 'AbortError') {
      setPhase('compose');
      cb.onCancel?.();
      return;
    }
    setPhase('compose');
    if (e instanceof AlreadySealedError) cb.onAlreadySealed?.();
    else cb.onError(e instanceof Error ? e.message : 'Seal failed');
  }

  async function submit(score: number, authorNote: string): Promise<void> {
    abortCtrl = new AbortController();
    setPhase('anchor');
    try {
      const data = await fetchSeal(slug, score, authorNote, abortCtrl.signal);
      abortCtrl = null;
      await notarize(data);
    } catch (e) { handleError(e); }
  }

  return {
    start:   (): void      => setPhase('compose'),
    hover,
    unhover,
    press,
    release,
    cancel,
    submit,
    phase:   (): SealPhase => current,
  };
}

// src/lib/seal-ceremony.ts
// Pure TS state machine — 5-phase seal ceremony, zero DOM dependencies.
// Phase 0: idle | 1: hover | 2: press | 3: lock (fetching) | 4: receipt
// Credits: Mike (§Architecture §CSS-state-machine), Tanya (§Moment-1 animation spec)

export type SealPhase = 0 | 1 | 2 | 3 | 4;

export interface ReceiptData {
  hash:           string;
  sealedAt:       string;
  score:          number;
  authorNote:     string;
  anchorUrl:      string | null;
  ceremony_phase: number;
}

export interface CeremonyCallbacks {
  onPhase:   (phase: SealPhase) => void;
  onReceipt: (data: ReceiptData) => void;
  onError:   (msg: string) => void;
}

async function fetchSeal(slug: string, score: number, note: string): Promise<ReceiptData> {
  const res  = await fetch('/api/conviction-seal', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ slug, score, authorNote: note }),
  });
  const data = await res.json() as ReceiptData & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export function createCeremony(slug: string, cb: CeremonyCallbacks) {
  let current: SealPhase = 0;

  const setPhase = (n: SealPhase): void => { current = n; cb.onPhase(n); };

  const hover   = (): void => { if (current === 0) setPhase(1); };
  const unhover = (): void => { if (current === 1) setPhase(0); };
  const press   = (): void => { if (current <= 1) setPhase(2); };
  const release = (): void => { if (current === 2) setPhase(0); };

  async function submit(score: number, authorNote: string): Promise<void> {
    setPhase(3);
    try {
      const data = await fetchSeal(slug, score, authorNote);
      setPhase(4);
      cb.onReceipt(data);
    } catch (e) {
      setPhase(0);
      cb.onError(e instanceof Error ? e.message : 'Seal failed');
    }
  }

  return {
    start:   (): void      => setPhase(0),
    hover,
    unhover,
    press,
    release,
    submit,
    phase:   (): SealPhase => current,
  };
}

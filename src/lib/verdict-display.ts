// src/lib/verdict-display.ts
// Data assembly for AuditVerdictPanel — pure composition over existing modules.
// Single responsibility: map verdict + dispute state → a display-ready model.
// No new DB queries. No new tables. Read-only.
// Credits: Mike (napkin plan §verdict-display), Tanya (UX §11 audit receipt)

import { getVerdictRecord }   from './verdict-resolver';
import type { VerdictOutcome } from './verdict-resolver';
import { getDisputeState, getDisputeResolution } from './verdict-dispute';
import type { DisputeState }   from './verdict-dispute';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerdictDisplay {
  verdict:        VerdictOutcome | null;
  verdictLabel:   string;
  declaredAt:     number | null;
  isContested:    boolean;
  disputeState:   'upheld' | 'overturned' | 'none';
  challengeShare: number | null;   // 0–100
  scoreContrib:   'correct' | 'wrong' | 'neutral' | 'contested' | 'pending';
}

// ---------------------------------------------------------------------------
// Pure helpers — each ≤ 10 lines
// ---------------------------------------------------------------------------

const VERDICT_LABELS: Record<VerdictOutcome, string> = {
  'still-true': 'Held true',
  'evolved':    'Evolved',
  'wrong':      'Was wrong',
  'abandoned':  'Abandoned',
};

function toLabel(v: VerdictOutcome | null): string {
  return v ? (VERDICT_LABELS[v] ?? 'Unknown') : 'Pending';
}

function toScoreContrib(
  v: VerdictOutcome,
  contested: boolean,
): VerdictDisplay['scoreContrib'] {
  if (contested) return 'contested';
  if (v === 'still-true') return 'correct';
  if (v === 'wrong' || v === 'abandoned') return 'wrong';
  return 'neutral'; // 'evolved' — excluded from denominator
}

/** Extract challenge share pct from live or resolved dispute state. */
function toChallengeShare(state: DisputeState, resolvedPct: number | undefined): number | null {
  if (resolvedPct !== undefined) return resolvedPct;
  if (state.status === 'contested' || state.status === 'clean') {
    return Math.round(state.ratio * 100);
  }
  return null;
}

const PENDING_DISPLAY: VerdictDisplay = {
  verdict: null, verdictLabel: 'Pending', declaredAt: null,
  isContested: false, disputeState: 'none', challengeShare: null,
  scoreContrib: 'pending',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Assemble a display-ready verdict model for a slug. Never throws. */
export function getVerdictDisplay(slug: string): VerdictDisplay {
  const record = getVerdictRecord(slug);
  if (!record) return { ...PENDING_DISPLAY };

  const liveState  = getDisputeState(slug);
  const resolution = getDisputeResolution(slug);
  const contested  = liveState.status === 'contested';

  return {
    verdict:        record.verdict,
    verdictLabel:   toLabel(record.verdict),
    declaredAt:     record.sealedAt,
    isContested:    contested,
    disputeState:   resolution?.state ?? 'none',
    challengeShare: toChallengeShare(liveState, resolution?.challenge_share_pct),
    scoreContrib:   toScoreContrib(record.verdict, contested),
  };
}

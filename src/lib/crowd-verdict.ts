// src/lib/crowd-verdict.ts
// Pure function: user's stance + post-vote distribution → emotionally precise crowd copy.
// No side effects. No DOM. SSR-safe — usable in audit/[slug].astro or server-side render.
// Inlined in StickyStanceBar <script> for client use (Astro island boundary constraint).
// Credits: Mike (napkin plan §crowd-verdict.ts), Tanya (UX spec §4 Crowd-Copy table)

import type { StanceValue, StanceDistribution } from './stance-ledger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrowdPosition =
  | 'lone-voice'       // user's stance < 15% of total
  | 'minority'         // 15–33%
  | 'torn-house'       // no single stance > 40% (everyone genuinely split)
  | 'with-many'        // 34–59%
  | 'majority'         // 60–79%
  | 'near-unanimous';  // ≥ 80%

export interface CrowdVerdict {
  position: CrowdPosition;
  copy: string;         // e.g. "You're a lone voice."
  subCopy?: string;     // e.g. "Only 8% agree." — rendered smaller below copy
  intensity: 'quiet' | 'moderate' | 'strong';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function classifyPosition(stance: StanceValue, dist: StanceDistribution): CrowdPosition {
  const userPct = pct(dist[stance], dist.total);
  const maxPct  = Math.max(pct(dist.agree, dist.total), pct(dist.torn, dist.total), pct(dist.disagree, dist.total));
  if (maxPct < 40)   return 'torn-house';
  if (userPct < 15)  return 'lone-voice';
  if (userPct <= 33) return 'minority';
  if (userPct <= 59) return 'with-many';
  if (userPct <= 79) return 'majority';
  return 'near-unanimous';
}

// ---------------------------------------------------------------------------
// Copy table — the only copy that matters on this platform (Mike §crowd-verdict)
// ---------------------------------------------------------------------------

type VerdictFactory = (n: number) => CrowdVerdict;

const VERDICTS: Record<CrowdPosition, VerdictFactory> = {
  'lone-voice':     (n) => ({ position: 'lone-voice',     copy: "You're a lone voice.",       subCopy: `Only ${n}% agree.`,      intensity: 'strong'   }),
  'minority':       (n) => ({ position: 'minority',       copy: "You're in the minority.",     subCopy: `${n}% share your view.`, intensity: 'moderate' }),
  'torn-house':     (_) => ({ position: 'torn-house',     copy: "This one's genuinely split.", subCopy: "No side has it.",         intensity: 'quiet'    }),
  'with-many':      (n) => ({ position: 'with-many',      copy: "You're with the crowd.",      subCopy: `${n}% agree.`,           intensity: 'quiet'    }),
  'majority':       (n) => ({ position: 'majority',       copy: "You're with the majority.",   subCopy: `${n}% agree.`,           intensity: 'quiet'    }),
  'near-unanimous': (n) => ({ position: 'near-unanimous', copy: "The crowd agrees with you.",  subCopy: `${n}% align.`,           intensity: 'strong'   }),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify where the reader stands among everyone else who voted on this post.
 * Special case: first voter (dist.total === 1) gets a unique acknowledgement.
 */
export function getCrowdVerdict(
  stance: StanceValue,
  dist: StanceDistribution,
): CrowdVerdict {
  if (dist.total === 1) {
    return { position: 'lone-voice', copy: "You're first to weigh in.", intensity: 'strong' };
  }
  const position = classifyPosition(stance, dist);
  return VERDICTS[position](pct(dist[stance], dist.total));
}

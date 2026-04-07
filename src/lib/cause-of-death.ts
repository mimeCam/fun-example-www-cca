// src/lib/cause-of-death.ts
// Pure cause-of-death classifier for entombed posts.
// No DB, no side effects — pure functions only (testable in isolation).
//
// Classification priority is editorial intent (see comment below).
// Credits: Mike (arch spec — Cause-of-Death Labels napkin plan)

// ---------------------------------------------------------------------------
// Classification priority order — product decision, not just code order.
//
//   1. SUPERSEDED — author explicitly retired the post (voluntary, never a failure)
//   2. UNSEALED   — no conviction seal at death (author never staked a claim)
//   3. REJECTED   — tension score >0.7; readers actively voted it down
//   4. ABANDONED  — sealed but silence answered; near-zero engagement
//   5. DECAYED    — default; time won despite some engagement
//
// SUPERSEDED before UNSEALED: a retired post must not be mislabelled as
// unsealed simply because the author didn't seal it first.
// REJECTED before ABANDONED: active reader disapproval is different from silence.
// ---------------------------------------------------------------------------

export type CauseOfDeath =
  | 'SUPERSEDED'   // author voluntarily retired it (future: frontmatter flag)
  | 'UNSEALED'     // died without a conviction seal — no author stake
  | 'REJECTED'     // tension score >0.7 against — readers voted it down
  | 'ABANDONED'    // conviction sealed, near-zero readers ever came
  | 'DECAYED';     // default: time won despite moderate engagement

export interface CauseData {
  convictionSealed: boolean;      // did the author stake a claim?
  revivalCount:     number;       // total reader revivals
  readingSeconds:   number;       // total passive reading time accumulated
  tensionScore:     number | null; // 0–1 range; null until >=3 stances recorded
  authorRetired:    boolean;      // explicit editorial flag (future use)
}

/** Classify cause of death from post engagement data. Priority order is editorial. */
export function computeCauseOfDeath(d: CauseData): CauseOfDeath {
  if (d.authorRetired)                                       return 'SUPERSEDED';
  if (!d.convictionSealed)                                   return 'UNSEALED';
  if (d.tensionScore !== null && d.tensionScore > 0.7)      return 'REJECTED';
  if (d.readingSeconds < 120 && d.revivalCount === 0)       return 'ABANDONED';
  return 'DECAYED';
}

/** Short display label shown on tombstone badge. */
export function causeLabel(cause: CauseOfDeath): string {
  switch (cause) {
    case 'SUPERSEDED': return 'Superseded';
    case 'UNSEALED':   return 'Unsealed';
    case 'REJECTED':   return 'Rejected';
    case 'ABANDONED':  return 'Abandoned';
    case 'DECAYED':    return 'Decayed';
    default: { const _: never = cause; throw new Error(`Unknown cause: ${String(_)}`); }
  }
}

/** One-sentence editorial description — shown in badge tooltip. */
export function causeDescription(cause: CauseOfDeath): string {
  switch (cause) {
    case 'SUPERSEDED': return 'The author retired this idea — superseded by newer thinking.';
    case 'UNSEALED':   return 'The author never committed a conviction seal before it died.';
    case 'REJECTED':   return 'Readers pushed back — the tension score ran against it.';
    case 'ABANDONED':  return 'Conviction sealed, but silence answered. No one came.';
    case 'DECAYED':    return 'Time won. Despite some engagement, the clock ran out.';
    default: { const _: never = cause; throw new Error(`Unknown cause: ${String(_)}`); }
  }
}

/** CSS class suffix for per-cause tombstone badge styling. */
export function causeCSSClass(cause: CauseOfDeath): string {
  switch (cause) {
    case 'SUPERSEDED': return 'cause-superseded';
    case 'UNSEALED':   return 'cause-unsealed';
    case 'REJECTED':   return 'cause-rejected';
    case 'ABANDONED':  return 'cause-abandoned';
    case 'DECAYED':    return 'cause-decayed';
    default: { const _: never = cause; throw new Error(`Unknown cause: ${String(_)}`); }
  }
}

// ---------------------------------------------------------------------------
// Sanity checks — inline contract docs (see openloop/inplace-testing-howto.md)
// ---------------------------------------------------------------------------

function _assertPriority(): void {
  // SUPERSEDED wins even when also unsealed + no engagement
  const r = computeCauseOfDeath({ convictionSealed: false, revivalCount: 0, readingSeconds: 0, tensionScore: null, authorRetired: true });
  console.assert(r === 'SUPERSEDED', 'authorRetired → SUPERSEDED');
}

function _assertUnsealed(): void {
  const r = computeCauseOfDeath({ convictionSealed: false, revivalCount: 5, readingSeconds: 600, tensionScore: null, authorRetired: false });
  console.assert(r === 'UNSEALED', '!sealed → UNSEALED regardless of engagement');
}

function _assertRejected(): void {
  const r = computeCauseOfDeath({ convictionSealed: true, revivalCount: 0, readingSeconds: 0, tensionScore: 0.8, authorRetired: false });
  console.assert(r === 'REJECTED', 'tensionScore 0.8 → REJECTED');
}

function _assertRejectedBoundary(): void {
  const below = computeCauseOfDeath({ convictionSealed: true, revivalCount: 0, readingSeconds: 0, tensionScore: 0.7, authorRetired: false });
  console.assert(below !== 'REJECTED', 'tensionScore 0.7 (boundary) → not REJECTED');
}

function _assertAbandoned(): void {
  const r = computeCauseOfDeath({ convictionSealed: true, revivalCount: 0, readingSeconds: 60, tensionScore: null, authorRetired: false });
  console.assert(r === 'ABANDONED', 'sealed, <120s, 0 revivals → ABANDONED');
}

function _assertDecayed(): void {
  const r = computeCauseOfDeath({ convictionSealed: true, revivalCount: 2, readingSeconds: 300, tensionScore: 0.4, authorRetired: false });
  console.assert(r === 'DECAYED', 'sealed + some engagement → DECAYED');
}

function _assertHelpers(): void {
  console.assert(causeLabel('ABANDONED') === 'Abandoned',       'label: ABANDONED');
  console.assert(causeLabel('DECAYED') === 'Decayed',           'label: DECAYED');
  console.assert(causeDescription('UNSEALED').length > 0,        'description non-empty');
  console.assert(causeCSSClass('REJECTED') === 'cause-rejected', 'css: REJECTED');
  console.assert(causeCSSClass('DECAYED') === 'cause-decayed',   'css: DECAYED');
}

export function _testCauseOfDeath(): void {
  _assertPriority();
  _assertUnsealed();
  _assertRejected();
  _assertRejectedBoundary();
  _assertAbandoned();
  _assertDecayed();
  _assertHelpers();
  console.log('[cause-of-death] OK — all checks passed');
}

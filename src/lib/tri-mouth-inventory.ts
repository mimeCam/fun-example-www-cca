// src/lib/tri-mouth-inventory.ts
// v173 "Tri-Mouth Inventory" — the single frozen literal that names every
// user-writable action on this site and, for each one, WHICH three
// affordances (pointer / keyboard / curl) route through the SAME producer.
//
// Rule of the module (Mike napkin §3, "polymorphism is a killer"):
//   · One `TRI_MOUTH_ACTIONS` tuple. No parallel lists in docs, tokens,
//     READMEs, or markdown. Readers (guard, golden test, future UI legend)
//     all import this symbol — never re-describe the shape.
//   · Adding a row = one PR, same day as the producer lands.
//   · Renaming a mouth = breaking change; bump the version in the header.
//
// Anti-scope: no new tokens, no new routes, no side effects, no fs, no DOM.
// The inventory is a *description* of reality — it does not DEFINE reality.
// Promotion happens separately as mouths are wired.
//
// Credits: Mike Koch (napkin §1–11 — the wedge, the shape, the scope
//          discipline), Tanya Donska (UX §3 — the "one chord, three bays"
//          framing that this inventory eventually feeds a UI legend for,
//          out-of-scope here), Elon (§3.2 wedges 1–3), Krystle Clear
//          (--warn → --error clock-migration cadence), prior-sprint
//          authors of stage-axes.ts + handler-dispatch.ts, AGENTS.md
//          (freeze, single-literal rule). Sid — 2026-04-23.
//          Motto: "code maintenance without tests."

// ── Types ─────────────────────────────────────────────────────────────────

/** HTTP verbs the curl mouth is allowed to speak. Same alphabet as the
 *  shared handler-dispatcher (src/lib/handler-dispatch.ts::HttpVerb) so
 *  the in-process golden test can walk this inventory without translation. */
export const TRI_MOUTH_VERBS = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
] as const;

export type TriMouthVerb = typeof TRI_MOUTH_VERBS[number];

/** Status literal — a closed vocabulary mirroring the promotion ladder.
 *  A `pending-*` action is a debt receipt: the guard counts it every
 *  prebuild until the missing mouth is wired. */
export const TRI_MOUTH_STATUSES = [
  'wired',              // all three mouths present + tested
  'wired-no-golden',    // all three mouths present, golden test deferred
  'pending-keyboard',   // pointer + curl present; keyboard affordance owed
  'pending-curl',       // pointer + keyboard present; curl peer owed
  'pending-pointer',    // keyboard + curl present; pointer owed
  'pending-curl-peer',  // curl shape exists but does not peer the ledger
] as const;

export type TriMouthStatus = typeof TRI_MOUTH_STATUSES[number];

/** Optional `pending` hint — names the single missing mouth. When set,
 *  the guard's surface-completeness check (invariant §5.4) counts but
 *  does not fail on the null affordance. Drop the field the day the
 *  mouth is wired. */
export type TriMouthPending = 'pointer' | 'keyboard' | 'curl';

/** One user-writable action — three mouths, one producer. Readonly on
 *  purpose: consumers never mutate; adding a row = edit this file. */
export interface TriMouthAction {
  /** Stable identifier. Kebab-case. Referenced by guard diagnostics. */
  readonly name: string;
  /** Human label — shown in the (future) UI legend and in CI output. */
  readonly mouth: string;
  /** Pointer affordance: a selector or page path that the user can click.
   *  `null` iff `pending === 'pointer'`. */
  readonly pointer: string | null;
  /** Keyboard affordance: the key(s) that fire the same producer.
   *  `null` iff `pending === 'keyboard'`. */
  readonly keyboard: string | null;
  /** Curl affordance: `VERB /api/<path>` — shape-checked by the guard. */
  readonly curl: string | null;
  /** Producer module: the ONE file that computes the payload shape.
   *  Path is repo-relative, always `src/lib/...ts`. */
  readonly producer: string;
  /** Promotion status — drives the guard's wedge accounting. */
  readonly status: TriMouthStatus;
  /** When present, names the single mouth this row is `null` on. */
  readonly pending?: TriMouthPending;
}

// ── The inventory (the ONE frozen literal) ───────────────────────────────
//
// Seed rows describe reality as of v173. Every row is either "wired"
// (all three mouths present, producer is the single oracle) or tagged
// with `pending` + `status` to receipt the debt. Reordering is safe;
// renaming `name` is a breaking-change.

export const TRI_MOUTH_ACTIONS: readonly TriMouthAction[] = [
  {
    name:     'cite-cell',
    mouth:    'cite a /api/docs matrix cell',
    pointer:  '.api-docs__matrix [data-cell-copy]',
    keyboard: 'c|Enter|Space',
    curl:     'GET /api/docs/cite',
    producer: 'src/lib/stage-axes.ts',
    status:   'wired',
  },
  {
    name:     'submit-post',
    mouth:    'submit a community article',
    pointer:  '/community form',
    // v174 wedge — Ctrl+Enter (Linux/Win) and ⌘↩ (macOS) publish from
    // step-3 of the composer via src/lib/client/submit-hotkey.ts. The
    // hotkey synthesises a click on `#btn-publish` so the publish path
    // stays single-source-of-truth (Mike napkin v174.1 §6.1, §7).
    keyboard: '⌘↩|Ctrl+Enter',
    curl:     'POST /api/submit-post',
    producer: 'src/lib/communityPosts.ts',
    status:   'wired',
  },
  {
    name:     'keep-post',
    mouth:    'keep an endangered post (pact)',
    pointer:  'FloatingKeepButton',
    keyboard: 'K',
    curl:     'POST /api/ingest/cell-event',
    producer: 'src/lib/keep-pact.ts',
    status:   'pending-curl-peer',  // curl exists but is event-beacon, not a ledger-write peer.
  },
  {
    name:     'revive',
    mouth:    'revive a fossil post',
    pointer:  'RevivalBadge',
    keyboard: null,                 // TODO: no published keybinding yet.
    curl:     'POST /api/revive',
    producer: 'src/lib/revival-engine.ts',
    // v175 PR-A (Mike napkin §3.1, Elon §5.1): honest status. The row
    // already declares `pending: 'keyboard'`; the status literal now
    // matches that debt. `wiredActions()` drops from 3 → 2;
    // `readyToPromote()` returns `false` until the R chord lands.
    // Better "honest red" than "fake green".
    status:   'pending-keyboard',
    pending:  'keyboard',
  },
  {
    name:     'stance',
    mouth:    'record a reader stance after revival',
    pointer:  'StickyStanceBar',
    keyboard: null,                 // TODO: 1/2/3 chord proposed (agree/torn/disagree).
    curl:     'POST /api/stance',
    producer: 'src/lib/stance-ledger.ts',
    status:   'pending-keyboard',
    pending:  'keyboard',
  },
] as const;

// ── Pure lookups (no fs, no DOM, SSR-safe) ───────────────────────────────

/** Find an action by name. Returns `undefined` when unknown — callers
 *  decide whether the miss is fatal or a diagnostic. */
export function findAction(name: string): TriMouthAction | undefined {
  return TRI_MOUTH_ACTIONS.find((a) => a.name === name);
}

/** Every action whose `status` begins with `wired` — i.e. all three
 *  mouths actually route through the single producer. Drives the
 *  guard's summary line (Mike §9 acceptance criteria). */
export function wiredActions(): readonly TriMouthAction[] {
  return TRI_MOUTH_ACTIONS.filter((a) => a.status.startsWith('wired'));
}

/** Every action still owing a mouth. The guard counts these in --warn. */
export function pendingActions(): readonly TriMouthAction[] {
  return TRI_MOUTH_ACTIONS.filter((a) => a.pending !== undefined);
}

/** Extract `{ verb, path }` from a curl string, or `null` on shape miss.
 *  The guard uses this for invariant §5.2 (curl grammar) AND §5.3 (route
 *  resolution). Keeping the parser here means both callers agree. */
export function parseCurl(
  curl: string | null,
): { verb: TriMouthVerb; path: string } | null {
  if (curl === null) return null;
  const m = curl.match(/^([A-Z]+)\s+(\/api\/\S+)$/);
  if (!m) return null;
  const verb = m[1] as TriMouthVerb;
  if (!(TRI_MOUTH_VERBS as readonly string[]).includes(verb)) return null;
  return { verb, path: stripQuery(m[2]) };
}

/** Drop `?...` / `#...` from a curl path — leaves the routable prefix. */
function stripQuery(raw: string): string {
  const q = raw.indexOf('?');
  const h = raw.indexOf('#');
  const cut = [q, h].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  return cut === undefined ? raw : raw.slice(0, cut);
}

/** Count of (missing-pointer, missing-keyboard, missing-curl) rows. One
 *  tuple = one line in the guard's summary. Pure — no fs, no side effects. */
export function pendingSummary(): Readonly<{
  keyboard: number; curl: number; pointer: number;
}> {
  const by = (p: TriMouthPending) =>
    TRI_MOUTH_ACTIONS.filter((a) => a.pending === p).length;
  return { keyboard: by('keyboard'), curl: by('curl'), pointer: by('pointer') };
}

// ── Promotion gate (the `--error` flip criterion) ────────────────────────
//
// Mike §5, Krystle's clock-migration cadence: flip --warn → --error when
// the inventory has ≥ 5 rows AND ≥ 3 of them are wired. This tiny pure
// predicate lives beside the literal so the guard, the tests, and any
// future CI job all consult the SAME criterion (polymorphism-is-a-killer).

/** Minimum wired-count required before the guard flips to --error. */
export const PROMOTE_THRESHOLD_WIRED = 3;
/** Minimum total rows required before the guard flips to --error. */
export const PROMOTE_THRESHOLD_TOTAL = 5;

/** True when the inventory has paid enough wedges for the --error flip. */
export function readyToPromote(): boolean {
  return TRI_MOUTH_ACTIONS.length >= PROMOTE_THRESHOLD_TOTAL
      && wiredActions().length     >= PROMOTE_THRESHOLD_WIRED;
}

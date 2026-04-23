// src/lib/journey-golden.ts
// v168 "Journey Witness" — static, frozen fixture table for the user
// journey the site delivers: a community post must be submit-able and,
// once accepted, become retrievable. This module is the `journey-witness`
// equivalent of `citation-golden.ts` — frozen literals that make the
// user-facing contract visible in `git diff` at review time.
//
// Scope of this sprint (Mike napkin §4 file-by-file, Elon §5.3 "witness
// a user outcome, not a token rule"):
//
//     submit → read
//
// The endanger → revive → verdict legs are NOT yet fixtured — see
// §TODO at the bottom. They require a clock seam (`src/lib/now.ts` does
// not expose one yet) and ADMIN_SECRET injection for `verdict-resolve`.
// The first two mouths are the highest-value user outcome: Elon's §5.3
// explicitly names "submit → read" as the minimum of the five-step
// lifecycle the site promises, and Paul's discipline (byte-exact where
// possible, shape-exact where not) carries without the clock seam.
//
// Discipline (Sid §≤-10-LOC-per-function, Mike §5 one-oracle):
//   · Pure producer. No DOM, no network, no fs writes, no wall-clock,
//     no Date.now. SSR/test-safe.
//   · Every value is a literal. The PoW nonce was precomputed offline
//     (see §How-the-nonce-was-found at §6 below) and baked in so the
//     test is hermetic and fast (no rehash loop at guard time).
//   · Sentinel author / IP — never a real reader. RFC 6761 `.test`
//     discipline mirrors `SENTINEL_ORIGIN` in `citation-golden.ts:43`.
//
// Credits: Mike Koch ("Journey Witness" napkin §1 one-feature, §2 napkin
//          diagram, §4 file-by-file, §6 grow-the-library handler-dispatch
//          promotion, §7 clock/DB seams, §8 "guard is the canary"), Elon
//          (§5.3 submit→read→endanger→revive→verdict, §5 "replace one
//          guard slot with a user-flow smoke test"), Paul Kim (static
//          fixtures · byte-exact oracle · one sprint of closure + one
//          sprint of witness discipline carried over from v155), Tanya
//          Donska ("API parity with web UI is load-bearing" — the guard
//          talks to the real APIRoute handler, never a mock), Sid
//          (motto "code maintenance without tests" — fixtures over
//          runners), AGENTS.md (freeze, polymorphism-is-a-killer),
//          citation-golden.ts (the template this file copies), 2026-04-23.

// ── Types — shape of the journey-step fixture table ───────────────────────

/**
 * One step of the journey. The `step` name is the column header in the
 * fail-fast guard output; the reviewer's `git diff` is the CI.
 */
export type JourneyStepName =
  | 'submit-happy-path'
  | 'submit-invalid-json'
  | 'submit-missing-title'
  | 'submit-body-too-short'
  | 'submit-bad-pow'
  | 'read-empty-store';

/** Expected wire-level outcome for a step. Status code is byte-exact;
 *  body is matched by a small shape predicate rather than byte-equality
 *  because the happy path embeds `Math.random` (slug) and `new Date`
 *  (publishedAt). The status code IS byte-exact; the shape keys ARE
 *  byte-exact. Shape values are type-checked, not literal-equal. */
export interface JourneyExpected {
  readonly status: number;
  readonly bodyKeys: readonly string[];
  readonly bodyLiteral?: Readonly<Record<string, unknown>>;
}

export interface JourneyStep {
  readonly step: JourneyStepName;
  readonly description: string;
  readonly expected: JourneyExpected;
}

// ── Sentinel inputs — one author, one IP, never a real reader ─────────────

export const SENTINEL_AUTHOR_LABEL = 'a.test';
export const SENTINEL_IP           = '127.0.0.10'; // intentionally not loopback-proper; keeps the fixture away from any real x-forwarded-for test match.

// ── Frozen PoW submission — literal body, literal nonce, literal hash ─────
//
// How the nonce was found (documented here so the reviewer can re-run
// and see the number didn't move): given `title` + `body` below, the
// script at `scripts/check-user-journey.ts` recomputes SHA-256 of
// (title + '\n' + body) → contentHash, then asserts that
//   sha256(contentHash + ':' + POW_NONCE) === POW_HASH
// and `POW_HASH.startsWith('0000')`. If any of {title, body, nonce,
// hash} ever drifts, the guard re-computes and prints the row
// coordinate — the fix is to bake the new nonce into this literal.
//
// The content body is 67 words (MIN_WORDS=50 at time of freeze) —
// cross-product of the `/api/submit-post` validator in
// `src/pages/api/submit-post.ts:44-67`.

export const POW_TITLE = 'Journey Witness smoke test' as const;

export const POW_BODY =
  'The endangered moment is the felt killer feature. ' +
  'Warmth sits at the top of the feed and cold stone settles at the bottom. ' +
  'Readers can revive posts before they fade to ghost. ' +
  'Click, hold, confirm; motion answers action. ' +
  'Tokens stay single source. ' +
  'Byte exact payloads prove the wire contract holds steady across three mouths: ' +
  'click, keystroke, terminal. ' +
  'One oracle, one grid, one witness for the whole lifecycle.' as const;

export const POW_NONCE = 46408 as const;
export const POW_HASH  = '0000f67e67d84fe4df4b84e50600a8ec987e6894ea3df3d38204e420a92f6ac9' as const;

/** Sanity: the difficulty prefix the submit-post handler enforces. The
 *  guard also asserts this independently — duplication is OK because the
 *  handler's `DIFFICULTY` is private, and this constant is the oracle's
 *  public shadow. If the server ever bumps difficulty, this constant and
 *  the nonce both move in the same PR. */
export const POW_DIFFICULTY = '0000' as const;

// ── Journey steps — row-major, lifecycle order ────────────────────────────
//
// Each row answers Mike §2 napkin ("iterates fixture rows") + Elon §5.3
// (a user outcome per row). The first five rows exercise the `submit`
// mouth in its five wire-contract branches; the sixth row exercises the
// `read` mouth on an empty store (invariant: getLivePosts() returns []).
// No row reaches the DB on a real deploy — the guard must set
// COMMUNITY_DB_PATH=:memory: (see scripts/check-user-journey.ts).

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  {
    step: 'submit-happy-path',
    description: 'valid PoW + MIN_WORDS body → 200 + postId + publishedAt',
    expected: {
      status: 200,
      bodyKeys: ['ok', 'postId', 'title', 'proofHash', 'publishedAt'],
      bodyLiteral: { ok: true, title: POW_TITLE, proofHash: POW_HASH },
    },
  },
  {
    step: 'submit-invalid-json',
    description: 'non-JSON body → 400 invalid_json',
    expected: {
      status: 400,
      bodyKeys: ['error'],
      bodyLiteral: { error: 'invalid_json' },
    },
  },
  {
    step: 'submit-missing-title',
    description: 'empty title → 400 title_required',
    expected: {
      status: 400,
      bodyKeys: ['error'],
      bodyLiteral: { error: 'title_required' },
    },
  },
  {
    step: 'submit-body-too-short',
    description: '<50 words → 400 body_too_short',
    expected: {
      status: 400,
      bodyKeys: ['error'],
      bodyLiteral: { error: 'body_too_short' },
    },
  },
  {
    step: 'submit-bad-pow',
    description: 'valid-looking hash that does not start with difficulty → 400 pow_invalid',
    expected: {
      status: 400,
      bodyKeys: ['error'],
      bodyLiteral: { error: 'pow_invalid' },
    },
  },
  {
    step: 'read-empty-store',
    description: 'before the happy-path submit, live post list is []',
    expected: {
      status: 200,
      bodyKeys: ['live'],
      bodyLiteral: { live: 0 },
    },
  },
] as const;

/** Expected row count — a second check on top of the shape assertions.
 *  If the lifecycle ever grows (endanger → revive → verdict wired in),
 *  this number moves in the same PR. */
export const JOURNEY_STEP_COUNT: number = JOURNEY_STEPS.length;

/** Lookup helper — the one oracle `journeyExpectedFor(step)` Mike §7
 *  names. Stateless; 3-line pure filter. */
export function journeyExpectedFor(step: JourneyStepName): JourneyExpected {
  const row = JOURNEY_STEPS.find((r) => r.step === step);
  if (!row) throw new Error(`journey-golden: unknown step "${step}"`);
  return row.expected;
}

// ── TODO — deferred mouths (endanger, revive, verdict) ────────────────────
//
// These three steps complete Elon's §5.3 five-step lifecycle. They need:
//   · endanger: a clock seam so `decayFactor(pubDateISO)` sees a
//     synthetic "now" without touching Date.now(). `src/lib/now.ts`
//     today is a freshness/decay math module, not an injectable clock.
//     Proposed extraction: a `src/lib/clock.ts` with
//       export const now = () => Date.now();
//     and every domain file imports `now` instead of `Date.now`.
//   · revive: needs a blog post slug (uses `getCollection('blog')`
//     which depends on the Astro content pipeline). One option is to
//     route the revive mouth through a community post (already in DB)
//     — the revive handler already falls back to `communityPosts` at
//     src/pages/api/revive.ts:60-66.
//   · verdict: needs ADMIN_SECRET injection + RFC 3161 stamp mocking
//     (external network call). Shape-only assertion is the pragmatic
//     witness; literal assertion waits for an offline TSA stub.
//
// When these land, append to JOURNEY_STEPS (row-major order preserved)
// and update JOURNEY_STEP_COUNT. The guard will then witness the full
// five-step lifecycle per Mike napkin §1.

// TODO: journey-witness step 3 — endanger (needs src/lib/clock.ts seam)
// TODO: journey-witness step 4 — revive (needs blog-slug or community-post precondition)
// TODO: journey-witness step 5 — verdict-resolve (needs ADMIN_SECRET + offline TSA stub)

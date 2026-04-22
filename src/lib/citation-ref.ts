// src/lib/citation-ref.ts
// v156 "Third Mouth" — the shared nonce grammar for the citation trilogy.
//
// One regex, one validator, four callers:
//   · src/lib/client/arrival.ts            (reads `?r=<nonce>` on arrival)
//   · src/lib/client/cell-cite.ts          (mints a nonce per copy — indirect)
//   · src/lib/cell-event-ledger.ts         (server validator for `record(row)`)
//   · src/pages/api/docs/cite.ts           (terminal mouth — validates on read)
//
// Why promote it?
//   Before v156 this regex lived (identically) inside arrival.ts AND
//   cell-event-ledger.ts. Two copies = two places to drift. Mike's §1
//   "polymorphism is a killer" applies to constants too — a regex under
//   two names is still polymorphism by the back door. One module removes
//   the drift vector entirely; every mouth reads the same shape.
//
// Anti-scope (Sid §10-line rule, Mike §5 keep-it-boring):
//   · Pure functions. No DOM, no URL parsing, no fs, no fetch.
//   · No mint/minting. Refs are client-generated nonces; the oracle
//     producer in stage-axes.ts consumes whatever the caller supplies.
//   · No server-side fallback. If a caller wants "minimum-length nonce"
//     it passes its own, or it passes none.
//
// Credits: Mike Koch (napkin §6.1 "one regex, one place"), Elon Musk
//          (§5 "subtract the duplicate"), Paul Kim (§7 API-parity vow —
//          the third mouth MUST reject the same shapes the first two
//          do), v154 authors of arrival.ts + cell-event-ledger.ts (the
//          regex was already correct — we're just giving it a home),
//          AGENTS.md freeze. Sid — 2026-04-22. Motto: "code maintenance
//          without tests."

// ── The regex — frozen in one place ───────────────────────────────────────
//
// Shape: [A-Za-z0-9-]{8,64}. Accepts:
//   · `crypto.randomUUID()` output (36 chars, hyphens + hex).
//   · 16-hex fallback from Math.random pairs.
//   · Any URL-safe opaque identifier the caller wants, up to 64 chars.
// Rejects:
//   · Empty string (length < 8).
//   · Slashes, query-strings, fragment chars, whitespace, `<`, `>`, `"`.
//   · Anything longer than 64 chars (defence against pathological URLs).

/** The single regex for a citation nonce. Exported so callers who must
 *  embed the pattern in a larger parser can reach the exact source.    */
export const REF_RE: RegExp = /^[a-zA-Z0-9-]{8,64}$/;

/** The query-parameter name under which the nonce rides. `?r=<nonce>`
 *  in the citation URL — frozen since v150c. */
export const REF_PARAM: string = 'r';

// ── isValidRef — pure, null-safe, throw-free ─────────────────────────────

/**
 * True iff `raw` is a non-null, REF_RE-conforming string.
 *
 * Accepts `string | null | undefined` so URL-parser output
 * (`searchParams.get(...)`) can be fed directly without an extra guard.
 * Never throws — an exception here would break the citation ritual, and
 * the ritual is the product.
 */
export function isValidRef(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && REF_RE.test(raw);
}

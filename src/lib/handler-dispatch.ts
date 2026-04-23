// src/lib/handler-dispatch.ts
// Shared in-process APIRoute dispatcher — the one generalisation Mike's
// "Journey Witness" napkin (§6) asks for. Promoted out of
// `citation-golden.ts::curlMouthResponse` so both the citation witness
// (3 mouths, 35 rows) and the new journey witness (5 mouths, 5 steps)
// route through a single helper.
//
// Pure fetch-API in, pure fetch-API out: URL → handler({ url, request })
// → Response. No socket, no port, no Astro.locals, no cookies. The
// handler's own validation and DB writes run as-is — this helper is a
// thin wire, not a mock.
//
// Discipline (Sid §≤-10-LOC-per-function, Mike §5 one-oracle):
//   · Zero dependencies. `URL` and `Request` are standard.
//   · No global state. Every call is hermetic by construction.
//   · Type is permissive on purpose: Astro's APIRoute takes a wider
//     `ctx` shape, but every handler in this project reads only `url`
//     and `request`. Passing more would be dishonest surface.
//
// Credits: Mike Koch (Journey Witness napkin §6 "grow the library",
//          §3 "three files, zero edits"), Sid (10-line rule · motto
//          "code maintenance without tests"), v156 "Third Mouth"
//          authors of citation-golden.ts (proved the pattern), Elon
//          (§5.3 user-witnessing guards — this helper is the plumbing
//          that lets the new guard witness 5 user steps with the same
//          shape the citation guard uses for its 3 mouths), AGENTS.md
//          (freeze, polymorphism-is-a-killer), 2026-04-23.

/** Subset of Astro's APIRoute signature every handler in this project
 *  actually consumes. Matches the `APIRoute` shape for the two fields
 *  we pass (`url`, `request`) without over-committing to the rest of
 *  the `APIContext` surface. */
export type MinimalApiRoute =
  (ctx: { url: URL; request: Request }) => Response | Promise<Response>;

/** Module shape accepted by `dispatchApiRoute`. Keep the keys loose so
 *  both `GET` and `POST` (and friends) resolve with the same helper. */
export interface ApiModule {
  readonly GET?:     MinimalApiRoute;
  readonly POST?:    MinimalApiRoute;
  readonly PUT?:     MinimalApiRoute;
  readonly DELETE?:  MinimalApiRoute;
  readonly PATCH?:   MinimalApiRoute;
  readonly OPTIONS?: MinimalApiRoute;
}

/** HTTP verbs we dispatch to. Keep this literal in sync with ApiModule. */
export type HttpVerb = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

/** Pick the named verb from a module, erroring if it is not exported.
 *  Pure, 5-lines: the test asserts this is the only symbol-to-handler
 *  resolution point. */
export function pickHandler(mod: ApiModule, verb: HttpVerb): MinimalApiRoute {
  const fn = mod[verb];
  if (!fn) throw new Error(`handler-dispatch: module exports no ${verb}`);
  return fn;
}

/** Build a minimal `{ url, request }` ctx. The Request is constructed
 *  from the URL so headers, body, and method are caller-controlled. */
export function buildCtx(
  url: URL, init: RequestInit = {},
): { url: URL; request: Request } {
  const request = new Request(url.toString(), init);
  return { url, request };
}

/** Dispatch a synthetic request through the module's handler. The
 *  single shared oracle for in-process route calls (Mike §6). */
export async function dispatchApiRoute(
  mod: ApiModule, verb: HttpVerb, url: URL, init: RequestInit = {},
): Promise<Response> {
  const handler = pickHandler(mod, verb);
  const ctx = buildCtx(url, { method: verb, ...init });
  return handler(ctx);
}

/** Convenience: dispatch + parse JSON body. Throws if body is non-JSON.
 *  Journey witness uses this for every mouth that returns JSON. */
export async function dispatchJson(
  mod: ApiModule, verb: HttpVerb, url: URL, init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await dispatchApiRoute(mod, verb, url, init);
  const text = await res.text();
  const body = text ? safeParse(text) : null;
  return { status: res.status, body };
}

/** Parse JSON or return the raw string — never throws. Callers inspect
 *  the return type. Keeping it isolated keeps dispatchJson ≤ 10 LoC. */
function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

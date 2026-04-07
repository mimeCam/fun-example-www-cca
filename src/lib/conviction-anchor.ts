// src/lib/conviction-anchor.ts
// External tamper-evident anchor for conviction seals and verdict outcomes.
// One Gist per post — verdict PATCH appends to the same file.
// GitHub preserves full revision history: author can't erase sealed records.
// Fail-open by contract: caller catches errors; local seal is the source of truth.
// PAT scope required: gist only. Never reach for a broader token.
//
// Credits: Mike (Conviction Anchor Pipeline spec)

const GIST_API = 'https://api.github.com/gists';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnchorReceipt {
  gistId: string;
  url: string;      // https://gist.github.com/{id}  — stable, human-readable
  rawUrl: string;   // direct JSON link — used by verifier; no HTML scraping needed
  publishedAt: number;
}

// ---------------------------------------------------------------------------
// Pure helpers — no side effects
// ---------------------------------------------------------------------------

/** Canonical anchor JSON written to the Gist file at seal time. */
export function buildGistPayload(
  slug: string, score: number, hmac: string, ts: number,
): string {
  return JSON.stringify({ slug, score, hmac, sealedAt: ts }, null, 2);
}

function gistFilename(slug: string): string {
  return `conviction-${slug}.json`;
}

function gistHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// ---------------------------------------------------------------------------
// GitHub API calls — each does exactly one HTTP action
// ---------------------------------------------------------------------------

type GistCreateResponse = {
  id: string;
  html_url: string;
  files: Record<string, { raw_url: string }>;
};

async function createGist(
  slug: string, content: string, pat: string,
): Promise<GistCreateResponse> {
  const filename = gistFilename(slug);
  const body = JSON.stringify({
    description: `conviction-${slug}`,
    public: true,
    files: { [filename]: { content } },
  });
  const res = await fetch(GIST_API, { method: 'POST', headers: gistHeaders(pat), body });
  if (!res.ok) throw new Error(`Gist create failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GistCreateResponse>;
}

async function fetchGistContent(gistId: string, slug: string, pat: string): Promise<string> {
  const res = await fetch(`${GIST_API}/${gistId}`, { headers: gistHeaders(pat) });
  if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
  const data = await res.json() as { files: Record<string, { content: string }> };
  return data.files[gistFilename(slug)]?.content ?? '{}';
}

async function patchGist(gistId: string, slug: string, content: string, pat: string): Promise<void> {
  const body = JSON.stringify({ files: { [gistFilename(slug)]: { content } } });
  const res = await fetch(`${GIST_API}/${gistId}`, { method: 'PATCH', headers: gistHeaders(pat), body });
  if (!res.ok) throw new Error(`Gist patch failed: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Public API — two named functions, no shared polymorphic interface
// ---------------------------------------------------------------------------

/**
 * Create a new public GitHub Gist anchoring a conviction seal.
 * Returns a receipt with gistId + stable URL + raw URL for verification.
 * Throws on GitHub failure — caller must wrap in try/catch (fail-open pattern).
 */
export async function anchorConviction(
  slug: string, score: number, hmac: string, sealedAt: number, pat: string,
): Promise<AnchorReceipt> {
  const content = buildGistPayload(slug, score, hmac, sealedAt);
  const data = await createGist(slug, content, pat);
  const rawUrl = data.files[gistFilename(slug)]?.raw_url ?? '';
  return { gistId: data.id, url: data.html_url, rawUrl, publishedAt: Date.now() };
}

/**
 * Append a verdict block to the existing conviction Gist for this post.
 * Fetches current content, merges verdict, PATCHes the file.
 * GitHub revision history makes the original seal immutable even after this update.
 * Throws on GitHub failure — caller must wrap in try/catch (fail-open pattern).
 */
export async function anchorVerdict(
  gistId: string, slug: string,
  verdict: string, verdictHmac: string, sealedAt: number,
  pat: string,
): Promise<void> {
  const existing = await fetchGistContent(gistId, slug, pat);
  const parsed = JSON.parse(existing) as Record<string, unknown>;
  parsed.verdict = { outcome: verdict, hmac: verdictHmac, sealedAt };
  await patchGist(gistId, slug, JSON.stringify(parsed, null, 2), pat);
}

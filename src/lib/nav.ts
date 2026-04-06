// src/lib/nav.ts
// Shared navigation helpers — framework-agnostic, SSR-safe.

/** Canonical page IDs for the 6-page sitemap. */
export type PageId = 'home' | 'now' | 'wall' | 'blog'
  | 'graveyard' | 'unknown';

const PAGE_PREFIXES: [string, PageId][] = [
  ['/now', 'now'],
  ['/wall', 'wall'],
  ['/blog', 'blog'],
  ['/graveyard', 'graveyard'],
];

/** Derives the active PageId from a pathname string. SSR-safe. */
export function getActivePage(pathname: string): PageId {
  const clean = pathname.split('?')[0].split('#')[0];
  if (clean === '/' || clean === '') return 'home';
  for (const [prefix, id] of PAGE_PREFIXES) {
    if (clean === prefix || clean.startsWith(prefix + '/')) return id;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testNav(): void {
  console.assert(getActivePage('/') === 'home', 'root → home');
  console.assert(getActivePage('/now') === 'now', '/now');
  console.assert(getActivePage('/now/') === 'now', '/now/');
  console.assert(getActivePage('/wall?q=1') === 'wall', 'query');
  console.assert(getActivePage('/wall#top') === 'wall', 'hash');
  console.assert(getActivePage('/blog/hello') === 'blog', 'blog slug');
  console.assert(getActivePage('/xyz') === 'unknown', 'unknown');
  console.log('[nav] OK — getActivePage verified');
}

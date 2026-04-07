// src/lib/nav.ts
// Shared navigation helpers — framework-agnostic, SSR-safe.
// /now is a first-class page (Tanya §3 — sitemap revision).

/** Canonical page IDs for the sitemap. */
export type PageId = 'home' | 'blog' | 'graveyard' | 'now' | 'verdict' | 'predictions' | 'audit' | 'unknown';

const PAGE_PREFIXES: [string, PageId][] = [
  ['/blog',        'blog'],
  ['/graveyard',   'graveyard'],
  ['/now',         'now'],
  ['/verdict',     'verdict'],
  ['/predictions', 'predictions'],
  ['/audit',       'audit'],
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
  console.assert(getActivePage('/')            === 'home',      'root -> home');
  console.assert(getActivePage('/blog/hello')  === 'blog',      'blog slug');
  console.assert(getActivePage('/graveyard')   === 'graveyard', 'graveyard');
  console.assert(getActivePage('/now')         === 'now',       '/now -> now');
  console.assert(getActivePage('/now/')        === 'now',       '/now/ -> now');
  console.assert(getActivePage('/verdict')      === 'verdict',   '/verdict -> verdict');
  console.assert(getActivePage('/audit/foo')   === 'audit',     '/audit/* -> audit');
  console.assert(getActivePage('/wall')        === 'unknown',   '/wall removed');
  console.assert(getActivePage('/xyz')         === 'unknown',   'unknown');
  console.assert(getActivePage('/blog?q=1')    === 'blog',      'query strip');
  console.assert(getActivePage('/graveyard#t') === 'graveyard', 'hash strip');
  console.log('[nav] OK — getActivePage verified');
}

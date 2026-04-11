// src/lib/pagination.ts
// Generic pagination utilities — graveyard-first, reusable for any list.
// Pure functions; zero side-effects; zero DB access.
// Credits: Mike (arch §4.1 — napkin plan), Tanya (UX §3 — graveyard pagination)

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Slice an array to one page and return accompanying meta. */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; pagination: PaginationMeta } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage   = clampPage(page, totalPages);
  const start      = (safePage - 1) * pageSize;
  return {
    items:      items.slice(start, start + pageSize),
    pagination: buildMeta(safePage, pageSize, totalItems, totalPages),
  };
}

/** Clamp page to [1, maxPage]. Silently handles NaN / out-of-range. */
export function parsePage(raw: string | null, maxPage = Infinity): number {
  const n = parseInt(raw ?? '1', 10);
  return clampPage(Number.isFinite(n) ? n : 1, maxPage);
}

/** Build a URL preserving all existing params, overriding page only. */
export function paginateURL(base: URL, page: number): string {
  const u = new URL(base.toString());
  u.searchParams.set('page', String(page));
  return u.pathname + u.search;
}

// ── private ──────────────────────────────────────────────────────────────────

function clampPage(n: number, max: number): number {
  return Math.min(Math.max(1, n), Math.max(1, max));
}

function buildMeta(
  page: number, pageSize: number, totalItems: number, totalPages: number,
): PaginationMeta {
  return { page, pageSize, totalItems, totalPages,
    hasPrev: page > 1, hasNext: page < totalPages };
}

// ── sanity checks ─────────────────────────────────────────────────────────────

export function _testPagination(): void {
  const items = Array.from({ length: 45 }, (_, i) => i);

  const p1 = paginate(items, 1, 20);
  console.assert(p1.items.length === 20,             'page 1 = 20 items');
  console.assert(p1.pagination.totalPages === 3,     '45 items / 20 = 3 pages');
  console.assert(!p1.pagination.hasPrev,             'no prev on page 1');
  console.assert(p1.pagination.hasNext,              'has next on page 1');

  const p3 = paginate(items, 3, 20);
  console.assert(p3.items.length === 5,              'page 3 = 5 remaining');
  console.assert(!p3.pagination.hasNext,             'no next on last page');

  // Clamp out-of-range
  const pOver = paginate(items, 99, 20);
  console.assert(pOver.pagination.page === 3,        'over-clamp to last page');
  const pUnder = paginate(items, -5, 20);
  console.assert(pUnder.pagination.page === 1,       'under-clamp to page 1');

  // Empty list
  const empty = paginate([], 1, 20);
  console.assert(empty.pagination.totalPages === 1,  'empty = 1 page');

  // parsePage
  console.assert(parsePage(null) === 1,              'null → 1');
  console.assert(parsePage('0') === 1,               '0 → 1');
  console.assert(parsePage('abc') === 1,             'NaN → 1');
  console.assert(parsePage('2', 3) === 2,            '2 within bounds');
  console.assert(parsePage('9', 3) === 3,            '9 clamped to 3');

  // paginateURL
  const u = new URL('http://localhost/?stage=graveyard&page=1');
  const href = paginateURL(u, 3);
  console.assert(href.includes('page=3'),            'page=3 in href');
  console.assert(href.includes('stage=graveyard'),   'stage preserved');

  console.log('[pagination] OK — all checks passed');
}

// src/lib/client/trust-badge-ceremony.ts
// Client-side TrustBadge flip ceremony — polls for state changes, drives 3D flip.
//
// Responsibilities:
//   mount  — find all [data-badge-slug] on the page, start polling per badge
//   poll   — GET /api/conviction-stats?slug=… every 5s
//   delta  — compare polled state against current DOM state
//   flip   — pre-populate back face, add .is-flipping, listen for animationend
//   guard  — one-way state transitions only (can't go backwards)
//   lock   — flip in progress blocks new incoming state changes
//   cleanup — clearInterval on Astro view-transition navigation
//
// Design decision: poll over SSE — conviction state changes once per lifetime
// (seal, verdict). SSE would hold a TCP connection open indefinitely for two
// events. 5s polling costs ~1 KB/min and lands within perception threshold.
//
// Credits: Mike (§trust-badge-ceremony spec), Elon (ceremony timing spec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConvictionStage = 'unsealed' | 'pending' | 'sealed' | 'upheld' | 'overturned';

interface SlugStats {
  slug:             string;
  conviction_stage: ConvictionStage;
  sealed_at:        number | null;
  verdict:          'upheld' | 'overturned' | null;
}

interface BadgeElements {
  flip:  HTMLElement;
  card:  HTMLElement;
  front: HTMLElement;
  back:  HTMLElement;
}

// ---------------------------------------------------------------------------
// State order — one-way transition guard
// ---------------------------------------------------------------------------

const STAGE_ORDER: Record<ConvictionStage, number> = {
  unsealed:   0,
  pending:    1,
  sealed:     2,
  upheld:     3,
  overturned: 3,
};

function isValidTransition(from: ConvictionStage, to: ConvictionStage): boolean {
  if (from === to) return false;
  if (STAGE_ORDER[to] <= STAGE_ORDER[from]) return false;
  // sealed can only go to upheld or overturned, not back to pending
  if (from === 'upheld' || from === 'overturned') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Badge content generation — mirrors TrustBadge.astro server-render logic
// ---------------------------------------------------------------------------

const STAGE_ICON: Record<ConvictionStage, string> = {
  unsealed:   '◌',
  pending:    '◷',
  sealed:     '⏱',
  upheld:     '✓',
  overturned: '✗',
};

const STAGE_LABEL: Record<ConvictionStage, string> = {
  unsealed:   'unsealed',
  pending:    'timestamp pending',
  sealed:     'sealed · awaiting verdict',
  upheld:     'upheld',
  overturned: 'overturned',
};

function isLinkedState(stage: ConvictionStage): boolean {
  return stage === 'upheld' || stage === 'overturned';
}

function buildBadgeHTML(stage: ConvictionStage, slug: string): string {
  const icon  = STAGE_ICON[stage];
  const label = STAGE_LABEL[stage];
  const inner = `<span class="badge-icon" aria-hidden="true">${icon}</span>`
              + `<span class="badge-text">${label}</span>`;
  if (isLinkedState(stage)) {
    return `<a href="/audit/${slug}" class="badge-inner" title="RFC 3161 timestamp — click for full proof">${inner}</a>`;
  }
  return `<span class="badge-inner">${inner}</span>`;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function findBadgeElements(flip: HTMLElement): BadgeElements | null {
  const card  = flip.querySelector<HTMLElement>('.badge-card');
  const front = flip.querySelector<HTMLElement>('.badge-face--front');
  const back  = flip.querySelector<HTMLElement>('.badge-face--back');
  if (!card || !front || !back) return null;
  return { flip, card, front, back };
}

function currentStage(flip: HTMLElement): ConvictionStage {
  return (flip.dataset.badgeState as ConvictionStage) ?? 'unsealed';
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000;

async function fetchSlugStats(slug: string): Promise<SlugStats | null> {
  try {
    const res = await fetch(`/api/conviction-stats?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return await res.json() as SlugStats;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Flip ceremony
// ---------------------------------------------------------------------------

/** Read --motion-ceremony-duration in ms from CSS. Falls back to 600. */
function ceremonyDurationMs(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-ceremony-duration').trim();
  return parseInt(raw, 10) || 600;
}

/** Pre-populate back face, trigger .is-flipping, commit after back-face animation ends. */
function runFlipCeremony(els: BadgeElements, nextStage: ConvictionStage, slug: string): void {
  const { card, back } = els;

  // 1. Silently populate back face BEFORE animation starts (no flash frame)
  back.innerHTML = buildBadgeHTML(nextStage, slug);
  card.dataset.nextState = nextStage;

  // 2. Kick off the flip
  card.classList.add('is-flipping');

  // 3. Commit once the back-face (badge-flip-in) finishes.
  //    Back-face delay = 45% of ceremony, duration = 100%.
  //    Total: 1.45 × duration. Add 30ms buffer for paint.
  const dur = ceremonyDurationMs();
  const commitDelay = Math.ceil(dur * 1.45) + 30;

  // Prefer animationend on the back face for precision; fallback to timeout.
  let committed = false;
  function doCommit() {
    if (committed) return;
    committed = true;
    back.removeEventListener('animationend', doCommit);
    commitFlip(els, nextStage, slug);
  }
  back.addEventListener('animationend', doCommit, { once: true });
  setTimeout(doCommit, commitDelay);
}

function commitFlip(els: BadgeElements, nextStage: ConvictionStage, slug: string): void {
  const { flip, card, front, back } = els;

  // Swap: front gets the new content, back is cleared
  front.innerHTML = back.innerHTML;
  back.innerHTML  = '';
  back.style.opacity = '0';

  // Update state on the wrapper (CSS token re-render)
  flip.dataset.badgeState = nextStage;
  card.classList.remove('is-flipping');

  // Settle animation
  card.classList.add('is-settling');
  setTimeout(() => {
    card.classList.remove('is-settling');
    card.classList.add('is-settled');
    delete card.dataset.nextState;
  }, 350);
}

// ---------------------------------------------------------------------------
// Per-badge watcher
// ---------------------------------------------------------------------------

function watchBadge(flip: HTMLElement): () => void {
  let isFlipping = false;

  const els = findBadgeElements(flip);
  if (!els) return () => {};

  const slug = flip.dataset.badgeSlug;
  if (!slug) return () => {};

  async function poll() {
    if (isFlipping) return;  // flip lock — don't process stale state during ceremony

    const stats = await fetchSlugStats(slug);
    if (!stats) return;

    const current = currentStage(flip);
    const next    = stats.conviction_stage;

    if (!isValidTransition(current, next)) return;

    isFlipping = true;
    runFlipCeremony(els, next, slug);

    // Release lock after ceremony completes (ceremony + settle + buffer)
    setTimeout(() => { isFlipping = false; }, 1200);
  }

  const id = setInterval(poll, POLL_INTERVAL_MS);
  return () => clearInterval(id);
}

// ---------------------------------------------------------------------------
// Mount — deduplication guard
// ---------------------------------------------------------------------------

const MOUNTED_ATTR = 'data-ceremony-mounted';
const cleanups: (() => void)[] = [];

export function mountBadgeCeremonies(): void {
  const badges = document.querySelectorAll<HTMLElement>('[data-badge-slug]');
  badges.forEach(badge => {
    if (badge.hasAttribute(MOUNTED_ATTR)) return;
    badge.setAttribute(MOUNTED_ATTR, '1');
    const cleanup = watchBadge(badge);
    cleanups.push(cleanup);
  });
}

// Cleanup on Astro view-transition page navigation
document.addEventListener('astro:before-preparation', () => {
  cleanups.splice(0).forEach(fn => fn());
  // Also reset mounted attrs so re-mount works on the new page
  document.querySelectorAll(`[${MOUNTED_ATTR}]`)
    .forEach(el => el.removeAttribute(MOUNTED_ATTR));
});

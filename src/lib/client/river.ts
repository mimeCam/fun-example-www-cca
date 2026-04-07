// src/lib/client/river.ts
// Client engine for the Conviction River (/map).
// Reads RiverPost[] from #river-data → runs 60s decay tick.
// SSR sets all initial positions and CSS vars; this module only
// keeps decay vars live as real time passes.
//
// One export: initRiver(). No framework. No deps. Zero fetches.
//
// Credits: Mike (architecture §5 — Client Engine Logic)

const TICK_MS = 60_000;
const DAY_MS  = 86_400_000;

// Minimal shape — only what the decay tick needs from the JSON payload.
interface RiverPost {
  slug: string;
  publishedAt: number;
  deadline: number;
}

function parseRiverPosts(el: HTMLElement): RiverPost[] {
  try { return JSON.parse(el.dataset.posts ?? '[]') as RiverPost[]; }
  catch { return []; }
}

/** Recompute decay visuals from current wall-clock time. */
function liveDecay(p: RiverPost, now: number): { opacity: string; blur: string; sat: string } {
  const span    = Math.max(1, p.deadline - p.publishedAt);
  const raw     = Math.min(1, Math.max(0, (now - p.publishedAt) / span));
  const over    = now > p.deadline ? Math.min(0.3, (now - p.deadline) / DAY_MS * 0.01) : 0;
  const f       = raw + over;
  return {
    opacity: String(+(Math.max(0.35, 1 - f * 0.65)).toFixed(3)),
    blur:    `${(f * 1.5).toFixed(2)}px`,
    sat:     String(+(1 - f * 0.4).toFixed(3)),
  };
}

/** Apply decay CSS vars to a single node element. */
function applyDecay(el: HTMLElement, p: RiverPost, now: number): void {
  const d = liveDecay(p, now);
  el.style.setProperty('--decay-opacity', d.opacity);
  el.style.setProperty('--decay-blur',    d.blur);
  el.style.setProperty('--decay-sat',     d.sat);
}

/** Run one tick: update all river node decay vars. */
function tickDecay(posts: RiverPost[]): void {
  const now = Date.now();
  for (const p of posts) {
    const el = document.querySelector<HTMLElement>(`[data-slug="${p.slug}"]`);
    if (el) applyDecay(el, p, now);
  }
}

/** rAF loop: fires tickDecay every TICK_MS. */
function startTick(posts: RiverPost[]): void {
  let last = 0;
  function frame(ts: number): void {
    if (ts - last >= TICK_MS) { last = ts; tickDecay(posts); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** Entry point — call once on DOMContentLoaded. */
export function initRiver(): void {
  const el = document.getElementById('river-data');
  if (!el) return;
  const posts = parseRiverPosts(el);
  if (posts.length === 0) return;
  startTick(posts);
}

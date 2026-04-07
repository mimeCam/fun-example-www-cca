// src/lib/river-data.ts
// Server-side adapter: PostDisplayData[] → RiverPost[] for the Conviction River.
// No new DB queries — delegates entirely to allPostDisplayData().
// Pure functions; zero side-effects.
//
// Credits: Mike (architecture §4 — Data Shape)

import { opacityFromDecay, blurFromDecay, saturationFromDecay } from './decay-engine';
import type { PostDisplayData } from './postMeta';

// ---------------------------------------------------------------------------
// Public shape — the only data the client river engine needs
// ---------------------------------------------------------------------------

export interface RiverPost {
  slug: string;
  title: string;
  url: string;
  publishedAt: number;    // unix ms
  deadline: number;       // unix ms — publishedAt + maxDays * 86_400_000
  decayOpacity: number;   // 0–1
  decayBlur: number;      // px value (no unit — CSS sets 'px')
  decaySat: number;       // 0–1
  verdict: 'still-true' | 'wrong' | 'abandoned' | 'unaudited' | null;
  daysRemaining: number;  // negative = overdue
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Map any conviction string to the river verdict union. 'evolved' → null (Tanya §9). */
function toVerdict(v: string | null | undefined): RiverPost['verdict'] {
  if (v === 'still-true' || v === 'wrong' || v === 'abandoned' || v === 'unaudited') return v;
  return null;
}

/** Adapt one PostDisplayData to a lean, JSON-safe RiverPost. */
function toRiverPost(p: PostDisplayData): RiverPost {
  const publishedAt = p.pubDate.getTime();
  return {
    slug:         p.slug,
    title:        p.title,
    url:          `/blog/${p.slug}/`,
    publishedAt,
    deadline:     publishedAt + p.maxDays * MS_PER_DAY,
    decayOpacity: opacityFromDecay(p.decay),
    decayBlur:    blurFromDecay(p.decay),
    decaySat:     saturationFromDecay(p.decay),
    verdict:      toVerdict(p.runtimeVerdict ?? p.conviction),
    daysRemaining: p.daysRemaining,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Convert display data to river posts. Filters nothing — caller decides. */
export function buildRiverPosts(posts: PostDisplayData[]): RiverPost[] {
  return posts.map(toRiverPost);
}

// ---------------------------------------------------------------------------
// Client IIFE — inline script for map.astro via <script set:html={...}>
// Same pattern as decayEngineClientScript() in decay-engine.ts.
// SSR pages' <script> module imports aren't bundled by Vite client build;
// inline IIFEs are the correct delivery mechanism for SSR-only pages.
// ---------------------------------------------------------------------------

/** Returns a self-contained IIFE string for the river decay tick. */
export function riverClientScript(): string {
  return `(function(){
  var TICK=60000,DAY=86400000;
  var el=document.getElementById('river-data');
  if(!el) return;
  var posts=[];
  try{posts=JSON.parse(el.dataset.posts||'[]')}catch(e){return}
  if(!posts.length) return;
  function decay(p,now){
    var span=Math.max(1,p.deadline-p.publishedAt);
    var raw=Math.min(1,Math.max(0,(now-p.publishedAt)/span));
    var over=now>p.deadline?Math.min(.3,(now-p.deadline)/DAY*.01):0;
    var f=raw+over;
    return{o:+(Math.max(.35,1-f*.65)).toFixed(3),b:(f*1.5).toFixed(2),s:+(1-f*.4).toFixed(3)};
  }
  function tick(){
    var now=Date.now();
    posts.forEach(function(p){
      var nd=document.querySelector('[data-slug="'+p.slug+'"]');
      if(!nd) return;
      var d=decay(p,now);
      nd.style.setProperty('--decay-opacity',String(d.o));
      nd.style.setProperty('--decay-blur',d.b+'px');
      nd.style.setProperty('--decay-sat',String(d.s));
    });
  }
  var last=0;
  function frame(ts){if(ts-last>=TICK){last=ts;tick()}requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testRiverData(): void {
  const fake = {
    slug: 'test', title: 'Test Post', description: '', url: '/blog/test/',
    pubDate: new Date('2026-01-01T00:00:00.000Z'), pubDateISO: '2026-01-01T00:00:00.000Z',
    readingTime: 1, decay: 0.3, freshness: 'recent' as const, decayStyle: '',
    revivalCount: 0, revivalWarm: false, readingSeconds: 0,
    entombed: false, entombedAt: null, endangered: false,
    endangeredUrgency: 'safe' as const, endangeredDaysLeft: 200,
    risenAt: null, recentlyRisen: false, conviction: 'still-true' as const,
    maxDays: 365, daysRemaining: 200, clockUrgency: 'safe' as const,
    tensionResult: null, causeOfDeath: null,
    runtimeVerdict: null, verdictSealedAt: null, verdictHmac: null,
  } as PostDisplayData;

  const posts = buildRiverPosts([fake]);
  console.assert(posts.length === 1, 'one post');
  console.assert(posts[0].slug === 'test', 'slug preserved');
  console.assert(posts[0].verdict === 'still-true', 'conviction from frontmatter when no runtime verdict');
  console.assert(posts[0].deadline > posts[0].publishedAt, 'deadline after publish');
  console.assert(posts[0].decayOpacity > 0 && posts[0].decayOpacity <= 1, 'valid opacity range');
  console.assert(posts[0].decayBlur >= 0, 'non-negative blur');
  console.assert(posts[0].decaySat > 0 && posts[0].decaySat <= 1, 'valid saturation range');

  // Runtime verdict wins over frontmatter
  const withRuntime = buildRiverPosts([{ ...fake, runtimeVerdict: 'wrong' as const } as PostDisplayData]);
  console.assert(withRuntime[0].verdict === 'wrong', 'runtime verdict wins');

  // 'evolved' maps to null (Tanya §9 — cut evolved)
  const evolved = buildRiverPosts([{ ...fake, conviction: 'evolved' as const, runtimeVerdict: null } as PostDisplayData]);
  console.assert(evolved[0].verdict === null, 'evolved maps to null');

  console.log('[river-data] OK — all checks passed');
}

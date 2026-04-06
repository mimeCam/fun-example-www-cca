// src/lib/epitaph-engine.ts
// Deterministic narrative epitaphs for entombed posts.
// Pure functions — no state, no DB, no Math.random().
// djb2(slug) % 3 variant selection: same data → same text every SSR render.
// Credits: Mike (arch §4.3), Tanya (UX §3.6)

export type SurvivalTier = 'legendary' | 'contested' | 'quiet' | 'forgotten';

type Template = (d: number, r: number, m: number) => string;
type Trio = [Template, Template, Template];

const T: Record<SurvivalTier, Trio> = {
  legendary: [
    (d, r) => `${d} days it resisted the dark. ${r > 1 ? `${r} times readers called it back. ` : ''}Still, the silence won.`,
    (d, _, m) => `${m > 0 ? `${m} reader-minutes` : 'Hours'} of attention. ${d} days of light. The clock ran out anyway.`,
    (d, r) => `Survived ${d} days. Revived ${r} ${r === 1 ? 'time' : 'times'}. The last reader never came.`,
  ],
  contested: [
    (_, r) => `A quiet idea, loved fiercely by ${r}. Not enough to hold back the dark.`,
    (d, r) => `${r} ${r === 1 ? 'reader' : 'readers'} remembered it across ${d} days. The rest of the world had moved on.`,
    (d, r) => `Revived ${r} ${r === 1 ? 'time' : 'times'} in ${d} days. Each time the clock reset. The last reset didn't hold.`,
  ],
  quiet: [
    (d) => `${d} days of light. Then nothing. The clock ran out quietly.`,
    (d) => `It lived past the first week. Made it to ${d} days. Not much further.`,
    (d) => `${d} days. Some ideas pass quietly through the world.`,
  ],
  forgotten: [
    () => `It published. The world moved on.`,
    () => `No one called it back. The dark came fast.`,
    (d) => `${d} ${d === 1 ? 'day' : 'days'}. Written. Read, maybe. Gone.`,
  ],
};

/** Unsigned 32-bit djb2 hash — deterministic variant selector. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

/** Four-tier survival classification. */
export function survivalTier(survivalDays: number, revivals: number): SurvivalTier {
  if (survivalDays > 90 || revivals > 10) return 'legendary';
  if (revivals >= 3)                       return 'contested';
  if (survivalDays > 14)                   return 'quiet';
  return 'forgotten';
}

/** Deterministic epitaph — djb2(slug) % 3 picks variant within tier. */
export function generateEpitaph(
  slug: string,
  survivalDays: number,
  revivals: number,
  readingMinutes: number,
): string {
  const tier = survivalTier(survivalDays, revivals);
  return T[tier][djb2(slug) % 3](survivalDays, revivals, readingMinutes);
}

/** Display label for a tier. */
export function tierLabel(tier: SurvivalTier): string {
  const L: Record<SurvivalTier, string> = {
    legendary: 'Legendary', contested: 'Contested', quiet: 'Quiet', forgotten: 'Forgotten',
  };
  return L[tier];
}

/** CSS class for a tier. */
export function tierCSSClass(tier: SurvivalTier): string {
  return `tier-${tier}`;
}

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------

function _testTiers(): void {
  console.assert(survivalTier(100, 0) === 'legendary',  '100 days = legendary');
  console.assert(survivalTier(10, 15) === 'legendary',  '15 revivals = legendary');
  console.assert(survivalTier(30, 5)  === 'contested',  '5 revivals = contested');
  console.assert(survivalTier(20, 1)  === 'quiet',      '20 days, 1 revival = quiet');
  console.assert(survivalTier(5, 0)   === 'forgotten',  '5 days = forgotten');
}

function _testEpitaphOutput(): void {
  const a = generateEpitaph('hello-world', 100, 5, 10);
  const b = generateEpitaph('hello-world', 100, 5, 10);
  console.assert(a === b, 'epitaph is deterministic');
  const c = generateEpitaph('abc', 5, 0, 0);
  console.assert(typeof c === 'string' && c.length > 0, 'non-empty string');
  console.assert(tierLabel('legendary') === 'Legendary', 'tier label');
  console.assert(tierCSSClass('forgotten') === 'tier-forgotten', 'css class');
}

export function _testEpitaphEngine(): void {
  _testTiers();
  _testEpitaphOutput();
  console.log('[epitaph-engine] OK — all checks passed');
}
